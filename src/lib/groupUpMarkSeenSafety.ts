/**
 * Pure mirrors of G4 mark_group_up_requests_seen safety rules.
 * Used for unit tests — must stay aligned with the SQL migration.
 */

import {
  advanceRequestCursorMonotonic,
  isRequestCursorAfter,
  type GroupUpRequestCursor,
} from "./groupUpRequestCursor";

export type MarkSeenRequestIdentity = {
  requestId: string;
  createdAt: string;
  conversationId: string;
  creatorId: string;
  /** pending | accepted | declined | withdrawn | closed — status ignored for validity */
  status: string;
};

/**
 * SQL: request id + created_at match a group_up_requests row linked to an owned
 * Group Up opportunity on p_conversation_id. Status and opportunity.active ignored.
 */
export function isValidMarkSeenCursor(input: {
  hostUserId: string;
  conversationId: string;
  through: GroupUpRequestCursor;
  request: MarkSeenRequestIdentity | null;
}): boolean {
  const { hostUserId, conversationId, through, request } = input;
  if (!request) return false;
  if (request.requestId !== through.id) return false;
  if (request.createdAt !== through.at) return false;
  if (request.conversationId !== conversationId) return false;
  if (request.creatorId !== hostUserId) return false;
  return true;
}

/**
 * SQL ON CONFLICT upsert outcome: stored = later of existing vs supplied.
 * Concurrent first marks: whichever later tuple commits last still wins via
 * monotonic compare (no unique throw in the JS model; SQL uses ON CONFLICT).
 */
export function applyMarkSeenUpsert(input: {
  existing: GroupUpRequestCursor | null;
  supplied: GroupUpRequestCursor;
}): { watermark: GroupUpRequestCursor; advanced: boolean } {
  const next = advanceRequestCursorMonotonic(input.existing, input.supplied);
  const advanced =
    input.existing == null ||
    isRequestCursorAfter(input.supplied, input.existing);
  return { watermark: next, advanced };
}

/**
 * Simulate two concurrent first marks (both see null existing).
 * Final state is the later of the two supplied cursors regardless of order.
 */
export function resolveConcurrentFirstMarks(
  a: GroupUpRequestCursor,
  b: GroupUpRequestCursor
): GroupUpRequestCursor {
  const afterA = applyMarkSeenUpsert({ existing: null, supplied: a }).watermark;
  return applyMarkSeenUpsert({ existing: afterA, supplied: b }).watermark;
}
