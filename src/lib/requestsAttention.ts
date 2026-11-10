/**
 * Requests attention versus the numeric "new" count.
 * Pending Open Plan / Group Up rows still need a decision after they are seen.
 * The count is only unseen work: unread request DMs, unseen Open Plan groups,
 * and Group Up new_count. Old pending rows are not counted as new.
 */
export function deriveRequestsAttention(input: {
  unreadRequestConversations: number;
  openPlanPending: number;
  openPlanUnseen: number;
  groupUpPending: number;
  groupUpNew: number;
}): { count: number; attention: boolean } {
  const unread = Math.max(0, Math.floor(input.unreadRequestConversations));
  const openPending = Math.max(0, Math.floor(input.openPlanPending));
  const openUnseen = Math.max(0, Math.floor(input.openPlanUnseen));
  const groupPending = Math.max(0, Math.floor(input.groupUpPending));
  const groupNew = Math.max(0, Math.floor(input.groupUpNew));
  const count = unread + openUnseen + groupNew;
  const attention = count > 0 || openPending > 0 || groupPending > 0;
  return { count, attention };
}
