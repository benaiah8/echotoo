/**
 * Group Up browse tab helpers + Yours merge precedence.
 */

import type { GroupUpCandidate, GroupUpViewerState } from "./people/types";
import type { GroupUpBrowseTab } from "./matchDeckSession";

/** Card state labels for Yours. */
export type GroupUpDeckViewerLabel = "requested" | "host" | "member" | null;

export function groupUpViewerLabel(
  state: GroupUpViewerState
): GroupUpDeckViewerLabel {
  if (state === "pending") return "requested";
  if (state === "owner") return "host";
  if (state === "member") return "member";
  return null;
}

export function groupUpRowMatchesBrowseTab(
  row: GroupUpCandidate,
  tab: GroupUpBrowseTab
): boolean {
  if (tab === "new") return row.viewer_state === "none";
  return (
    row.viewer_state === "pending" ||
    row.viewer_state === "owner" ||
    row.viewer_state === "member"
  );
}

function viewerStateRank(state: GroupUpViewerState): number {
  switch (state) {
    case "owner":
      return 4;
    case "member":
      return 3;
    case "pending":
      return 2;
    case "none":
    default:
      return 1;
  }
}

/**
 * Merge key prefers conversation_id (survives null opportunity_id).
 */
export function mergeGroupUpBrowseAndMemberships(
  browseRows: readonly GroupUpCandidate[],
  membershipRows: readonly GroupUpCandidate[]
): GroupUpCandidate[] {
  const byConversation = new Map<string, GroupUpCandidate>();

  const consider = (row: GroupUpCandidate) => {
    const key =
      (row.conversation_id?.trim() || "") ||
      (row.opportunity_id?.trim() || "");
    if (!key) return;
    const prev = byConversation.get(key);
    if (!prev) {
      byConversation.set(key, row);
      return;
    }
    if (viewerStateRank(row.viewer_state) > viewerStateRank(prev.viewer_state)) {
      byConversation.set(key, row);
      return;
    }
    if (
      viewerStateRank(row.viewer_state) === viewerStateRank(prev.viewer_state) &&
      row.created_at > prev.created_at
    ) {
      byConversation.set(key, row);
    }
  };

  for (const row of browseRows) consider(row);
  for (const row of membershipRows) consider(row);

  return Array.from(byConversation.values());
}
