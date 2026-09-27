/**
 * Normalize FCM/Capacitor push data into an in-app banner payload.
 */
import {
  NOTIFICATION_KINDS,
  normalizeNotificationKind,
  type NotificationKind,
} from "./notificationKinds";
import type { InAppNotificationPayload } from "./inAppNotificationBus";
import { formatInAppNotificationDisplay } from "./formatInAppNotificationDisplay";
import { devLogInAppNotification } from "./inAppNotificationDevLog";
import {
  normalizePushRouteData,
  pushRouteDataKeyMeta,
} from "./normalizePushRouteData";
import { resolveNotificationRoute } from "./notificationRouteResolver";
import { isObsoleteGoingRsvpPushPayload } from "../activitiesNotificationEligibility";

function inferKind(data: Record<string, unknown>): NotificationKind {
  const explicit = normalizeNotificationKind(data.type);
  if (explicit) return explicit;
  const rawType = typeof data.type === "string" ? data.type.trim() : "";
  if (rawType === "rsvp") return NOTIFICATION_KINDS.ACTIVITY_RSVP;
  const postId =
    typeof data.postId === "string" ? data.postId.trim() : "";
  const postType =
    typeof data.postType === "string" ? data.postType.trim() : "";
  if (postId && (postType === "hangout" || postType === "experience")) {
    return NOTIFICATION_KINDS.FOLLOWED_POST;
  }
  return NOTIFICATION_KINDS.FOLLOWED_POST;
}

function bannerIdFromRouteData(
  routeData: Record<string, unknown>,
  idPrefix: string
): string {
  const messageId =
    typeof routeData.messageId === "string" ? routeData.messageId.trim() : "";
  if (messageId) return messageId;
  const requestId =
    typeof routeData.requestId === "string" ? routeData.requestId.trim() : "";
  if (requestId) return `open_plan_request:${requestId}`;
  return `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a banner payload from push `data`. Returns null when payload is empty/invalid.
 * `routeData` preserves all normalized routing fields; display copy is formatted separately.
 * When `messageId` is present it becomes the banner id (FG dedupe key).
 */
export function inAppNotificationFromPushData(
  raw: unknown,
  options?: {
    idPrefix?: string;
    notification?: { title?: string; body?: string } | null;
  }
): InAppNotificationPayload | null {
  const routeData = normalizePushRouteData(raw, options?.notification);
  if (Object.keys(routeData).length === 0) return null;
  if (isObsoleteGoingRsvpPushPayload(routeData)) return null;

  const kind = inferKind(routeData);
  const display = formatInAppNotificationDisplay(kind, routeData);
  const route = resolveNotificationRoute(routeData);
  const id = bannerIdFromRouteData(
    routeData,
    options?.idPrefix ?? "push"
  );

  if (!display.title && !display.body) return null;

  devLogInAppNotification("payload_built", {
    kind,
    ...pushRouteDataKeyMeta(routeData),
    routeSupported: route.supported,
    routeReason: route.supported ? undefined : route.reason,
    bannerId: id,
  });

  return {
    id,
    kind,
    title: display.title,
    body: display.body,
    avatarUrl: display.avatarUrl,
    avatarInitial: display.avatarInitial,
    showAvatar: display.showAvatar,
    routeData,
    createdAt: Date.now(),
    durationMs: 4000,
  };
}
