/**
 * Mirrors list_my_group_up_memberships viewer_state rule.
 *
 * With opportunity: owner iff viewer is Group Up creator for the conversation.
 * Without opportunity (source deleted): owner if conversation admin or created_by.
 */

export function classifyGroupUpMembershipViewerState(options: {
  viewerUserId: string;
  /** Any Group Up opportunity creator_ids linked to this conversation. */
  opportunityCreatorIds: readonly string[];
  conversationRole?: "admin" | "member" | string | null;
  /** Used only when no opportunity creators remain (source deleted). */
  conversationCreatedBy?: string | null;
  /** When true, apply durable conversation owner fallback. */
  sourceUnavailable?: boolean;
}): "owner" | "member" {
  const isCreator = options.opportunityCreatorIds.some(
    (id) => id === options.viewerUserId,
  );
  if (isCreator) return "owner";

  if (
    options.sourceUnavailable === true ||
    options.opportunityCreatorIds.length === 0
  ) {
    if (options.conversationRole === "admin") return "owner";
    if (
      options.conversationCreatedBy &&
      options.conversationCreatedBy === options.viewerUserId
    ) {
      return "owner";
    }
  }

  return "member";
}
