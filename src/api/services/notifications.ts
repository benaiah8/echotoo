import { supabase } from "../../lib/supabaseClient";
import {
  type Notification,
  type NotificationWithActor,
  type CreateNotificationData,
} from "../../types/notification";
import { getViewerAuthUserId } from "./follows";
import {
  getCachedNotificationCount,
  setCachedNotificationCount,
  clearCachedNotificationCount,
} from "../../lib/notificationCountCache";

// [OPTIMIZATION: StrictMode] Short TTL response cache to prevent duplicate requests
// when React 18 StrictMode remounts (mount→unmount→mount). RequestManager only
// dedupes in-flight; this cache catches the 2nd call after the 1st completed.
const notificationsResponseCache = new Map<
  string,
  { ts: number; data: NotificationWithActor[] }
>();
const NOTIFICATIONS_TTL_MS = 4000;

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
 */
export async function getNotifications(
  limit = 20,
  offset = 0
): Promise<NotificationWithActor[]> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  const dedupeKey = `notifications_${userId}_${limit}_${offset}`;

  // [OPTIMIZATION: StrictMode] Check cache first - prevents 2nd network call
  // when component remounts after 1st call completed (RequestManager no longer in-flight)
  const cached = notificationsResponseCache.get(dedupeKey);
  if (cached && Date.now() - cached.ts < NOTIFICATIONS_TTL_MS) {
    return cached.data;
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

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // [ABORT CHECK] Check if aborted after async operation
      if (signal.aborted) {
        throw new Error("Request aborted");
      }

      if (error) throw error;

      const notifications = (data || []) as Notification[];

      // Debug: Log invite notifications
      const inviteNotifications = notifications.filter(
        (n) => n.type === "invite"
      );
      if (inviteNotifications.length > 0) {
        console.log(
          `Found ${inviteNotifications.length} invite notifications:`,
          inviteNotifications.map((n) => ({
            id: n.id,
            type: n.type,
            user_id: n.user_id,
            actor_id: n.actor_id,
            invite_direction: (n.additional_data as any)?.invite_direction,
          }))
        );
      }

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

          // Debug: Log missing actor profiles for invite notifications
          const missingActors = inviteNotifications
            .filter((n) => n.actor_id && !actors[n.actor_id])
            .map((n) => n.actor_id);
          if (missingActors.length > 0) {
            console.warn(
              "Missing actor profiles for invite notifications:",
              missingActors
            );
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

      // Debug: Log final invite notifications with actor data
      const finalInviteNotifications = finalResult.filter(
        (n) => n.type === "invite"
      );
      if (finalInviteNotifications.length > 0) {
        console.log(
          `Returning ${finalInviteNotifications.length} invite notifications with actor data:`,
          finalInviteNotifications.map((n) => ({
            id: n.id,
            type: n.type,
            actor: n.actor
              ? { user_id: n.actor.user_id, username: n.actor.username }
              : null,
            invite_direction: (n.additional_data as any)?.invite_direction,
          }))
        );
      }

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
 * Get unread notification count for the current user
 * [OPTIMIZATION: Phase 2] Cached with RequestManager deduplication
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await getViewerAuthUserId();
  if (!userId) throw new Error("User not authenticated");

  // [OPTIMIZATION] Check cache first (fast, synchronous path)
  const cachedCount = getCachedNotificationCount(userId);
  if (cachedCount !== null) {
    return cachedCount;
  }

  // [OPTIMIZATION] Use RequestManager for deduplication
  // Multiple components calling this simultaneously will share the same request
  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = `notification_count_${userId}`;

  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      // [RACE CONDITION FIX] Check cache again inside RequestManager
      // Another call might have populated it
      const cachedCountAgain = getCachedNotificationCount(userId);
      if (cachedCountAgain !== null) {
        return cachedCountAgain;
      }

      // [ABORT CHECK] Check if aborted before making request
      if (signal.aborted) {
        return 0;
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      // [ABORT CHECK] Check if aborted after async operation
      if (signal.aborted) {
        return 0;
      }

      if (error) throw error;
      const finalCount = count || 0;

      // [CACHE UPDATE] Cache the result
      setCachedNotificationCount(userId, finalCount);

      return finalCount;
    },
    "high" // High priority - needed by BottomTab on mount
  );

  return result.data ?? 0;
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

/**
 * Create notifications for followers when a user posts
 */
export async function createPostNotifications(
  postId: string,
  postType: "hangout" | "experience",
  authorId: string
): Promise<void> {
  try {
    // Get all followers of the author
    const { data: followers, error: followersError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", authorId);

    if (followersError) {
      console.error("Error fetching followers:", followersError);
      return;
    }

    if (!followers || followers.length === 0) {
      return; // No followers to notify
    }

    // Get notification settings for these followers
    const followerIds = followers.map((f) => f.follower_id);
    const { data: notificationSettings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("user_id")
      .eq("target_user_id", authorId)
      .in("user_id", followerIds)
      .eq("enabled", true);

    if (settingsError) {
      console.error("Error fetching notification settings:", settingsError);
      // Fallback: notify all followers if settings query fails
      const notifications = followers.map((follow) => ({
        user_id: follow.follower_id,
        actor_id: authorId,
        type: "post" as const,
        entity_type: postType,
        entity_id: postId,
        additional_data: {},
      }));

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Error creating post notifications:", insertError);
      }
      return;
    }

    // Only notify followers who have notifications enabled
    const enabledFollowerIds = new Set(
      notificationSettings?.map((s) => s.user_id) || []
    );
    const notificationsToCreate = followers
      .filter((follow) => enabledFollowerIds.has(follow.follower_id))
      .map((follow) => ({
        user_id: follow.follower_id,
        actor_id: authorId,
        type: "post" as const,
        entity_type: postType,
        entity_id: postId,
        additional_data: {},
      }));

    if (notificationsToCreate.length === 0) {
      return; // No enabled notifications to send
    }

    // Insert notifications
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationsToCreate);

    if (insertError) {
      console.error("Error creating post notifications:", insertError);
    }
  } catch (error) {
    console.error("Error in createPostNotifications:", error);
  }
}
