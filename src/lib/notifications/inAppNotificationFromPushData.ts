/**
 * Normalize FCM/Capacitor push data into an in-app banner payload.
 */
import {
  NOTIFICATION_KINDS,
  normalizeNotificationKind,
  type NotificationKind,
} from "./notificationKinds";
import type { InAppNotificationPayload } from "./inAppNotificationBus";
import { resolveNotificationRoute } from "./notificationRouteResolver";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferKind(data: Record<string, unknown>): NotificationKind {
  const explicit = normalizeNotificationKind(data.type);
  if (explicit) return explicit;
  const postId = asTrimmedString(data.postId);
  const postType = asTrimmedString(data.postType);
  if (postId && (postType === "hangout" || postType === "experience")) {
    return NOTIFICATION_KINDS.FOLLOWED_POST;
  }
  return NOTIFICATION_KINDS.FOLLOWED_POST;
}

function inferTitle(data: Record<string, unknown>, kind: NotificationKind): string {
  const fromData = asTrimmedString(data.title);
  if (fromData) return fromData;
  const notificationTitle = asTrimmedString(
    (data as { notification?: { title?: unknown } }).notification?.title
  );
  if (notificationTitle) return notificationTitle;
  switch (kind) {
    case NOTIFICATION_KINDS.INVITE:
      return "New invite";
    case NOTIFICATION_KINDS.EVENT_REMINDER:
      return "Event reminder";
    case NOTIFICATION_KINDS.ADMIN_CAMPAIGN:
      return "Announcement";
    default:
      return "Notification";
  }
}

function inferBody(data: Record<string, unknown>): string | undefined {
  const fromData = asTrimmedString(data.body);
  if (fromData) return fromData;
  const notificationBody = asTrimmedString(
    (data as { notification?: { body?: unknown } }).notification?.body
  );
  return notificationBody || undefined;
}

/**
 * Build a banner payload from push `data`. Returns null when payload is empty/invalid.
 */
export function inAppNotificationFromPushData(
  raw: unknown,
  options?: { idPrefix?: string }
): InAppNotificationPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const kind = inferKind(data);
  const route = resolveNotificationRoute(data);
  const title = inferTitle(data, kind);
  const body = inferBody(data);
  const avatarUrl = asTrimmedString(data.avatarUrl) || undefined;
  const id = `${options?.idPrefix ?? "push"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!title && !body) return null;

  return {
    id,
    kind,
    title,
    body,
    avatarUrl,
    routeData: data,
    createdAt: Date.now(),
    durationMs: 4000,
    ...(route.supported ? {} : {}),
  };
}
