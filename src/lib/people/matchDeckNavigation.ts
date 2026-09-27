/**
 * Shared Match Deck navigation helpers.
 * Session/window only — not rejection, not server-side seen state.
 */

export const RECENT_BACK_LIMIT = 15;
/** Prune only when behind-count exceeds limit + buffer (avoids reInit every card). */
export const RECENT_BACK_PRUNE_BUFFER = 4;

export type OpportunityIdRow = {
  opportunity_id: string | null;
  /** Fallback identity when opportunity_id is null (source-unavailable Groups). */
  conversation_id?: string | null;
};

function rowDeckIdentity(row: OpportunityIdRow): string {
  const opp =
    typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
  if (opp) return opp;
  return typeof row.conversation_id === "string"
    ? row.conversation_id.trim()
    : "";
}

/** Index of id in rows, or -1. Never coerces a miss to 0. */
export function indexOfOpportunity(
  rows: readonly OpportunityIdRow[],
  opportunityId: string | null | undefined
): number {
  if (!opportunityId || rows.length === 0) return -1;
  return rows.findIndex((row) => rowDeckIdentity(row) === opportunityId);
}

/**
 * Resolve replacement current id from PRE-REMOVAL order.
 * 1) first id after leavingId still in remaining
 * 2) else last id before leavingId still in remaining
 * 3) else null
 */
export function resolveNearestOpportunityId(
  orderedIds: readonly string[],
  remainingIds: ReadonlySet<string> | readonly string[],
  leavingId: string
): string | null {
  if (!leavingId) return null;
  const remaining = new Set(Array.from(remainingIds).filter(Boolean));

  const leaveIndex = orderedIds.indexOf(leavingId);
  if (leaveIndex < 0) {
    for (const id of orderedIds) {
      if (id !== leavingId && remaining.has(id)) return id;
    }
    return null;
  }

  for (let i = leaveIndex + 1; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (id && remaining.has(id)) return id;
  }
  for (let i = leaveIndex - 1; i >= 0; i -= 1) {
    const id = orderedIds[i];
    if (id && remaining.has(id)) return id;
  }
  return null;
}

/** When current is missing from remaining, pick nearest from restored order. */
export function resolveCurrentOrNearestId(
  orderedIds: readonly string[],
  remainingIds: ReadonlySet<string> | readonly string[],
  currentId: string | null
): string | null {
  const remaining = new Set(Array.from(remainingIds).filter(Boolean));

  if (currentId && remaining.has(currentId)) return currentId;
  if (currentId) {
    return resolveNearestOpportunityId(orderedIds, remaining, currentId);
  }
  for (const id of orderedIds) {
    if (remaining.has(id)) return id;
  }
  return null;
}

export function shouldPruneActiveWindow(
  orderedIds: readonly string[],
  currentId: string | null
): boolean {
  if (!currentId || orderedIds.length === 0) return false;
  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0) return false;
  return currentIndex > RECENT_BACK_LIMIT + RECENT_BACK_PRUNE_BUFFER;
}

/**
 * Keep ids from (currentIndex - RECENT_BACK_LIMIT) through end.
 * Never drops current or anything after it.
 * Returns null if no prune needed.
 */
export function pruneActiveOrderedIds(
  orderedIds: readonly string[],
  currentId: string | null
): { kept: string[]; retired: string[] } | null {
  if (!currentId || orderedIds.length === 0) return null;
  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0) return null;
  if (currentIndex <= RECENT_BACK_LIMIT + RECENT_BACK_PRUNE_BUFFER) {
    return null;
  }
  const start = currentIndex - RECENT_BACK_LIMIT;
  const retired = orderedIds.slice(0, start);
  const kept = orderedIds.slice(start);
  if (retired.length === 0) return null;
  return { kept: [...kept], retired: [...retired] };
}

/** Filter ordered ids that still exist in eligible rows; drop stale. */
export function filterOrderedIdsToEligible(
  orderedIds: readonly string[],
  eligibleIds: ReadonlySet<string>
): string[] {
  return orderedIds.filter((id) => eligibleIds.has(id));
}

export function isTrueCaughtUpState(options: {
  visibleCount: number;
  hasLoaded: boolean;
  hasMore: boolean;
  loadMoreInFlight: boolean;
}): boolean {
  return (
    options.visibleCount === 0 &&
    options.hasLoaded &&
    !options.hasMore &&
    !options.loadMoreInFlight
  );
}

export function shouldLoadMoreForEmptyWindow(options: {
  visibleCount: number;
  hasMore: boolean;
  loadMoreInFlight: boolean;
}): boolean {
  return (
    options.visibleCount === 0 &&
    options.hasMore &&
    !options.loadMoreInFlight
  );
}
