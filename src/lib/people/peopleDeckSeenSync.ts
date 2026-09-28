/**
 * Cross-device People deck seen sync: outbox, hydrate, flush, bootstrap gate.
 * Local mark stays instant; Supabase sync is best-effort and batched.
 */

import {
  getPeopleDeckSeen,
  markPeopleDeckSeen,
  PEOPLE_DECK_SEEN_MARK_CHUNK,
  type PeopleDeckSeenRow,
} from "../../api/services/peopleDeckSeen";
import { supabase } from "../supabaseClient";
import {
  hasPairUpSeenLocalHistory,
  markPairUpOpportunitySeen,
  mergePairUpSeenFromServer,
  type PairUpSeenScope,
} from "./peoplePairUpSeenHistory";

async function activeAuthUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id?.trim() || null;
  } catch {
    return null;
  }
}

export const PEOPLE_DECK_SEEN_OUTBOX_PREFIX =
  "echotoo_people_deck_seen_outbox_v1";
export const PEOPLE_DECK_SEEN_FLUSH_THRESHOLD = 15;
export const PEOPLE_DECK_SEEN_MAX_PENDING_AGE_MS = 10_000;
export const PEOPLE_DECK_SEEN_FRESH_DEVICE_GATE_MS = 2000;
export const PEOPLE_DECK_SEEN_HYDRATE_COOLDOWN_MS = 120_000;
export const PEOPLE_DECK_SEEN_FLUSH_ERROR_COOLDOWN_MS = 3000;

type OutboxV1 = { v: 1; ids: string[]; firstQueuedAtMs?: number };

type BootstrapState = "pending" | "ready";

const bootstrapReady = new Map<string, BootstrapState>();
const sessionHydratedAt = new Map<string, number>();
const hydrateInFlight = new Map<string, Promise<HydrateResult>>();
const flushInFlight = new Map<string, Promise<FlushResult>>();
const flushErrorUntil = new Map<string, number>();
const maxAgeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let hydrateGeneration = 0;

export type HydrateResult =
  | "merged"
  | "unchanged"
  | "failed"
  | "stale"
  | "skipped";

export type FlushResult = "flushed" | "empty" | "failed" | "stale" | "busy";

function flightKey(userId: string, scope: PairUpSeenScope): string {
  return `${userId.trim()}:${scope}`;
}

export function peopleDeckSeenOutboxStorageKey(
  userId: string,
  scope: PairUpSeenScope
): string {
  return `${PEOPLE_DECK_SEEN_OUTBOX_PREFIX}:${userId.trim()}:${scope}`;
}

function readOutbox(userId: string, scope: PairUpSeenScope): OutboxV1 {
  try {
    const raw = localStorage.getItem(
      peopleDeckSeenOutboxStorageKey(userId, scope)
    );
    if (!raw) return { v: 1, ids: [] };
    const parsed = JSON.parse(raw) as Partial<OutboxV1>;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.ids)) {
      return { v: 1, ids: [] };
    }
    const ids: string[] = [];
    const used = new Set<string>();
    for (const id of parsed.ids) {
      if (typeof id !== "string") continue;
      const t = id.trim();
      if (!t || used.has(t)) continue;
      used.add(t);
      ids.push(t);
    }
    const firstQueuedAtMs =
      typeof parsed.firstQueuedAtMs === "number" &&
      Number.isFinite(parsed.firstQueuedAtMs)
        ? parsed.firstQueuedAtMs
        : undefined;
    return { v: 1, ids, firstQueuedAtMs };
  } catch {
    return { v: 1, ids: [] };
  }
}

function writeOutbox(
  userId: string,
  scope: PairUpSeenScope,
  box: OutboxV1
): void {
  try {
    if (box.ids.length === 0) {
      localStorage.removeItem(peopleDeckSeenOutboxStorageKey(userId, scope));
      return;
    }
    localStorage.setItem(
      peopleDeckSeenOutboxStorageKey(userId, scope),
      JSON.stringify(box)
    );
  } catch {
    /* quota / private mode */
  }
}

/** Test helper: clear in-memory sync state. */
export function resetPeopleDeckSeenSyncForTests(): void {
  bootstrapReady.clear();
  sessionHydratedAt.clear();
  hydrateInFlight.clear();
  flushInFlight.clear();
  flushErrorUntil.clear();
  for (const t of maxAgeTimers.values()) clearTimeout(t);
  maxAgeTimers.clear();
  hydrateGeneration += 1;
}

export function bumpPeopleDeckSeenHydrateGeneration(): number {
  hydrateGeneration += 1;
  return hydrateGeneration;
}

export function isPeopleDeckSeenBootstrapReady(
  userId: string | null | undefined,
  scope: PairUpSeenScope
): boolean {
  const uid = userId?.trim() || "";
  if (!uid) return true;
  if (hasPairUpSeenLocalHistory(uid, scope)) return true;
  return bootstrapReady.get(flightKey(uid, scope)) === "ready";
}

export function markPeopleDeckSeenBootstrapReady(
  userId: string,
  scope: PairUpSeenScope
): void {
  bootstrapReady.set(flightKey(userId, scope), "ready");
}

export function getPeopleDeckSeenOutboxIds(
  userId: string,
  scope: PairUpSeenScope
): string[] {
  return [...readOutbox(userId, scope).ids];
}

function enqueueOutboxId(
  userId: string,
  scope: PairUpSeenScope,
  opportunityId: string,
  nowMs: number = Date.now()
): boolean {
  const box = readOutbox(userId, scope);
  if (box.ids.includes(opportunityId)) return false;
  const next: OutboxV1 = {
    v: 1,
    ids: [...box.ids, opportunityId],
    firstQueuedAtMs:
      box.ids.length === 0 ? nowMs : box.firstQueuedAtMs ?? nowMs,
  };
  writeOutbox(userId, scope, next);
  return true;
}

function clearMaxAgeTimer(key: string): void {
  const t = maxAgeTimers.get(key);
  if (t) clearTimeout(t);
  maxAgeTimers.delete(key);
}

/**
 * Schedule max-age flush from first queued id.
 * Does not reset when more ids arrive (prevents forever postpone).
 */
function ensureMaxAgeFlushTimer(
  userId: string,
  scope: PairUpSeenScope,
  onFlush?: () => void
): void {
  const key = flightKey(userId, scope);
  if (maxAgeTimers.has(key)) return;
  const box = readOutbox(userId, scope);
  if (box.ids.length === 0) return;
  const first = box.firstQueuedAtMs ?? Date.now();
  const elapsed = Date.now() - first;
  const wait = Math.max(0, PEOPLE_DECK_SEEN_MAX_PENDING_AGE_MS - elapsed);
  const timer = setTimeout(() => {
    maxAgeTimers.delete(key);
    void flushPeopleDeckSeenOutbox({ userId, scope }).then(() => {
      onFlush?.();
    });
  }, wait);
  maxAgeTimers.set(key, timer);
}

/**
 * Local mark + outbox enqueue when a genuine 14d establish/restart occurs.
 * Returns whether local store established/restarted seen.
 */
export function markLocalPeopleDeckSeenAndEnqueue(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  opportunityId: string | null | undefined,
  nowMs: number = Date.now(),
  opts?: { onFlushScheduled?: () => void }
): boolean {
  const established = markPairUpOpportunitySeen(
    userId,
    scope,
    opportunityId,
    nowMs
  );
  if (!established) return false;
  const uid = userId!.trim();
  const id = opportunityId!.trim();
  enqueueOutboxId(uid, scope, id, nowMs);
  const pending = readOutbox(uid, scope).ids.length;
  if (pending >= PEOPLE_DECK_SEEN_FLUSH_THRESHOLD) {
    void flushPeopleDeckSeenOutbox({ userId: uid, scope }).then(() => {
      opts?.onFlushScheduled?.();
    });
  } else {
    ensureMaxAgeFlushTimer(uid, scope, opts?.onFlushScheduled);
  }
  return true;
}

export async function hydratePeopleDeckSeen(options: {
  userId: string;
  scope: PairUpSeenScope;
  force?: boolean;
  cooldownMs?: number;
  gateMs?: number;
}): Promise<HydrateResult> {
  const uid = options.userId.trim();
  if (!uid) return "skipped";
  const key = flightKey(uid, scopeKey(options.scope));
  const scope = options.scope;
  const force = options.force === true;
  const cooldown =
    options.cooldownMs ?? PEOPLE_DECK_SEEN_HYDRATE_COOLDOWN_MS;
  const now = Date.now();
  const last = sessionHydratedAt.get(key) ?? 0;
  if (!force && last > 0 && now - last < cooldown) {
    markPeopleDeckSeenBootstrapReady(uid, scope);
    return "skipped";
  }

  const existing = hydrateInFlight.get(key);
  if (existing) return existing;

  const gen = hydrateGeneration;
  const expectedUser = uid;
  const expectedScope = scope;

  const work = (async (): Promise<HydrateResult> => {
    try {
      const sessionUid = await activeAuthUserId();
      if (
        gen !== hydrateGeneration ||
        sessionUid !== expectedUser ||
        expectedScope !== scope
      ) {
        return "stale";
      }
      const rows = await getPeopleDeckSeen(scope);
      const sessionAfter = await activeAuthUserId();
      if (
        gen !== hydrateGeneration ||
        sessionAfter !== expectedUser ||
        expectedScope !== scope
      ) {
        return "stale";
      }
      const changed = mergePairUpSeenFromServer(expectedUser, scope, rows);
      sessionHydratedAt.set(key, Date.now());
      markPeopleDeckSeenBootstrapReady(expectedUser, scope);
      return changed ? "merged" : "unchanged";
    } catch {
      if (
        gen !== hydrateGeneration ||
        (await activeAuthUserId()) !== expectedUser ||
        expectedScope !== scope
      ) {
        return "stale";
      }
      markPeopleDeckSeenBootstrapReady(expectedUser, scope);
      return "failed";
    } finally {
      hydrateInFlight.delete(key);
    }
  })();

  hydrateInFlight.set(key, work);
  return work;
}

function scopeKey(scope: PairUpSeenScope): PairUpSeenScope {
  return scope;
}

/**
 * Fresh-device gate: wait for hydrate settle / fail / timeout before first current.
 */
export async function awaitPeopleDeckSeenBootstrap(options: {
  userId: string;
  scope: PairUpSeenScope;
  timeoutMs?: number;
}): Promise<"ready" | "timeout" | "local"> {
  const uid = options.userId.trim();
  if (!uid) return "ready";
  if (hasPairUpSeenLocalHistory(uid, options.scope)) {
    markPeopleDeckSeenBootstrapReady(uid, options.scope);
    void hydratePeopleDeckSeen({
      userId: uid,
      scope: options.scope,
      force: false,
    });
    return "local";
  }

  const key = flightKey(uid, options.scope);
  if (bootstrapReady.get(key) === "ready") return "ready";

  bootstrapReady.set(key, "pending");
  const timeoutMs =
    options.timeoutMs ?? PEOPLE_DECK_SEEN_FRESH_DEVICE_GATE_MS;

  const hydratePromise = hydratePeopleDeckSeen({
    userId: uid,
    scope: options.scope,
    force: true,
  });

  const result = await Promise.race([
    hydratePromise.then(() => "hydrated" as const),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]);

  markPeopleDeckSeenBootstrapReady(uid, options.scope);
  if (result === "timeout") {
    // Late hydrate may still merge later; frozen-prefix protects carousel.
    void hydratePromise;
    return "timeout";
  }
  return "ready";
}

export async function flushPeopleDeckSeenOutbox(options: {
  userId: string;
  scope: PairUpSeenScope;
}): Promise<FlushResult> {
  const uid = options.userId.trim();
  if (!uid) return "empty";
  const scope = options.scope;
  const key = flightKey(uid, scope);

  const errUntil = flushErrorUntil.get(key) ?? 0;
  if (Date.now() < errUntil) return "busy";

  const existing = flushInFlight.get(key);
  if (existing) return "busy";

  const gen = hydrateGeneration;
  const expectedUser = uid;

  const work = (async (): Promise<FlushResult> => {
    try {
      let box = readOutbox(uid, scope);
      if (box.ids.length === 0) {
        clearMaxAgeTimer(key);
        return "empty";
      }

      while (box.ids.length > 0) {
        if (gen !== hydrateGeneration) return "stale";
        const sessionUid = await activeAuthUserId();
        if (sessionUid !== expectedUser) return "stale";
        const chunk = box.ids.slice(0, PEOPLE_DECK_SEEN_MARK_CHUNK);
        await markPeopleDeckSeen(scope, chunk, expectedUser);
        // Success even when ROW_COUNT=0 (already server-seen).
        // Re-check before mutating outbox so logout mid-flight keeps pending.
        if (
          gen !== hydrateGeneration ||
          (await activeAuthUserId()) !== expectedUser
        ) {
          return "stale";
        }
        box = readOutbox(expectedUser, scope);
        const remaining = box.ids.filter((id) => !chunk.includes(id));
        writeOutbox(expectedUser, scope, {
          v: 1,
          ids: remaining,
          firstQueuedAtMs:
            remaining.length > 0 ? box.firstQueuedAtMs ?? Date.now() : undefined,
        });
        box = readOutbox(expectedUser, scope);
      }
      clearMaxAgeTimer(key);
      return "flushed";
    } catch {
      if (
        gen !== hydrateGeneration ||
        (await activeAuthUserId()) !== expectedUser
      ) {
        return "stale";
      }
      flushErrorUntil.set(
        key,
        Date.now() + PEOPLE_DECK_SEEN_FLUSH_ERROR_COOLDOWN_MS
      );
      return "failed";
    } finally {
      flushInFlight.delete(key);
    }
  })();

  flushInFlight.set(key, work);
  return work;
}

/** Flush all four People seen scopes for a user (leave tab / background). */
export async function flushAllPeopleDeckSeenOutboxes(
  userId: string | null | undefined
): Promise<void> {
  const uid = userId?.trim() || "";
  if (!uid) return;
  const scopes: PairUpSeenScope[] = [
    "my_plans",
    "discover",
    "open_plans",
    "groups_new",
  ];
  await Promise.all(
    scopes.map((scope) => flushPeopleDeckSeenOutbox({ userId: uid, scope }))
  );
}

/** Force hydrate for a later manual-refresh path (no deck reset here). */
export async function forceHydratePeopleDeckSeen(
  userId: string,
  scope: PairUpSeenScope
): Promise<HydrateResult> {
  return hydratePeopleDeckSeen({ userId, scope, force: true });
}

/** Pure merge helper for tests. */
export function mergeSeenTimestampMapsForTests(
  local: Record<string, number>,
  server: PeopleDeckSeenRow[],
  nowMs: number,
  ttlMs: number
): Record<string, number> {
  const merged: Record<string, number> = { ...local };
  for (const row of server) {
    if (nowMs - row.seen_at_ms >= ttlMs) continue;
    const prev = merged[row.item_id];
    if (typeof prev !== "number" || row.seen_at_ms > prev) {
      merged[row.item_id] = row.seen_at_ms;
    }
  }
  const next: Record<string, number> = {};
  for (const [id, ts] of Object.entries(merged)) {
    if (nowMs - ts < ttlMs) next[id] = ts;
  }
  return next;
}
