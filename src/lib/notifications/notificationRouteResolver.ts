/**
 * Shared route resolution for push taps, in-app banners, and future inbox rows.
 */
import {
  Paths,
  messagesConversationPathWithMessage,
  messagesRequestsPath,
  postDetailPath,
  profileByUsername,
} from "../../router/Paths";
import { resolveCommentNotificationPostPath } from "./commentNotificationRoute";
import {
  NOTIFICATION_KINDS,
  normalizeNotificationKind,
  type NotificationKind,
} from "./notificationKinds";

export type NotificationRouteData = Record<string, unknown>;

export type NotificationRouteMode = "navigate_full" | "navigate_modal";

export type NotificationRouteResult =
  | {
      supported: true;
      kind: NotificationKind;
      path: string;
      mode: NotificationRouteMode;
      /** Post detail modal: scroll comments into view (activity_comment). */
      scrollToComments?: boolean;
    }
  | {
      supported: false;
      kind: NotificationKind | null;
      reason: string;
    };

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Accept only same-origin in-app paths (`/foo`). Rejects external and protocol-relative URLs.
 */
export function sanitizeInternalTargetPath(raw: unknown): string | null {
  const t = asTrimmedString(raw);
  if (!t) return null;
  if (!t.startsWith("/")) return null;
  if (t.startsWith("//")) return null;
  if (/^https?:\/\//i.test(t)) return null;
  return t;
}

export function parsePostType(
  raw: unknown
): "hangout" | "experience" | null {
  const t = asTrimmedString(raw);
  if (t === "hangout" || t === "experience") return t;
  return null;
}

/** Preserves existing invite push deep-link shape. */
export function buildInviteNotificationsPath(
  data: NotificationRouteData | null | undefined
): string {
  const inviteId = asTrimmedString(data?.inviteId);
  const threadId = asTrimmedString(data?.threadId);
  const threadKind = asTrimmedString(data?.threadKind);
  if (!inviteId && !threadId) {
    return Paths.notification;
  }
  const params = new URLSearchParams();
  params.set("source", "push");
  if (inviteId) params.set("inviteId", inviteId);
  if (threadId) params.set("threadId", threadId);
  if (threadKind) params.set("threadKind", threadKind);
  return `${Paths.notification}?${params.toString()}`;
}

function resolvePostDetailRoute(
  data: NotificationRouteData,
  kind: NotificationKind
): NotificationRouteResult {
  const postId = asTrimmedString(data.postId);
  const postType = parsePostType(data.postType);
  if (!postId || !postType) {
    return {
      supported: false,
      kind,
      reason: "missing_postId_or_postType",
    };
  }
  return {
    supported: true,
    kind,
    path: postDetailPath(postType, postId),
    mode: "navigate_modal",
  };
}

function resolveDmConversationRoute(
  data: NotificationRouteData,
  kind: NotificationKind
): NotificationRouteResult {
  const conversationId = asTrimmedString(data.conversationId);
  if (!conversationId) {
    return {
      supported: false,
      kind,
      reason: "missing_conversationId",
    };
  }
  const messageId = asTrimmedString(data.messageId);
  return {
    supported: true,
    kind,
    path: messagesConversationPathWithMessage(conversationId, messageId),
    mode: "navigate_full",
  };
}

function resolveActivityCommentRoute(
  data: NotificationRouteData
): NotificationRouteResult {
  const postId = asTrimmedString(data.postId);
  const postType = parsePostType(data.postType);
  if (postId && postType) {
    return {
      supported: true,
      kind: NOTIFICATION_KINDS.ACTIVITY_COMMENT,
      path: postDetailPath(postType, postId),
      mode: "navigate_modal",
      scrollToComments: true,
    };
  }
  if (postId) {
    return {
      supported: true,
      kind: NOTIFICATION_KINDS.ACTIVITY_COMMENT,
      path: resolveCommentNotificationPostPath(postId, null),
      mode: "navigate_modal",
      scrollToComments: true,
    };
  }
  return {
    supported: false,
    kind: NOTIFICATION_KINDS.ACTIVITY_COMMENT,
    reason: "missing_postId",
  };
}

function resolveActivityFollowRoute(
  data: NotificationRouteData
): NotificationRouteResult {
  const username =
    asTrimmedString(data.actorUsername) || asTrimmedString(data.username);
  if (!username) {
    return {
      supported: false,
      kind: NOTIFICATION_KINDS.ACTIVITY_FOLLOW,
      reason: "missing_actor_username",
    };
  }
  return {
    supported: true,
    kind: NOTIFICATION_KINDS.ACTIVITY_FOLLOW,
    path: profileByUsername(username),
    mode: "navigate_full",
  };
}

/**
 * Resolve a notification payload to a navigable route.
 * Unknown/future kinds return supported:false without throwing.
 */
export function resolveNotificationRoute(
  data: NotificationRouteData | null | undefined
): NotificationRouteResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { supported: false, kind: null, reason: "invalid_payload" };
  }

  const explicitKind = normalizeNotificationKind(data.type);
  const kind = explicitKind ?? NOTIFICATION_KINDS.FOLLOWED_POST;

  if (kind === NOTIFICATION_KINDS.INVITE) {
    return {
      supported: true,
      kind,
      path: buildInviteNotificationsPath(data),
      mode: "navigate_full",
    };
  }

  if (kind === NOTIFICATION_KINDS.ACTIVITY_FOLLOW) {
    return resolveActivityFollowRoute(data);
  }

  if (kind === NOTIFICATION_KINDS.ACTIVITY_COMMENT) {
    return resolveActivityCommentRoute(data);
  }

  if (
    kind === NOTIFICATION_KINDS.DM_MESSAGE ||
    kind === NOTIFICATION_KINDS.GROUP_MESSAGE
  ) {
    return resolveDmConversationRoute(data, kind);
  }

  if (kind === NOTIFICATION_KINDS.OPEN_PLAN_REQUEST) {
    const requestId = asTrimmedString(data.requestId);
    const targetPath = sanitizeInternalTargetPath(data.targetPath);
    return {
      supported: true,
      kind,
      path:
        targetPath ??
        messagesRequestsPath(requestId || undefined),
      mode: "navigate_full",
    };
  }

  if (kind === NOTIFICATION_KINDS.ADMIN_CAMPAIGN) {
    const targetPath = sanitizeInternalTargetPath(data.targetPath);
    if (targetPath) {
      return {
        supported: true,
        kind,
        path: targetPath,
        mode: "navigate_full",
      };
    }
    return resolvePostDetailRoute(data, kind);
  }

  if (
    kind === NOTIFICATION_KINDS.FOLLOWED_POST ||
    kind === NOTIFICATION_KINDS.EVENT_REMINDER
  ) {
    return resolvePostDetailRoute(data, kind);
  }

  // Legacy post push without type field: postId + postType only
  if (!explicitKind) {
    const postId = asTrimmedString(data.postId);
    const postType = parsePostType(data.postType);
    if (postId && postType) {
      return {
        supported: true,
        kind: NOTIFICATION_KINDS.FOLLOWED_POST,
        path: postDetailPath(postType, postId),
        mode: "navigate_modal",
      };
    }
  }

  // Future kinds: safe internal targetPath only (no post/DM fields required)
  if (explicitKind) {
    const fallbackTarget = sanitizeInternalTargetPath(data.targetPath);
    if (fallbackTarget) {
      return {
        supported: true,
        kind: explicitKind,
        path: fallbackTarget,
        mode: "navigate_full",
      };
    }
  }

  return {
    supported: false,
    kind: explicitKind,
    reason: "unsupported_kind",
  };
}

export function isNotificationsTabPath(path: string): boolean {
  const withoutQuery = path.trim().split("?")[0] ?? "";
  return (
    withoutQuery === Paths.notification ||
    withoutQuery.startsWith("/notifications")
  );
}
