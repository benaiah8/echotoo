/**
 * Persistent (localStorage) snapshot of notification list tabs for instant hydrate after cold start.
 * Keys are user-scoped; clear on logout via clearAllNotificationListCaches / clearNotificationListCacheForUser.
 */

import type { NotificationWithActor } from "../types/notification";

export const NOTIFICATION_LIST_CACHE_KEY_PREFIX = "notif_list_v1:";
export const NOTIFICATION_LIST_CACHE_MAX_ROWS = 50;
export const NOTIFICATION_LIST_CACHE_SCHEMA_VERSION = 1 as const;

export type NotificationListPersistedTab = "invites" | "activity";

export type NotificationListPersistedPayload = {
  version: typeof NOTIFICATION_LIST_CACHE_SCHEMA_VERSION;
  notifications: NotificationWithActor[];
  hasMore: boolean;
  batchedFollowStatuses: Record<
    string,
    "none" | "pending" | "following" | "friends"
  >;
  ts: number;
};

function storageKey(userId: string, tab: NotificationListPersistedTab): string {
  return `${NOTIFICATION_LIST_CACHE_KEY_PREFIX}${userId}:${tab}`;
}

function trimNotificationsForPersistence(
  list: NotificationWithActor[]
): NotificationWithActor[] {
  if (list.length <= NOTIFICATION_LIST_CACHE_MAX_ROWS) return list;
  return list.slice(0, NOTIFICATION_LIST_CACHE_MAX_ROWS);
}

export function readPersistedNotificationList(
  userId: string,
  tab: NotificationListPersistedTab
): NotificationListPersistedPayload | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, tab));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.version !== NOTIFICATION_LIST_CACHE_SCHEMA_VERSION) return null;
    if (!Array.isArray(o.notifications)) return null;
    if (typeof o.hasMore !== "boolean") return null;
    if (typeof o.ts !== "number" || !Number.isFinite(o.ts)) return null;
    if (!o.batchedFollowStatuses || typeof o.batchedFollowStatuses !== "object") {
      return null;
    }
    return {
      version: NOTIFICATION_LIST_CACHE_SCHEMA_VERSION,
      notifications: o.notifications as NotificationWithActor[],
      hasMore: o.hasMore,
      batchedFollowStatuses: o.batchedFollowStatuses as Record<
        string,
        "none" | "pending" | "following" | "friends"
      >,
      ts: o.ts,
    };
  } catch {
    return null;
  }
}

export function writePersistedNotificationList(
  userId: string,
  tab: NotificationListPersistedTab,
  payload: Omit<NotificationListPersistedPayload, "version"> & {
    version?: typeof NOTIFICATION_LIST_CACHE_SCHEMA_VERSION;
  }
): void {
  if (!userId) return;
  try {
    const toStore: NotificationListPersistedPayload = {
      version: NOTIFICATION_LIST_CACHE_SCHEMA_VERSION,
      notifications: trimNotificationsForPersistence(payload.notifications),
      hasMore: payload.hasMore,
      batchedFollowStatuses: payload.batchedFollowStatuses,
      ts: payload.ts,
    };
    localStorage.setItem(storageKey(userId, tab), JSON.stringify(toStore));
  } catch (e) {
    console.warn("[notificationListCache] write failed:", e);
  }
}

/** Remove persisted list rows for one auth user (both tabs). */
export function clearNotificationListCacheForUser(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKey(userId, "invites"));
    localStorage.removeItem(storageKey(userId, "activity"));
  } catch {
    /* ignore */
  }
}

/** Remove all notif_list_v1:* entries (e.g. SIGNED_OUT when prior user id may be unavailable). */
export function clearAllNotificationListCaches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NOTIFICATION_LIST_CACHE_KEY_PREFIX)) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      localStorage.removeItem(k);
    }
  } catch (e) {
    console.warn("[notificationListCache] clearAll failed:", e);
  }
}
