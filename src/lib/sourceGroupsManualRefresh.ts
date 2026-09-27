/**
 * Manual Source Groups revalidation helpers (no polling / Realtime).
 */

import type {
  SourceGroupListPage,
  SourceGroupRow,
} from "./social/sourceGroupTypes";

/**
 * Server page wins for row identity/order, but keep optimistic viewer_state
 * for opportunities with an in-flight request/withdraw.
 */
export function mergeSourceGroupPagePreservingInFlight(
  page: SourceGroupListPage,
  previousRows: SourceGroupRow[],
  isBusy: (opportunityId: string) => boolean
): SourceGroupListPage {
  if (previousRows.length === 0) return page;
  const prevById = new Map(
    previousRows.map((row) => [row.opportunity_id, row] as const)
  );
  return {
    ...page,
    candidates: page.candidates.map((row) => {
      if (!isBusy(row.opportunity_id)) return row;
      const prev = prevById.get(row.opportunity_id);
      if (!prev) return row;
      return {
        ...row,
        viewer_state: prev.viewer_state,
        request_id: prev.request_id,
      };
    }),
  };
}

/**
 * Count reconciliation after an explicit first-page refresh.
 * Never treat first-page length as total when pagination may continue.
 */
export function shouldZeroDiscoverableCountFromRefreshPage(
  page: SourceGroupListPage
): boolean {
  return page.candidates.length === 0 && page.has_more !== true;
}
