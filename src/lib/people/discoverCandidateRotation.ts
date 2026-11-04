/**
 * Discover display ordering: recent-seen preference, creator diversity,
 * exhausted-pool rotation. Does not invent candidates or change eligibility.
 * Presentation grouping (≤3 boxes / appearance) stays in groupDiscoverOpportunities.
 */

import {
  interleavePairUpCandidates,
  type InterleaveableCandidate,
} from "../interleavePairUpCandidates";

/** Bounded in-memory impression ring per auth user (not persisted). */
export const DISCOVER_RECENT_SEEN_LIMIT = 48;

const recentByUser = new Map<string, string[]>();

export function clearDiscoverRecentSeenHistory(userId?: string | null): void {
  if (!userId) {
    recentByUser.clear();
    return;
  }
  recentByUser.delete(userId);
}

export function getDiscoverRecentSeenIds(userId: string): readonly string[] {
  return recentByUser.get(userId) ?? [];
}

/** Record opportunities the viewer actually visited (newest last). */
export function noteDiscoverOpportunitiesDisplayed(
  userId: string,
  opportunityIds: readonly string[]
): void {
  if (!userId || opportunityIds.length === 0) return;
  const prev = recentByUser.get(userId) ?? [];
  const next = [...prev];
  for (const raw of opportunityIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    const at = next.indexOf(id);
    if (at >= 0) next.splice(at, 1);
    next.push(id);
  }
  while (next.length > DISCOVER_RECENT_SEEN_LIMIT) next.shift();
  recentByUser.set(userId, next);
}

function recentRank(recent: readonly string[], id: string): number {
  return recent.lastIndexOf(id);
}

/**
 * Prefer never-/least-recently-shown ids, preserving relative order within a tier.
 */
export function preferLessRecentlyShown<T extends { opportunity_id: string }>(
  candidates: readonly T[],
  recent: readonly string[]
): T[] {
  if (candidates.length <= 1 || recent.length === 0) return [...candidates];
  const indexed = candidates.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const ra = recentRank(recent, a.row.opportunity_id);
    const rb = recentRank(recent, b.row.opportunity_id);
    if (ra !== rb) {
      if (ra < 0) return -1;
      if (rb < 0) return 1;
      return ra - rb;
    }
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

/**
 * Prefer creators that were never / least-recently shown (derived from recent
 * opportunity ids mapped through the current candidate pool). Preserves relative
 * order within the same creator-recency tier. Used so refresh can change the
 * leading person without fetching the full eligible set.
 */
export function preferLessRecentlyShownCreators<
  T extends { opportunity_id: string; creator_id: string },
>(candidates: readonly T[], recentOpportunityIds: readonly string[]): T[] {
  if (candidates.length <= 1 || recentOpportunityIds.length === 0) {
    return [...candidates];
  }
  const oppToCreator = new Map<string, string>();
  for (const row of candidates) {
    const oid = row.opportunity_id?.trim();
    const cid = row.creator_id?.trim();
    if (oid && cid) oppToCreator.set(oid, cid);
  }
  const recentCreators: string[] = [];
  for (const oid of recentOpportunityIds) {
    const cid = oppToCreator.get(oid);
    if (!cid) continue;
    const at = recentCreators.lastIndexOf(cid);
    if (at >= 0) recentCreators.splice(at, 1);
    recentCreators.push(cid);
  }
  if (recentCreators.length === 0) return [...candidates];

  const indexed = candidates.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const ra = recentRank(recentCreators, a.row.creator_id);
    const rb = recentRank(recentCreators, b.row.creator_id);
    if (ra !== rb) {
      if (ra < 0) return -1;
      if (rb < 0) return 1;
      return ra - rb;
    }
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

/**
 * Round-robin across creators while preserving relative order within each
 * creator. Softens newest-first concentration (e.g. 10+8 from two people)
 * without dropping ids or capping creators globally.
 */
export function diversifyDiscoverCreators<T extends InterleaveableCandidate>(
  candidates: readonly T[],
  options?: { creatorStartOffset?: number }
): T[] {
  if (candidates.length <= 1) return [...candidates];

  const queues = new Map<string, T[]>();
  const creatorOrder: string[] = [];
  for (const row of candidates) {
    const key = row.creator_id || row.opportunity_id;
    const q = queues.get(key);
    if (q) {
      q.push(row);
    } else {
      queues.set(key, [row]);
      creatorOrder.push(key);
    }
  }
  if (creatorOrder.length <= 1) return [...candidates];

  const offsetRaw = options?.creatorStartOffset ?? 0;
  const offset =
    ((offsetRaw % creatorOrder.length) + creatorOrder.length) %
    creatorOrder.length;
  const orderedCreators =
    offset === 0
      ? creatorOrder
      : [...creatorOrder.slice(offset), ...creatorOrder.slice(0, offset)];

  const out: T[] = [];
  let remaining = candidates.length;
  while (remaining > 0) {
    for (const key of orderedCreators) {
      const q = queues.get(key);
      if (!q || q.length === 0) continue;
      out.push(q.shift()!);
      remaining -= 1;
    }
  }
  return out;
}

/**
 * Build a changed eligible-pool order for an exhausted Discover cycle.
 * Same ids only — no inventing. Epoch shifts creator round-robin start.
 */
export function rotateExhaustedDiscoverPool<T extends InterleaveableCandidate>(
  candidates: readonly T[],
  recent: readonly string[],
  rotationEpoch: number
): T[] {
  if (candidates.length <= 1) return [...candidates];
  const diversified = diversifyDiscoverCreators(candidates, {
    creatorStartOffset: Math.max(0, rotationEpoch),
  });
  return preferLessRecentlyShown(diversified, recent);
}

/**
 * Order Discover candidates for the deck interleave path.
 *
 * - While `hasMore`, only soft-interleave newcomers (never rotate-repeat).
 * - On a fresh window (`previousOrderedIds` empty), diversify creators then
 *   prefer less-recently-shown before soft interleave.
 * - When `rotateExhausted` and the backend is done, rebuild from the eligible
 *   pool only (no new ids) with diversity + recent-seen preference.
 */
export function orderDiscoverCandidates<T extends InterleaveableCandidate>(options: {
  userId: string;
  candidates: T[];
  previousOrderedIds: readonly string[];
  retiredIds?: ReadonlySet<string> | readonly string[];
  hasMore: boolean;
  rotateExhausted?: boolean;
  /** Bumped on each exhausted-pool rotation so order can change again. */
  rotationEpoch?: number;
}): T[] {
  const {
    userId,
    candidates,
    previousOrderedIds,
    hasMore,
    rotateExhausted = false,
    rotationEpoch = 0,
  } = options;
  if (candidates.length <= 1) return candidates;

  const recent = getDiscoverRecentSeenIds(userId);
  const retired = options.retiredIds ?? [];

  if (rotateExhausted && !hasMore) {
    const preferred = rotateExhaustedDiscoverPool(
      candidates,
      recent,
      rotationEpoch
    );
    return interleavePairUpCandidates(preferred, [], retired);
  }

  if (previousOrderedIds.length === 0) {
    // Fresh window (open / hard refresh): diversify, then prefer less-recent
    // creators so the lead person changes when alternatives exist, then prefer
    // less-recent opportunity ids within that ordering.
    const diversified = diversifyDiscoverCreators(candidates, {
      creatorStartOffset: rotationEpoch,
    });
    const byCreator = preferLessRecentlyShownCreators(diversified, recent);
    const preferred = preferLessRecentlyShown(byCreator, recent);
    return interleavePairUpCandidates(preferred, [], retired);
  }

  return interleavePairUpCandidates(
    candidates,
    previousOrderedIds,
    retired
  );
}
