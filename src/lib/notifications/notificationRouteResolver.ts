/**
 * Shared route resolution for push taps, in-app banners, and future inbox rows.
 */
import { Paths, postDetailPath } from "../../router/Paths";
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
    }
  | {
      supported: false;
      kind: NotificationKind | null;
      reason: string;
    };

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  if (
    kind === NOTIFICATION_KINDS.FOLLOWED_POST ||
    kind === NOTIFICATION_KINDS.EVENT_REMINDER ||
    kind === NOTIFICATION_KINDS.ADMIN_CAMPAIGN
  ) {
    return resolvePostDetailRoute(data, kind);
  }

  if (
    kind === NOTIFICATION_KINDS.DM_MESSAGE ||
    kind === NOTIFICATION_KINDS.GROUP_MESSAGE
  ) {
    return {
      supported: false,
      kind,
      reason: "screen_not_implemented",
    };
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

  return {
    supported: false,
    kind: explicitKind,
    reason: "unsupported_kind",
  };
}

export function isNotificationsTabPath(path: string): boolean {
  const p = path.trim();
  return p === Paths.notification || p.startsWith("/notifications");
}
