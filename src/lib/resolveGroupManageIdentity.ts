/**
 * Resolve Group manage identity from warm caches / conversation RPC payload.
 * No Feed refetch — title lives on conversation / source-list rows, not GroupUpOpportunity.
 */

import type { GroupUpSourceContext } from "./people/types";
import { getGroupUpSourceListEntry } from "./groupUpSourceListCache";

export type GroupManageIdentity = {
  title: string | null;
  description: string | null;
  sourceType: "hangout" | "experience" | null;
  sourceCaption: string | null;
};

export function resolveGroupManageIdentityFromCache(args: {
  sourcePostId: string;
  opportunityId: string | null;
  opportunityDescription: string | null;
  overlayCaption: string | null;
  overlayPostType: "hangout" | "experience" | null;
}): GroupManageIdentity {
  const entry = getGroupUpSourceListEntry(args.sourcePostId);
  const rows = entry?.rows ?? [];
  const own =
    (args.opportunityId
      ? rows.find((r) => r.opportunity_id === args.opportunityId)
      : null) ??
    rows.find((r) => r.viewer_state === "owner") ??
    null;

  return {
    title: own?.group_title?.trim() || null,
    description:
      own?.group_description?.trim() ||
      args.opportunityDescription?.trim() ||
      null,
    sourceType: args.overlayPostType ?? own?.source_type ?? null,
    sourceCaption: args.overlayCaption?.trim() || null,
  };
}

export function mergeGroupManageIdentityFromConversation(args: {
  base: GroupManageIdentity;
  conversationTitle: string | null;
  conversationDescription: string | null;
  sourceContext: GroupUpSourceContext | null;
}): GroupManageIdentity {
  const ctx = args.sourceContext;
  return {
    title: args.base.title || args.conversationTitle?.trim() || null,
    description:
      args.base.description || args.conversationDescription?.trim() || null,
    sourceType: args.base.sourceType ?? ctx?.post_type ?? null,
    sourceCaption:
      args.base.sourceCaption || ctx?.caption?.trim() || null,
  };
}

/** Own active Group is included in discoverable count → other = max(0, n - 1). */
export function computeSeeOtherGroupsCount(
  discoverableCount: number | null,
  ownsActive: boolean
): number {
  if (typeof discoverableCount !== "number" || discoverableCount <= 0) return 0;
  if (ownsActive) return Math.max(0, discoverableCount - 1);
  return discoverableCount;
}

/** Manage utility row above the identity box (Cancel always; See other when N > 0). */
export function resolveGroupManageUtilityActions(otherCount: number): {
  showSeeOtherGroups: boolean;
  showCancelGroup: boolean;
} {
  return {
    showSeeOtherGroups: otherCount > 0,
    showCancelGroup: true,
  };
}
