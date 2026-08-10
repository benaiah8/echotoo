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
  routeData?: NotificationRouteData;
  createdAt: number;
  /** Auto-dismiss ms; default 4000 */
  durationMs?: number;
};

export const IN_APP_NOTIFICATION_DEFAULT_DURATION_MS = 4000;

type Listener = (notification: InAppNotificationPayload | null) => void;

let active: InAppNotificationPayload | null = null;
const listeners = new Set<Listener>();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

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
 */
export function showInAppNotification(
  payload: Omit<InAppNotificationPayload, "createdAt"> & {
    createdAt?: number;
  }
): void {
  clearDismissTimer();
  active = {
    ...payload,
    createdAt: payload.createdAt ?? Date.now(),
  };
  notify();
  const duration =
    payload.durationMs ?? IN_APP_NOTIFICATION_DEFAULT_DURATION_MS;
  if (duration > 0) {
    scheduleDismiss(duration);
  }
}

/** Dismiss active banner, or a specific id when provided. */
export function dismissInAppNotification(id?: string): void {
  if (id && active?.id !== id) return;
  clearDismissTimer();
  active = null;
  notify();
}
