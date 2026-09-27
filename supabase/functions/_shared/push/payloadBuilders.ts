/**
 * Kind-specific FCM data payload builders for Edge push functions.
 */
import type { FcmDataPayload } from "./types.ts";

function trim(value: string | undefined | null, max?: number): string | undefined {
  const t = (value ?? "").trim();
  if (!t) return undefined;
  if (max != null && t.length > max) return t.slice(0, max);
  return t;
}

/** Invite / followed-post shaped payloads (backward compatible). */
export type PostRoutePushInput = {
  type: string;
  title?: string;
  body?: string;
  avatarUrl?: string;
  postId: string;
  postType: string;
  inviteId?: string;
  threadId?: string;
  threadKind?: string;
  actorId?: string;
  target?: string;
};

export function buildPostRouteFcmPayload(input: PostRoutePushInput): FcmDataPayload {
  const payload: FcmDataPayload = {
    type: input.type,
    postId: input.postId,
    postType: input.postType,
  };
  const title = trim(input.title);
  const body = trim(input.body);
  const avatarUrl = trim(input.avatarUrl);
  const inviteId = trim(input.inviteId);
  const threadId = trim(input.threadId);
  const threadKind = trim(input.threadKind);
  const actorId = trim(input.actorId);
  const target = trim(input.target);
  if (title) payload.title = title;
  if (body) payload.body = body;
  if (avatarUrl) payload.avatarUrl = avatarUrl;
  if (inviteId) payload.inviteId = inviteId;
  if (threadId) payload.threadId = threadId;
  if (threadKind) payload.threadKind = threadKind;
  if (actorId) payload.actorId = actorId;
  if (target) payload.target = target;
  return payload;
}

export type DmPushInput = {
  type: "dm_message" | "group_message";
  conversationId: string;
  messageId?: string;
  senderUserId: string;
  body: string;
  senderName?: string;
  avatarUrl?: string;
  groupName?: string;
};

export function buildDmFcmPayload(input: DmPushInput): FcmDataPayload {
  const preview = trim(input.body, 200) ?? "New message";
  const senderName = trim(input.senderName);
  const payload: FcmDataPayload = {
    type: input.type,
    conversationId: input.conversationId.trim(),
    senderUserId: input.senderUserId.trim(),
    body: preview,
  };
  const messageId = trim(input.messageId);
  if (messageId) payload.messageId = messageId;
  if (senderName) {
    payload.title = senderName;
    payload.senderName = senderName;
  }
  const avatarUrl = trim(input.avatarUrl);
  if (avatarUrl && !avatarUrl.startsWith("preset:")) {
    payload.avatarUrl = avatarUrl;
  }
  const groupName = trim(input.groupName);
  if (groupName) payload.groupName = groupName;
  return payload;
}

export type EventReminderPushInput = {
  postId: string;
  postType: string;
  body: string;
  occurrenceDate?: string;
};

export function buildEventReminderFcmPayload(
  input: EventReminderPushInput
): FcmDataPayload {
  const body = trim(input.body, 200) ?? "You have an event coming up";
  const payload: FcmDataPayload = {
    type: "event_reminder",
    postId: input.postId.trim(),
    postType: input.postType.trim(),
    body,
    target: "post_detail",
  };
  const occurrenceDate = trim(input.occurrenceDate);
  if (occurrenceDate) payload.occurrenceDate = occurrenceDate;
  return payload;
}

export type AdminCampaignPushInput = {
  title: string;
  body: string;
  postId?: string;
  postType?: string;
  targetPath?: string;
};

export function buildAdminCampaignFcmPayload(
  input: AdminCampaignPushInput
): FcmDataPayload {
  const title = trim(input.title, 120) ?? "EchoToo";
  const body = trim(input.body, 200) ?? "Check this out on EchoToo";
  const payload: FcmDataPayload = {
    type: "admin_campaign",
    title,
    body,
  };
  const postId = trim(input.postId);
  const postType = trim(input.postType);
  if (postId && postType) {
    payload.postId = postId;
    payload.postType = postType;
    return payload;
  }
  const targetPath = trim(input.targetPath);
  if (targetPath) payload.targetPath = targetPath;
  return payload;
}

export type OpenPlanRequestPushInput = {
  requestId: string;
  opportunityId: string;
  sourcePostId?: string;
  body?: string;
  title?: string;
};

/** Creator notify for a new Open Plan request — no requester identity fields. */
export function buildOpenPlanRequestFcmPayload(
  input: OpenPlanRequestPushInput
): FcmDataPayload {
  const requestId = input.requestId.trim();
  const opportunityId = input.opportunityId.trim();
  const body =
    trim(input.body, 200) ?? "Someone is interested in your open plan.";
  const title = trim(input.title, 80) ?? "Open Plan";
  const payload: FcmDataPayload = {
    type: "open_plan_request",
    requestId,
    opportunityId,
    title,
    body,
    targetPath: `/messages?tab=requests&requestId=${encodeURIComponent(requestId)}`,
  };
  const sourcePostId = trim(input.sourcePostId);
  if (sourcePostId) payload.sourcePostId = sourcePostId;
  return payload;
}
