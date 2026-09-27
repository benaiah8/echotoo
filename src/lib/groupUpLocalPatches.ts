import {
  invalidateGroupUpSourceList,
  prependSourceGroupRow,
  removeSourceGroupRow,
} from "./groupUpSourceListCache";
import {
  markGroupUpCountStale,
  patchGroupUpCount,
} from "./groupUpCountStore";
import type { SourceGroupRow } from "./social/sourceGroupTypes";
import type { GroupUpOpportunity } from "./people/types";

/** After successful create_group_up — local list + count only (no Feed refetch). */
export function applyLocalCreateGroupPatches(
  opportunity: GroupUpOpportunity,
  meta?: {
    title?: string | null;
    description?: string | null;
    sourceType?: "hangout" | "experience";
  }
): void {
  const sourcePostId = opportunity.source_post_id;
  const row: SourceGroupRow = {
    opportunity_id: opportunity.id,
    conversation_id: opportunity.conversation_id,
    source_post_id: sourcePostId,
    group_title: meta?.title ?? null,
    group_description: meta?.description ?? opportunity.description,
    occurs_at: opportunity.occurs_at,
    occurs_time_explicit: opportunity.occurs_time_explicit,
    discoverable_until: opportunity.discoverable_until,
    created_at: opportunity.created_at,
    source_type: meta?.sourceType ?? "hangout",
    organizer_user_id: opportunity.creator_id,
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    viewer_state: "owner",
    request_id: null,
  };
  prependSourceGroupRow(sourcePostId, row);
  const until = Date.parse(opportunity.discoverable_until);
  if (Number.isFinite(until) && until > Date.now()) {
    patchGroupUpCount(sourcePostId, 1);
  }
}

/** After cancel — avoid count drift via soft revalidate. */
export function applyLocalCancelGroupPatches(
  sourcePostId: string,
  opportunityId: string
): void {
  removeSourceGroupRow(sourcePostId, opportunityId);
  invalidateGroupUpSourceList(sourcePostId);
  markGroupUpCountStale(sourcePostId);
}
