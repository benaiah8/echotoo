/**
 * Account-scoped People deck seen-opportunity history (localStorage).
 * Opportunity / deck-row identity only — never person-level.
 *
 * Scopes: Duo, Discover, Plans, Groups New. Groups Yours is excluded.
 * Duo/Discover keys preserved (`my_plans` / `discover` under same prefix).
 */

export type PairUpSeenScope =
  | "my_plans"
  | "discover"
  | "open_plans"
  | "groups_new";

export const PEOPLE_PAIR_UP_SEEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const PEOPLE_PAIR_UP_SEEN_CAP = 1000;
export const PEOPLE_PAIR_UP_SEEN_STORAGE_PREFIX =
  "echotoo_people_pairup_seen_v1";

type SeenStoreV1 = {
  v: 1;
  entries: Record<string, number>;
};

function storageKey(userId: string, scope: PairUpSeenScope): string {
  return `${PEOPLE_PAIR_UP_SEEN_STORAGE_PREFIX}:${userId}:${scope}`;
}

function emptyStore(): SeenStoreV1 {
  return { v: 1, entries: {} };
}

function readStore(userId: string, scope: PairUpSeenScope): SeenStoreV1 {
  const uid = userId.trim();
  if (!uid) return emptyStore();
  try {
    const raw = localStorage.getItem(storageKey(uid, scope));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<SeenStoreV1>;
    if (!parsed || parsed.v !== 1 || typeof parsed.entries !== "object") {
      return emptyStore();
    }
    const entries: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed.entries ?? {})) {
      if (!id || typeof ts !== "number" || !Number.isFinite(ts)) continue;
      entries[id] = ts;
    }
    return { v: 1, entries };
  } catch {
    return emptyStore();
  }
}

function writeStore(
  userId: string,
  scope: PairUpSeenScope,
  store: SeenStoreV1
): void {
  const uid = userId.trim();
  if (!uid) return;
  try {
    localStorage.setItem(storageKey(uid, scope), JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

/** Drop expired, then oldest until within cap. */
export function prunePairUpSeenEntries(
  entries: Record<string, number>,
  nowMs: number = Date.now(),
  ttlMs: number = PEOPLE_PAIR_UP_SEEN_TTL_MS,
  cap: number = PEOPLE_PAIR_UP_SEEN_CAP
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, ts] of Object.entries(entries)) {
    if (!id || typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (nowMs - ts >= ttlMs) continue;
    next[id] = ts;
  }
  const ids = Object.keys(next);
  if (ids.length <= cap) return next;
  ids.sort((a, b) => (next[a]! - next[b]!) || a.localeCompare(b));
  const drop = ids.length - cap;
  for (let i = 0; i < drop; i += 1) {
    delete next[ids[i]!];
  }
  return next;
}

export function isPairUpOpportunitySeen(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  opportunityId: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const id = opportunityId?.trim() || "";
  if (!userId?.trim() || !id) return false;
  const store = readStore(userId, scope);
  const pruned = prunePairUpSeenEntries(store.entries, nowMs);
  const ts = pruned[id];
  return typeof ts === "number";
}

export function getPairUpSeenOpportunityIdSet(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  nowMs: number = Date.now()
): Set<string> {
  if (!userId?.trim()) return new Set();
  const store = readStore(userId, scope);
  const pruned = prunePairUpSeenEntries(store.entries, nowMs);
  if (Object.keys(pruned).length !== Object.keys(store.entries).length) {
    writeStore(userId, scope, { v: 1, entries: pruned });
  }
  return new Set(Object.keys(pruned));
}

/**
 * Mark opportunity seen locally.
 * - Inside active 14-day window: keep existing seenAt (no rewrite).
 * - Missing or expired: establish Date.now() / nowMs.
 * Returns true when a genuine establish/restart happened (caller may enqueue outbox).
 */
export function markPairUpOpportunitySeen(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  opportunityId: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const uid = userId?.trim() || "";
  const id = opportunityId?.trim() || "";
  if (!uid || !id) return false;
  const store = readStore(uid, scope);
  const entries = prunePairUpSeenEntries(store.entries, nowMs);
  const existing = entries[id];
  if (typeof existing === "number" && nowMs - existing < PEOPLE_PAIR_UP_SEEN_TTL_MS) {
    // Still write pruned store if prune dropped other ids.
    if (Object.keys(entries).length !== Object.keys(store.entries).length) {
      writeStore(uid, scope, { v: 1, entries });
    }
    return false;
  }
  entries[id] = nowMs;
  const pruned = prunePairUpSeenEntries(entries, nowMs);
  writeStore(uid, scope, { v: 1, entries: pruned });
  return true;
}

/** True when local store has ≥1 in-TTL entry for this user+scope. */
export function hasPairUpSeenLocalHistory(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  nowMs: number = Date.now()
): boolean {
  if (!userId?.trim()) return false;
  const store = readStore(userId, scope);
  const pruned = prunePairUpSeenEntries(store.entries, nowMs);
  return Object.keys(pruned).length > 0;
}

/** Merge server rows into local map (union; newer valid ts wins). Returns whether store changed. */
export function mergePairUpSeenFromServer(
  userId: string | null | undefined,
  scope: PairUpSeenScope,
  serverRows: readonly { item_id: string; seen_at_ms: number }[],
  nowMs: number = Date.now()
): boolean {
  const uid = userId?.trim() || "";
  if (!uid) return false;
  const store = readStore(uid, scope);
  const merged: Record<string, number> = { ...store.entries };
  let changed = false;
  for (const row of serverRows) {
    const id = row.item_id?.trim() || "";
    const ts = row.seen_at_ms;
    if (!id || typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (nowMs - ts >= PEOPLE_PAIR_UP_SEEN_TTL_MS) continue;
    const prev = merged[id];
    if (typeof prev !== "number" || ts > prev) {
      merged[id] = ts;
      changed = true;
    }
  }
  const pruned = prunePairUpSeenEntries(merged, nowMs);
  if (
    !changed &&
    Object.keys(pruned).length === Object.keys(store.entries).length
  ) {
    return false;
  }
  writeStore(uid, scope, { v: 1, entries: pruned });
  return true;
}

/**
 * Partition opportunity ids into unseen then seen, preserving relative order
 * within each bucket (stable vs `orderedIds` input).
 */
export function partitionOpportunityIdsUnseenFirst(
  orderedIds: readonly string[],
  seenIds: ReadonlySet<string>
): string[] {
  const unseen: string[] = [];
  const seen: string[] = [];
  const used = new Set<string>();
  for (const id of orderedIds) {
    if (!id || used.has(id)) continue;
    used.add(id);
    if (seenIds.has(id)) seen.push(id);
    else unseen.push(id);
  }
  return [...unseen, ...seen];
}

/**
 * Rebuild active window order without moving the frozen prefix under the user.
 * - previousActive empty → full unseen-first partition of eligibleOrdered
 * - otherwise freeze through current (inclusive), partition the rest
 */
export function rebuildPairUpActiveOrderedIds(options: {
  eligibleOrdered: readonly string[];
  previousActive: readonly string[];
  currentId: string | null;
  seenIds: ReadonlySet<string>;
  retiredIds?: ReadonlySet<string> | readonly string[];
}): string[] {
  const retired = new Set(
    Array.from(options.retiredIds ?? []).filter(Boolean)
  );
  const eligible = options.eligibleOrdered.filter(
    (id) => id && !retired.has(id)
  );
  const eligibleSet = new Set(eligible);

  if (options.previousActive.length === 0) {
    return partitionOpportunityIdsUnseenFirst(eligible, options.seenIds);
  }

  const prev = options.previousActive.filter((id) => eligibleSet.has(id));
  const currentId = options.currentId;
  const currentIdx =
    currentId && currentId.length > 0 ? prev.indexOf(currentId) : -1;
  const frozen =
    currentIdx >= 0 ? prev.slice(0, currentIdx + 1) : [...prev];
  const frozenSet = new Set(frozen);

  const rest: string[] = [];
  const restUsed = new Set<string>();
  // Preserve prior suffix relative order first, then newcomers from eligibleOrdered.
  if (currentIdx >= 0) {
    for (const id of prev.slice(currentIdx + 1)) {
      if (!eligibleSet.has(id) || frozenSet.has(id) || restUsed.has(id)) continue;
      restUsed.add(id);
      rest.push(id);
    }
  }
  for (const id of eligible) {
    if (frozenSet.has(id) || restUsed.has(id)) continue;
    restUsed.add(id);
    rest.push(id);
  }

  return [
    ...frozen,
    ...partitionOpportunityIdsUnseenFirst(rest, options.seenIds),
  ];
}

export function firstUnseenOpportunityId(
  orderedIds: readonly string[],
  seenIds: ReadonlySet<string>
): string | null {
  for (const id of orderedIds) {
    if (id && !seenIds.has(id)) return id;
  }
  return orderedIds.find(Boolean) ?? null;
}

/** Test/helper: storage key format. */
export function pairUpSeenStorageKey(
  userId: string,
  scope: PairUpSeenScope
): string {
  return storageKey(userId, scope);
}
