/**
 * Phase 2 usage queue. Product code must call the track helpers and never await them.
 * The server contract is record_usage_events: an array of at most 20 {metric, dedupe_id}.
 * No post, profile, route, or account identifiers are sent.
 */

import type { UsageKpiMetric } from "../types/usageKpis";

export const USAGE_BATCH_LIMIT = 20;
export const USAGE_MAX_ATTEMPTS = 3;
export const USAGE_MAX_QUEUE = 40;
export const USAGE_FLUSH_INTERVAL_MS = 15_000;
export const USAGE_MIN_FLUSH_GAP_MS = 8_000;
export const USAGE_PEOPLE_VISIT_GAP_MS = 2_000;
export const USAGE_DESTINATION_SETTLE_MS = 400;
export const USAGE_REPEAT_GAP_MS = 400;

const OUTBOX_PREFIX = "echotoo_usage_outbox_v1:";
const APP_ACTIVE_PREFIX = "echotoo_usage_app_active_v1:";

const METRICS: ReadonlySet<string> = new Set<UsageKpiMetric>([
  "app_active",
  "people_visit",
  "tab_discover",
  "tab_duo",
  "tab_plans",
  "tab_groups",
  "duo_express",
  "duo_withdraw",
  "duo_complete",
  "post_detail_open",
  "profile_view",
  "post_save",
  "post_unsave",
]);

export type UsageTrackMetric = UsageKpiMetric;

type QueueItem = {
  dedupeId: string;
  metric: UsageTrackMetric;
  userId: string;
  attempts: number;
};

type UsageStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type UsageDeps = {
  now: () => number;
  rpc: (events: { metric: string; dedupe_id: string }[]) => Promise<void>;
  storage: UsageStorage | null;
  randomId: () => string;
  getUserId: () => Promise<string | null>;
};

type Destination = "discover" | "duo" | "plans" | "groups";

const DESTINATION_METRIC: Record<Destination, UsageTrackMetric> = {
  discover: "tab_discover",
  duo: "tab_duo",
  plans: "tab_plans",
  groups: "tab_groups",
};

let deps: UsageDeps = createDefaultDeps();
let activeUserId: string | null = null;
let generation = 0;
let queue: QueueItem[] = [];
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushAt = Number.NEGATIVE_INFINITY;
let installed = false;
let removeAuth: (() => void) | null = null;
let removeVisibility: (() => void) | null = null;
let appActiveMark = "";
const recentAt = new Map<string, number>();

function createDefaultDeps(): UsageDeps {
  return {
    now: () => Date.now(),
    rpc: defaultRpc,
    storage: defaultStorage(),
    randomId: defaultRandomId,
    getUserId: defaultGetUserId,
  };
}

function defaultStorage(): UsageStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function defaultRandomId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
}

async function defaultGetUserId(): Promise<string | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function defaultRpc(
  events: { metric: string; dedupe_id: string }[]
): Promise<void> {
  const { supabase } = await import("./supabaseClient");
  const { error } = await supabase.rpc("record_usage_events", {
    p_events: events,
  });
  if (error) throw error;
}

function isMetric(value: string): value is UsageTrackMetric {
  return METRICS.has(value);
}

function outboxKey(userId: string): string {
  return `${OUTBOX_PREFIX}${userId}`;
}

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function readQueue(userId: string): QueueItem[] {
  try {
    const raw = deps.storage?.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: QueueItem[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const metric = typeof rec.metric === "string" ? rec.metric : "";
      const dedupeId = typeof rec.dedupeId === "string" ? rec.dedupeId : "";
      const owner = typeof rec.userId === "string" ? rec.userId : "";
      const attempts = typeof rec.attempts === "number" ? rec.attempts : 0;
      if (!isMetric(metric) || !dedupeId || owner !== userId) continue;
      if (attempts >= USAGE_MAX_ATTEMPTS) continue;
      items.push({
        dedupeId,
        metric,
        userId: owner,
        attempts,
      });
    }
    return items.slice(-USAGE_MAX_QUEUE);
  } catch {
    return [];
  }
}

function persist(userId: string | null = activeUserId): void {
  if (!userId) return;
  try {
    const mine = queue
      .filter((item) => item.userId === userId)
      .slice(-USAGE_MAX_QUEUE);
    if (mine.length === 0) {
      deps.storage?.removeItem(outboxKey(userId));
      return;
    }
    deps.storage?.setItem(outboxKey(userId), JSON.stringify(mine));
  } catch {
    /* storage failures must not surface */
  }
}

function setActiveUser(next: string | null): void {
  if (next === activeUserId) return;
  persist(activeUserId);
  activeUserId = next;
  queue = next ? readQueue(next) : [];
}

function rememberRecent(key: string, gapMs: number): boolean {
  const now = deps.now();
  const prev = recentAt.get(key) ?? 0;
  if (now - prev < gapMs) return true;
  recentAt.set(key, now);
  if (recentAt.size > 50) {
    const oldest = recentAt.keys().next().value;
    if (oldest) recentAt.delete(oldest);
  }
  return false;
}

function enqueue(
  userId: string,
  metric: UsageTrackMetric,
  dedupeId = deps.randomId()
): void {
  if (!userId || userId !== activeUserId || !isMetric(metric) || !dedupeId) return;
  if (queue.some((item) => item.dedupeId === dedupeId)) return;
  queue.push({ dedupeId, metric, userId, attempts: 0 });
  if (queue.length > USAGE_MAX_QUEUE) {
    queue.splice(0, queue.length - USAGE_MAX_QUEUE);
  }
  persist(userId);
  scheduleFlush();
}

function clearFlushTimer(): void {
  if (flushTimer == null) return;
  clearTimeout(flushTimer);
  flushTimer = null;
}

function scheduleFlush(): void {
  if (!activeUserId || queue.length === 0 || flushing) return;
  const elapsed = deps.now() - lastFlushAt;
  const due =
    queue.length >= USAGE_BATCH_LIMIT
      ? Math.max(0, USAGE_MIN_FLUSH_GAP_MS - elapsed)
      : USAGE_FLUSH_INTERVAL_MS;
  if (flushTimer != null) {
    if (queue.length < USAGE_BATCH_LIMIT || due > 0) return;
    clearFlushTimer();
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUsageQueue();
  }, due);
}

async function resolveUser(gen: number): Promise<string | null> {
  if (activeUserId) return activeUserId;
  const resolved = await deps.getUserId();
  if (gen !== generation) return null;
  if (!resolved) return null;
  if (activeUserId && activeUserId !== resolved) return null;
  if (!activeUserId) setActiveUser(resolved);
  return activeUserId;
}

function track(metric: UsageTrackMetric, dedupeId?: string): void {
  try {
    if (!isMetric(metric)) return;
    if (activeUserId) {
      enqueue(activeUserId, metric, dedupeId);
      return;
    }
    const gen = generation;
    void (async () => {
      try {
        const uid = await resolveUser(gen);
        if (!uid || uid !== activeUserId) return;
        enqueue(uid, metric, dedupeId);
      } catch {
        /* ignore */
      }
    })();
  } catch {
    /* analytics must not affect the caller */
  }
}

export function trackUsage(metric: UsageTrackMetric): void {
  track(metric);
}

export function trackAppActive(userId: string): void {
  try {
    const uid = userId.trim();
    if (!uid) return;
    const day = utcDay(deps.now());
    const mark = `${uid}:${day}`;
    if (appActiveMark === mark) return;
    const storageKey = `${APP_ACTIVE_PREFIX}${mark}`;
    let dedupeId = "";
    try {
      dedupeId = deps.storage?.getItem(storageKey)?.trim() ?? "";
    } catch {
      dedupeId = "";
    }
    if (!dedupeId) {
      dedupeId = deps.randomId();
      try {
        deps.storage?.setItem(storageKey, dedupeId);
      } catch {
        /* still enqueue this id for the in-memory retry */
      }
    }
    appActiveMark = mark;
    if (uid !== activeUserId) setActiveUser(uid);
    enqueue(uid, "app_active", dedupeId);
  } catch {
    /* ignore */
  }
}

export function trackPeopleVisit(): void {
  try {
    const key = `people_visit:${activeUserId ?? "pending"}`;
    if (rememberRecent(key, USAGE_PEOPLE_VISIT_GAP_MS)) return;
    track("people_visit");
  } catch {
    /* ignore */
  }
}

export function trackPeopleDestination(destination: Destination): void {
  try {
    const metric = DESTINATION_METRIC[destination];
    if (!metric) return;
    const key = `${metric}:${activeUserId ?? "pending"}`;
    if (rememberRecent(key, USAGE_REPEAT_GAP_MS)) return;
    track(metric);
  } catch {
    /* ignore */
  }
}

/** localKey stays on device and is never sent. */
export function trackPostDetailOpen(localKey: string): void {
  try {
    const key = localKey.trim();
    if (!key) return;
    if (rememberRecent(`post_detail_open:${key}`, USAGE_REPEAT_GAP_MS)) return;
    track("post_detail_open");
  } catch {
    /* ignore */
  }
}

/** localKey stays on device and is never sent. */
export function trackProfileView(localKey: string): void {
  try {
    const key = localKey.trim().toLowerCase();
    if (!key || key === "me") return;
    if (rememberRecent(`profile_view:${key}`, USAGE_REPEAT_GAP_MS)) return;
    track("profile_view");
  } catch {
    /* ignore */
  }
}

export async function flushUsageQueue(): Promise<void> {
  if (flushing || !activeUserId) return;
  const owner = activeUserId;
  const batch = queue
    .filter((item) => item.userId === owner)
    .slice(0, USAGE_BATCH_LIMIT);
  if (batch.length === 0) return;
  flushing = true;
  lastFlushAt = deps.now();
  clearFlushTimer();
  try {
    if (activeUserId !== owner) return;
    await deps.rpc(
      batch.map((item) => ({
        metric: item.metric,
        dedupe_id: item.dedupeId,
      }))
    );
    if (activeUserId !== owner) return;
    const sent = new Set(batch.map((item) => item.dedupeId));
    queue = queue.filter((item) => !sent.has(item.dedupeId));
  } catch {
    if (activeUserId === owner) {
      const sentIds = new Set(batch.map((item) => item.dedupeId));
      queue = queue.flatMap((item) => {
        if (!sentIds.has(item.dedupeId)) return [item];
        const attempts = item.attempts + 1;
        if (attempts >= USAGE_MAX_ATTEMPTS) return [];
        return [{ ...item, attempts }];
      });
    }
  } finally {
    flushing = false;
    if (activeUserId === owner) {
      persist(owner);
      if (queue.length > 0) scheduleFlush();
    }
  }
}

export function installUsageAnalytics(): () => void {
  if (installed) return () => undefined;
  installed = true;
  let cancelled = false;

  const onVisible = () => {
    try {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "hidden") return;
      const elapsed = deps.now() - lastFlushAt;
      if (queue.length < USAGE_BATCH_LIMIT && elapsed < USAGE_MIN_FLUSH_GAP_MS) {
        return;
      }
      void flushUsageQueue();
    } catch {
      /* ignore */
    }
  };

  try {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
      removeVisibility = () =>
        document.removeEventListener("visibilitychange", onVisible);
    }
  } catch {
    removeVisibility = null;
  }

  void (async () => {
    try {
      const { supabase } = await import("./supabaseClient");
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = data.session?.user?.id ?? null;
      if (uid) {
        setActiveUser(uid);
        trackAppActive(uid);
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        try {
          const next = session?.user?.id ?? null;
          if (next === activeUserId) {
            if (next) trackAppActive(next);
            return;
          }
          generation += 1;
          setActiveUser(next);
          if (next) trackAppActive(next);
        } catch {
          /* ignore */
        }
      });
      removeAuth = () => sub.subscription.unsubscribe();
    } catch {
      /* analytics must not affect startup */
    }
  })();

  return () => {
    cancelled = true;
    installed = false;
    try {
      removeAuth?.();
    } catch {
      /* ignore */
    }
    try {
      removeVisibility?.();
    } catch {
      /* ignore */
    }
    removeAuth = null;
    removeVisibility = null;
    clearFlushTimer();
  };
}

export function configureUsageAnalyticsForTests(overrides: Partial<UsageDeps>): void {
  deps = { ...deps, ...overrides };
}

export function resetUsageAnalyticsForTests(): void {
  clearFlushTimer();
  generation += 1;
  activeUserId = null;
  queue = [];
  flushing = false;
  lastFlushAt = Number.NEGATIVE_INFINITY;
  appActiveMark = "";
  recentAt.clear();
  installed = false;
  try {
    removeAuth?.();
    removeVisibility?.();
  } catch {
    /* ignore */
  }
  removeAuth = null;
  removeVisibility = null;
  deps = createDefaultDeps();
}

export function setUsageAnalyticsUserForTests(userId: string | null): void {
  generation += 1;
  setActiveUser(userId);
}

export function usageQueueForTests(): readonly QueueItem[] {
  return queue.map((item) => ({ ...item }));
}
