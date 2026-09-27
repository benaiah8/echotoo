/**
 * Composite request watermark cursor: (created_at / requested_at, request_id).
 * Must match SQL ordering used by G4 groups / requesters / mark_seen.
 */

export type GroupUpRequestCursor = {
  at: string;
  id: string;
};

/** Compare two cursors. Negative if a < b, 0 if equal, positive if a > b. */
export function compareRequestCursors(
  a: GroupUpRequestCursor,
  b: GroupUpRequestCursor
): number {
  const tA = Date.parse(a.at);
  const tB = Date.parse(b.at);
  if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) {
    return tA < tB ? -1 : 1;
  }
  if (a.at !== b.at) {
    return a.at < b.at ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** True when `candidate` is strictly after `watermark` (candidate is NEW). */
export function isRequestCursorAfter(
  candidate: GroupUpRequestCursor,
  watermark: GroupUpRequestCursor
): boolean {
  return compareRequestCursors(candidate, watermark) > 0;
}

/** Advance existing only when incoming is strictly later. Never moves backward. */
export function advanceRequestCursorMonotonic(
  existing: GroupUpRequestCursor | null,
  incoming: GroupUpRequestCursor
): GroupUpRequestCursor {
  if (!existing) return incoming;
  return compareRequestCursors(incoming, existing) > 0 ? incoming : existing;
}

export function formatGroupUpRequestCountLabel(input: {
  pendingCount: number;
  newCount: number;
}): string {
  const pending = Math.max(0, Math.floor(input.pendingCount));
  const neu = Math.max(0, Math.floor(input.newCount));
  if (neu > 0) {
    return neu === 1 ? "1 new request" : `${neu} new requests`;
  }
  return pending === 1 ? "1 request" : `${pending} requests`;
}
