/**
 * Kind-aware in-app banner copy (display only — routeData stays separate).
 */
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "./notificationKinds";
import { isObsoleteGoingRsvpPushPayload } from "../activitiesNotificationEligibility";

export type InAppNotificationDisplay = {
  title: string;
  body?: string;
  avatarUrl?: string;
  /** Shown when avatarUrl is absent and showAvatar is true */
  avatarInitial?: string;
  /** When false, banner uses text-only layout (no avatar column) */
  showAvatar?: boolean;
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const LEGACY_POSTED_PATTERN =
  /^(.+?\S)\s+posted a new (hangout|experience|event|place)\.?$/i;

const SHARED_SOMETHING_NEW_TITLE =
  /^(.+?\S)\s+shared something new\.?$/i;

const INVITE_CAPTION_SEPARATOR = /\n\n────────\nPost:\s*/;

const INVITED_YOU_PATTERN = /^(.+?\S)\s+invited you(?:\s+to a group)?\.?$/i;

function firstMeaningfulChar(text: string): string {
  const t = text.trim();
  if (!t) return "!";
  return t.charAt(0).toUpperCase();
}

function inviteFallbackBody(postType: string, threadKind: string): string {
  if (threadKind === "group") return "Invited you to a group";
  if (postType === "experience") return "Invited you to a post";
  return "Invited you to an event";
}

/** Strip post caption from combined invite push bodies (legacy payloads). */
export function extractInviteNoteFromBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed === "Tap to view invite") return "";

  const parts = trimmed.split(INVITE_CAPTION_SEPARATOR);
  const notePart = parts[0]?.trim() ?? "";
  if (notePart) return notePart;

  return "";
}

function resolveInviteTitle(data: Record<string, unknown>): string {
  const rawTitle = asTrimmed(data.title);
  if (rawTitle && INVITED_YOU_PATTERN.test(rawTitle)) {
    return rawTitle.replace(/\.$/, "");
  }
  if (rawTitle && !/^new invite$/i.test(rawTitle)) {
    return rawTitle.replace(/\.$/, "");
  }
  return "New invite";
}

function formatInvite(data: Record<string, unknown>): InAppNotificationDisplay {
  const rawBody = asTrimmed(data.body);
  const postType = asTrimmed(data.postType);
  const threadKind = asTrimmed(data.threadKind);
  const avatarUrl = asTrimmed(data.avatarUrl) || undefined;
  const title = resolveInviteTitle(data);

  const note = extractInviteNoteFromBody(rawBody);
  const likelyCaptionOnlyLegacy =
    Boolean(note) &&
    note === rawBody &&
    !rawBody.includes("\n\n────────\nPost:") &&
    rawBody.length > 60;
  const body = likelyCaptionOnlyLegacy
    ? inviteFallbackBody(postType, threadKind)
    : note || inviteFallbackBody(postType, threadKind);

  return {
    title,
    body,
    avatarUrl,
    showAvatar: true,
    avatarInitial: firstMeaningfulChar(title),
  };
}

function extractFollowedPostAuthorName(
  data: Record<string, unknown>
): string | null {
  const rawTitle = asTrimmed(data.title);
  const rawBody = asTrimmed(data.body);

  if (rawTitle) {
    const sharedTitle = rawTitle.match(SHARED_SOMETHING_NEW_TITLE);
    if (sharedTitle?.[1]) {
      const name = sharedTitle[1].trim();
      if (name.toLowerCase() !== "someone") return name;
    }
  }

  if (rawBody && rawBody !== "Tap to view") {
    const legacyBody = rawBody.match(LEGACY_POSTED_PATTERN);
    if (legacyBody?.[1]) return legacyBody[1].trim();

    const sharedBody = rawBody.match(SHARED_SOMETHING_NEW_TITLE);
    if (sharedBody?.[1]) {
      const name = sharedBody[1].trim();
      if (name.toLowerCase() !== "someone") return name;
    }
  }

  return null;
}

function formatFollowedPost(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const avatarUrl = asTrimmed(data.avatarUrl) || undefined;
  const name = extractFollowedPostAuthorName(data);
  const title = name
    ? `${name} shared something new`
    : "Someone shared something new";

  return {
    title,
    body: "Tap to view",
    avatarUrl,
    showAvatar: Boolean(avatarUrl),
  };
}

function formatEventReminder(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const rawBody = asTrimmed(data.body);
  return {
    title: "Event reminder",
    body: rawBody || "You have an event coming up",
    showAvatar: false,
  };
}

function formatAdminCampaign(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const rawTitle = asTrimmed(data.title);
  const rawBody = asTrimmed(data.body);
  return {
    title: rawTitle || "EchoToo",
    body: rawBody || "Check this out on EchoToo",
    showAvatar: false,
  };
}

function formatDmMessage(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const sender =
    asTrimmed(data.senderName) ||
    asTrimmed(data.displayName) ||
    asTrimmed(data.title);
  const preview =
    asTrimmed(data.body) ||
    asTrimmed(data.messagePreview) ||
    asTrimmed(data.preview);
  const avatarUrl = asTrimmed(data.avatarUrl) || undefined;
  const title = sender || "New message";
  return {
    title,
    body: preview || "Tap to open chat",
    avatarUrl,
    showAvatar: true,
    avatarInitial: firstMeaningfulChar(title),
  };
}

function formatGroupMessage(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const groupName =
    asTrimmed(data.groupName) ||
    asTrimmed(data.threadName) ||
    asTrimmed(data.title);
  const sender = asTrimmed(data.senderName) || asTrimmed(data.displayName);
  const preview =
    asTrimmed(data.body) ||
    asTrimmed(data.messagePreview) ||
    asTrimmed(data.preview);
  const title = groupName || "Group message";
  let body = preview;
  if (sender && preview) {
    body = `${sender}: ${preview}`;
  } else if (sender && !preview) {
    body = `${sender} sent a message`;
  } else if (!body) {
    body = "Tap to open chat";
  }
  return {
    title,
    body,
    showAvatar: true,
    avatarInitial: firstMeaningfulChar(title),
  };
}

function formatInviteResponseRsvp(
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const rawTitle = asTrimmed(data.title);
  const rawBody = asTrimmed(data.body);
  const avatarUrl = asTrimmed(data.avatarUrl) || undefined;
  const status = asTrimmed(data.status);
  const fallbackTitle =
    status === "accepted"
      ? "Invite accepted"
      : status === "declined"
        ? "Invite declined"
        : "Invite update";
  const title = rawTitle && !/^new rsvp$/i.test(rawTitle) ? rawTitle : fallbackTitle;
  return {
    title,
    body: rawBody || "Tap to view",
    avatarUrl,
    showAvatar: Boolean(avatarUrl),
    avatarInitial: firstMeaningfulChar(title),
  };
}

function formatActivity(
  kind: NotificationKind,
  data: Record<string, unknown>
): InAppNotificationDisplay {
  const rawTitle = asTrimmed(data.title);
  const rawBody = asTrimmed(data.body);
  const avatarUrl = asTrimmed(data.avatarUrl) || undefined;

  const kindFallback: Partial<Record<NotificationKind, string>> = {
    [NOTIFICATION_KINDS.ACTIVITY_LIKE]: "New like",
    [NOTIFICATION_KINDS.ACTIVITY_COMMENT]: "New comment",
    [NOTIFICATION_KINDS.ACTIVITY_FOLLOW]: "New follower",
  };

  const title = rawTitle || kindFallback[kind] || "Activity update";
  return {
    title,
    body: rawBody || "Tap to view",
    avatarUrl,
    showAvatar: Boolean(avatarUrl),
    avatarInitial: firstMeaningfulChar(title),
  };
}

/**
 * Format user-visible banner copy from normalized push data + kind.
 */
export function formatInAppNotificationDisplay(
  kind: NotificationKind,
  data: Record<string, unknown>
): InAppNotificationDisplay {
  switch (kind) {
    case NOTIFICATION_KINDS.INVITE:
      return formatInvite(data);
    case NOTIFICATION_KINDS.FOLLOWED_POST:
      return formatFollowedPost(data);
    case NOTIFICATION_KINDS.EVENT_REMINDER:
      return formatEventReminder(data);
    case NOTIFICATION_KINDS.ADMIN_CAMPAIGN:
      return formatAdminCampaign(data);
    case NOTIFICATION_KINDS.DM_MESSAGE:
      return formatDmMessage(data);
    case NOTIFICATION_KINDS.GROUP_MESSAGE:
      return formatGroupMessage(data);
    case NOTIFICATION_KINDS.ACTIVITY_LIKE:
    case NOTIFICATION_KINDS.ACTIVITY_COMMENT:
    case NOTIFICATION_KINDS.ACTIVITY_FOLLOW:
      return formatActivity(kind, data);
    case NOTIFICATION_KINDS.ACTIVITY_RSVP:
      if (isObsoleteGoingRsvpPushPayload({ ...data, type: data.type ?? "activity_rsvp" })) {
        return { title: "", showAvatar: false };
      }
      return formatInviteResponseRsvp(data);
    case NOTIFICATION_KINDS.OPEN_PLAN_REQUEST:
      return {
        title: asTrimmed(data.title) || "Open Plan",
        body:
          asTrimmed(data.body) ||
          "Someone is interested in your open plan.",
        showAvatar: false,
      };
    default:
      return {
        title: asTrimmed(data.title) || "Update",
        body: asTrimmed(data.body) || undefined,
        avatarUrl: asTrimmed(data.avatarUrl) || undefined,
        showAvatar: Boolean(asTrimmed(data.avatarUrl)),
        avatarInitial: firstMeaningfulChar(asTrimmed(data.title) || "U"),
      };
  }
}
