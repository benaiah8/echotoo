/**
 * Client-only in-app notification banner bus (foreground delivery).
 */
import type { NotificationKind } from "./notificationKinds";
import type { NotificationRouteData } from "./notificationRouteResolver";

export type InAppNotificationPayload = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  avatarUrl?: string;
  /** Shown when avatarUrl is absent and showAvatar is true */
  avatarInitial?: string;
  /** When false, banner uses text-only layout (no avatar column) */
  showAvatar?: boolean;
  routeData?: NotificationRouteData;
  createdAt: number;
  /** Auto-dismiss ms; default 4000 */
  durationMs?: number;
};

export const IN_APP_NOTIFICATION_DEFAULT_DURATION_MS = 4000;

/** Bound recent banner ids so duplicate FG pushes for the same messageId show once. */
const RECENT_BANNER_IDS_MAX = 48;

type Listener = (notification: InAppNotificationPayload | null) => void;

let active: InAppNotificationPayload | null = null;
const listeners = new Set<Listener>();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
const recentBannerIds: string[] = [];
const recentBannerIdSet = new Set<string>();

function notify(): void {
  for (const listener of listeners) {
    listener(active);
  }
}

function clearDismissTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function scheduleDismiss(durationMs: number): void {
  clearDismissTimer();
  dismissTimer = setTimeout(() => {
    dismissInAppNotification(active?.id);
  }, durationMs);
}

function rememberBannerId(id: string): void {
  if (recentBannerIdSet.has(id)) return;
  recentBannerIds.push(id);
  recentBannerIdSet.add(id);
  while (recentBannerIds.length > RECENT_BANNER_IDS_MAX) {
    const oldest = recentBannerIds.shift();
    if (oldest) recentBannerIdSet.delete(oldest);
  }
}

/** True when this banner id was shown recently (duplicate FG delivery). */
export function wasInAppNotificationIdRecentlyShown(id: string): boolean {
  const key = (id ?? "").trim();
  if (!key) return false;
  return recentBannerIdSet.has(key);
}

export function subscribeInAppNotifications(
  listener: Listener
): () => void {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveInAppNotification(): InAppNotificationPayload | null {
  return active;
}

/**
 * Show or replace the current banner (MVP: single slot).
 * Skips when `payload.id` was already shown recently (messageId dedupe).
 */
export function showInAppNotification(
  payload: Omit<InAppNotificationPayload, "createdAt"> & {
    createdAt?: number;
  }
): boolean {
  const id = (payload.id ?? "").trim();
  if (id && recentBannerIdSet.has(id)) {
    return false;
  }
  if (id) rememberBannerId(id);

  clearDismissTimer();
  active = {
    ...payload,
    id: id || payload.id,
    createdAt: payload.createdAt ?? Date.now(),
  };
  notify();
  const duration =
    payload.durationMs ?? IN_APP_NOTIFICATION_DEFAULT_DURATION_MS;
  if (duration > 0) {
    scheduleDismiss(duration);
  }
  return true;
}

/** Dismiss active banner, or a specific id when provided. */
export function dismissInAppNotification(id?: string): void {
  if (id && active?.id !== id) return;
  clearDismissTimer();
  active = null;
  notify();
}
