/**
 * Stable deck / scope identity for a Group Up candidate.
 * Prefer opportunity_id when present; fall back to conversation_id for
 * source-unavailable surviving memberships.
 */
import type { GroupUpCandidate } from "./people/types";

export function groupUpDeckRowId(
  row: Pick<GroupUpCandidate, "opportunity_id" | "conversation_id">,
): string {
  const opp =
    typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
  if (opp) return opp;
  return row.conversation_id?.trim() || "";
}
