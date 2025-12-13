import { supabase } from "../../lib/supabaseClient";
import {
  type Notification,
  type NotificationWithActor,
  type CreateNotificationData,
} from "../../types/notification";

/**
 * Get notifications for the current user
 */
export async function getNotifications(
  limit = 20,
  offset = 0
): Promise<NotificationWithActor[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const notifications = (data || []) as Notification[];

  // Debug: Log invite notifications
  const inviteNotifications = notifications.filter((n) => n.type === "invite");
  if (inviteNotifications.length > 0) {
    console.log(`Found ${inviteNotifications.length} invite notifications:`, inviteNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      user_id: n.user_id,
      actor_id: n.actor_id,
      invite_direction: (n.additional_data as any)?.invite_direction,
    })));
  }

  // Get unique actor IDs
  const actorIds = notifications
    .map((n) => n.actor_id)
    .filter((id): id is string => id !== null);

  // Fetch actor profiles for those IDs
  let actors: Record<string, any> = {};
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", actorIds);

    if (profilesError) {
      console.error("Error fetching actor profiles:", profilesError);
    } else if (profiles) {
      actors = profiles.reduce((acc, profile) => {
        acc[profile.user_id] = profile;
        return acc;
      }, {} as Record<string, any>);
      
      // Debug: Log missing actor profiles for invite notifications
      const missingActors = inviteNotifications
        .filter((n) => n.actor_id && !actors[n.actor_id])
        .map((n) => n.actor_id);
      if (missingActors.length > 0) {
        console.warn("Missing actor profiles for invite notifications:", missingActors);
      }
    }
  }

  // Combine notifications with actor data
  const result = notifications.map((notification) => ({
    ...notification,
    actor: notification.actor_id ? actors[notification.actor_id] || null : null,
  }));

  // Debug: Log final invite notifications with actor data
  const finalInviteNotifications = result.filter((n) => n.type === "invite");
  if (finalInviteNotifications.length > 0) {
    console.log(`Returning ${finalInviteNotifications.length} invite notifications with actor data:`, finalInviteNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      actor: n.actor ? { user_id: n.actor.user_id, username: n.actor.username } : null,
      invite_direction: (n.additional_data as any)?.invite_direction,
    })));
  }

  return result;
}

/**
 * Get unread notification count for the current user
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) throw error;
  return count || 0;
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id); // Ensure user can only update their own notifications

  if (error) throw error;
}

/**
 * Mark all notifications as read for the current user
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) throw error;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id); // Ensure user can only delete their own notifications

  if (error) throw error;
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
