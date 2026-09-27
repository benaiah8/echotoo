import { supabase } from "../../lib/supabaseClient";
import {
  type Notification,
  type NotificationWithActor,
  type CreateNotificationData,
} from "../../types/notification";
import { getViewerAuthUserId } from "./follows";
import {
  getCachedNotificationCount,
  getCachedNotificationBadgeData,
  setCachedNotificationCount,
  clearCachedNotificationCount,
} from "../../lib/notificationCountCache";
import { ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR } from "../../lib/activitiesNotificationEligibility";

// [OPTIMIZATION: StrictMode] Short TTL response cache to prevent duplicate requests
// when React 18 StrictMode remounts (mount→unmount→mount). RequestManager only
// dedupes in-flight; this cache catches the 2nd call after the 1st completed.
const notificationsResponseCache = new Map<
  string,
  { ts: number; data: NotificationWithActor[] }
>();
const NOTIFICATIONS_TTL_MS = 4000;

export type NotificationBadgeData = {
  total: number;
  inviteUnread: number;
  activityUnread: number;
};

/**
 * Unread head counts: total, invite-only, activities-surface
 * (excludes invite, saved, and obsolete Going RSVP).
 * Cached together for bottom-tab / Messages Activities badge.
 */
async function loadNotificationBadgeDataFromNetwork(
  userId: string,
  signal?: AbortSignal
): Promise<NotificationBadgeData> {
  const base = () =>
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

  if (signal?.aborted) {
    return { total: 0, inviteUnread: 0, activityUnread: 0 };
  }

  const [rTotal, rInvite, rAct] = await Promise.all([
    base(),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .eq("type", "invite"),
    // M3C: match Activities surface — exclude invite, saved, and obsolete Going RSVP.
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .not("type", "in", "(invite,saved)")
      .or(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR),
  ]);

  if (signal?.aborted) {
    return { total: 0, inviteUnread: 0, activityUnread: 0 };
  }

  if (rTotal.error) throw rTotal.error;
  if (rInvite.error) throw rInvite.error;
  if (rAct.error) throw rAct.error;

  const total = rTotal.count ?? 0;
  const inviteUnread = rInvite.count ?? 0;
  const activityUnread = rAct.count ?? 0;

  setCachedNotificationCount(userId, total, { inviteUnread, activityUnread });
  return { total, inviteUnread, activityUnread };
}

/**
 * Total unread + per-category split (for bottom tab badge ring). Uses same cache as getUnreadNotificationCount.
 */
export async function getNotificationBadgeData(): Promise<NotificationBadgeData> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const cached = getCachedNotificationBadgeData(userId);
  if (cached) {
    return {
      total: cached.count,
      inviteUnread: cached.inviteUnread,
      activityUnread: cached.activityUnread,
    };
  }

  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = `notification_badge_data_${userId}`;

  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      const again = getCachedNotificationBadgeData(userId);
      if (again) {
        return {
          total: again.count,
          inviteUnread: again.inviteUnread,
          activityUnread: again.activityUnread,
        };
      }
      if (signal.aborted) {
        return { total: 0, inviteUnread: 0, activityUnread: 0 };
      }
      return loadNotificationBadgeDataFromNetwork(userId, signal);
    },
    "high"
  );

  return result.data ?? { total: 0, inviteUnread: 0, activityUnread: 0 };
}

/**
 * M3D.1c — Newest eligible Activities-surface notification `created_at` (epoch ms).
 * Excludes invite, saved, and obsolete Going RSVP. Bounded limit-1; not unread-based.
 * Returns null when none exist or on abort; throws on query error.
 */
export async function getLatestEligibleActivityCreatedAt(): Promise<number | null> {
  const userId = await getViewerAuthUserId();
  if (!userId) return null;

  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = `latest_eligible_activity_created_at_${userId}`;

  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      if (signal.aborted) return null;
      const { data, error } = await supabase
        .from("notifications")
        .select("created_at")
        .eq("user_id", userId)
        .not("type", "in", "(invite,saved)")
        .or(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (signal.aborted) return null;
      if (error) throw error;
      if (!data?.created_at) return null;
      const ms = Date.parse(data.created_at);
      return Number.isFinite(ms) ? ms : null;
    },
    "high"
  );

  return result.data ?? null;
}

/**
 * Clear the notifications response cache (call when user marks read, deletes, etc.)
 */
export function clearNotificationsResponseCache(): void {
  notificationsResponseCache.clear();
}

/**
 * Get notifications for the current user
 * [OPTIMIZATION: Phase 2] Uses RequestManager for deduplication
 * [OPTIMIZATION: StrictMode] Uses short TTL response cache for remount duplicates
 * @param options.typeGroup — optional filter: invite-only or all non-invite (activity)
 * @param options.bypassResponseCache — when true, always hit network (still writes cache after success)
 */
export async function getNotifications(
  limit = 20,
  offset = 0,
  options?: { typeGroup?: "invite" | "activity"; bypassResponseCache?: boolean }
): Promise<NotificationWithActor[]> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const tg = options?.typeGroup;
  const bypassResponseCache = options?.bypassResponseCache === true;
  const dedupeKey = `notifications_${userId}_${limit}_${offset}_${tg ?? "all"}`;

  // [OPTIMIZATION: StrictMode] Check cache first - prevents 2nd network call
  // when component remounts after 1st call completed (RequestManager no longer in-flight)
  if (!bypassResponseCache) {
    const cached = notificationsResponseCache.get(dedupeKey);
    if (cached && Date.now() - cached.ts < NOTIFICATIONS_TTL_MS) {
      return cached.data;
    }
  }

  // [OPTIMIZATION] Use RequestManager for in-flight deduplication
  const { requestManager } = await import("../../lib/requestManager");
  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      // [ABORT CHECK] Check if aborted before making request
      if (signal.aborted) {
        throw new Error("Request aborted");
      }

      let q = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (tg === "invite") {
        q = q.eq("type", "invite");
      } else if (tg === "activity") {
        q = q
          .neq("type", "invite")
          .or(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR);
      }
      const { data, error } = await q.range(offset, offset + limit - 1);

      // [ABORT CHECK] Check if aborted after async operation
      if (signal.aborted) {
        throw new Error("Request aborted");
      }

      if (error) throw error;

      const notifications = (data || []) as Notification[];
      /** Invite rows only — used for missing-actor diagnostics (no verbose enumeration logs). */
      const inviteNotifications = notifications.filter(
        (n) => n.type === "invite"
      );

      // Get unique actor IDs
      const actorIds = notifications
        .map((n) => n.actor_id)
        .filter((id): id is string => id !== null);

      // Fetch actor profiles for those IDs
      let actors: Record<string, any> = {};
      if (actorIds.length > 0) {
        // [PHASE 2.3 - OPTIMIZATION] Use getProfilesByUserIds() for caching and deduplication
        const { getProfilesByUserIds } = await import("./follows");

        try {
          const profiles = await getProfilesByUserIds(actorIds);
          // Map to expected format: user_id, username, display_name, avatar_url
          const mappedProfiles = profiles.map((p) => ({
            user_id: p.user_id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          }));

          actors = mappedProfiles.reduce((acc, profile) => {
            acc[profile.user_id] = profile;
            return acc;
          }, {} as Record<string, any>);

          // Missing actor diagnostics (invite rows only — dev-only IDs in log)
          if (import.meta.env.DEV) {
            const missingActors = inviteNotifications
              .filter((n) => n.actor_id && !actors[n.actor_id])
              .map((n) => n.actor_id);
            if (missingActors.length > 0) {
              console.warn(
                "Missing actor profiles for invite notifications:",
                missingActors
              );
            }
          }
        } catch (error) {
          console.error("Error fetching actor profiles:", error);
        }
      }

      // Combine notifications with actor data
      const finalResult = notifications.map((notification) => ({
        ...notification,
        actor: notification.actor_id
          ? actors[notification.actor_id] || null
          : null,
      }));

      return finalResult;
    },
    "high" // High priority - needed by NotificationList on mount
  );

  if (result.error) {
    throw result.error;
  }

  const data = result.data ?? [];
  notificationsResponseCache.set(dedupeKey, { ts: Date.now(), data });
  return data;
}

/**
 * Attach actor profile to a single notification row (e.g. Supabase Realtime payload).
 */
export async function hydrateNotificationWithActor(
  notification: Notification
): Promise<NotificationWithActor> {
  if (!notification.actor_id) {
    return { ...notification, actor: null };
  }
  const { getProfilesByUserIds } = await import("./follows");
  try {
    const profiles = await getProfilesByUserIds([notification.actor_id]);
    const p = profiles[0];
    if (!p) {
      return { ...notification, actor: null };
    }
    return {
      ...notification,
      actor: {
        id: p.user_id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      },
    };
  } catch (e) {
    console.warn("[hydrateNotificationWithActor] failed:", e);
    return { ...notification, actor: null };
  }
}

/**
 * Get unread notification count for the current user
 * [OPTIMIZATION: Phase 2] Shares cache + network fetch with getNotificationBadgeData
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const cachedCount = getCachedNotificationCount(userId);
  if (cachedCount !== null) {
    return cachedCount;
  }

  const d = await getNotificationBadgeData();
  return d.total;
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId); // Ensure user can only update their own notifications

  if (error) throw error;

  // [OPTIMIZATION] Invalidate notification count cache
  clearCachedNotificationCount(userId);
  clearNotificationsResponseCache();

  window.dispatchEvent(new CustomEvent("notifications:updated"));
}

/**
 * Mark all notifications as read for the current user
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;

  // [OPTIMIZATION] Invalidate notification count cache
  clearCachedNotificationCount(userId);
  clearNotificationsResponseCache();

  window.dispatchEvent(new CustomEvent("notifications:updated"));
}

/**
 * Mark unread **invite** (type=invite) or **activity** (type≠invite) rows only.
 * No schema change; same RLS as single-row updates.
 */
export async function markViewNotificationsAsRead(
  typeGroup: "invite" | "activity"
): Promise<void> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  let q = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (typeGroup === "invite") {
    q = q.eq("type", "invite");
  } else {
    q = q.neq("type", "invite");
  }

  const { error } = await q;

  if (error) throw error;

  clearCachedNotificationCount(userId);
  clearNotificationsResponseCache();
  window.dispatchEvent(new CustomEvent("notifications:updated"));
}

/**
 * Mark specific notification rows read (e.g. current list on screen). Empty id list is a no-op.
 */
export async function markNotificationIdsAsRead(
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .in("id", ids);

  if (error) throw error;

  clearCachedNotificationCount(userId);
  clearNotificationsResponseCache();
  window.dispatchEvent(new CustomEvent("notifications:updated"));
}

/**
 * Create a notification (server-side only - should be called from triggers or admin functions)
 */
export async function createNotification(
  data: CreateNotificationData
): Promise<Notification> {
  const { data: result, error } = await supabase
    .from("notifications")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return result;
}

/**
 * Delete a notification (for cleanup or user action)
 */
export async function deleteNotification(
  notificationId: string
): Promise<void> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId); // Ensure user can only update their own notifications

  if (error) throw error;

  // [OPTIMIZATION] Invalidate notification count cache
  clearCachedNotificationCount(userId);
  clearNotificationsResponseCache();

  window.dispatchEvent(new CustomEvent("notifications:updated"));
}
