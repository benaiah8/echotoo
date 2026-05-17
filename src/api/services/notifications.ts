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

// [OPTIMIZATION: StrictMode] Short TTL response cache to prevent duplicate requests
// when React 18 StrictMode remounts (mount→unmount→mount). RequestManager only
// dedupes in-flight; this cache catches the 2nd call after the 1st completed.
const notificationsResponseCache = new Map<
  string,
  { ts: number; data: NotificationWithActor[] }
>();
const NOTIFICATIONS_TTL_MS = 4000;

/** Verbose create-post push notification path ([CPN]). Off by default. */
const DEBUG_CPN = false;
const cpnDbg = (...a: Parameters<typeof console.log>) => {
  if (!DEBUG_CPN) return;
  console.log(...a);
};

export type NotificationBadgeData = {
  total: number;
  inviteUnread: number;
  activityUnread: number;
};

/**
 * Unread head counts: total, invite-only, non-invite. Cached together for bottom-tab badge.
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
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("type", "invite"),
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
 * Best-effort remote push for new post (Edge Function). Must not throw — publishing must succeed even if push fails.
 */
async function invokeSendPostPush(params: {
  postId: string;
  entityType: "hangout" | "experience";
  actorId: string;
  recipientUserIds: string[];
}): Promise<void> {
  console.log("[SPP] invoke", {
    postId: params.postId,
    entityType: params.entityType,
    recipientCount: params.recipientUserIds.length,
  });
  if (params.recipientUserIds.length === 0) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const { error } = await supabase.functions.invoke("send-post-push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        post_id: params.postId,
        entity_type: params.entityType,
        actor_id: params.actorId,
        recipient_user_ids: params.recipientUserIds,
      },
    });

    if (error) {
      console.warn("[send-post-push]", error.message);
    }
  } catch (e) {
    console.warn("[send-post-push]", e instanceof Error ? e.message : e);
  }
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
        q = q.neq("type", "invite");
      }
      const { data, error } = await q.range(offset, offset + limit - 1);

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

/**
 * Create notifications for followers when a user posts
 */
export async function createPostNotifications(
  postId: string,
  postType: "hangout" | "experience",
  authorId: string
): Promise<void> {
  try {
    cpnDbg("[CPN] entry", { postId, postType, authorId });

    // follows.following_id and notification_settings.target_user_id use profile id, not auth user id
    const { data: authorProfile, error: authorProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", authorId)
      .maybeSingle();

    cpnDbg("[CPN] authorProfile", {
      authorProfileId: authorProfile?.id ?? "missing",
    });

    if (authorProfileError) {
      console.warn(
        "[createPostNotifications] Could not resolve author profile:",
        authorProfileError.message
      );
      return;
    }
    if (!authorProfile?.id) {
      console.warn(
        "[createPostNotifications] No profile for author user_id; skipping post notifications"
      );
      return;
    }

    const authorProfileId = authorProfile.id;

    // Get all followers of the author
    const { data: followers, error: followersError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", authorProfileId);

    if (followersError) {
      console.error("Error fetching followers:", followersError);
      cpnDbg("[CPN] followers", {
        count: 0,
        followerIds: [] as string[],
        err: followersError.message,
      });
      return;
    }

    const followerRows = followers ?? [];
    const followerIds = followerRows.map((f) => f.follower_id);
    cpnDbg("[CPN] followers", {
      count: followerIds.length,
      followerIds,
    });

    if (followerRows.length === 0) {
      cpnDbg("[CPN] skip_no_followers");
      return; // No followers to notify
    }

    // follows.follower_id is profile id; notifications + notification_settings use auth user id
    const { data: followerProfiles, error: followerProfilesError } =
      await supabase
        .from("profiles")
        .select("id, user_id")
        .in("id", followerIds);

    if (followerProfilesError) {
      console.warn(
        "[createPostNotifications] Could not load follower profiles:",
        followerProfilesError.message
      );
      return;
    }

    const followerProfileIdToAuthUserId = new Map<string, string>();
    for (const row of followerProfiles ?? []) {
      if (row?.id && row?.user_id) {
        followerProfileIdToAuthUserId.set(row.id, row.user_id);
      }
    }

    const followerAuthUserIds = [
      ...new Set(
        followerIds
          .map((pid) => followerProfileIdToAuthUserId.get(pid))
          .filter((uid): uid is string => uid !== undefined)
      ),
    ];

    cpnDbg("[CPN] follower_auth_map", {
      followerProfileCount: followerIds.length,
      resolvedAuthCount: followerAuthUserIds.length,
    });

    if (followerAuthUserIds.length === 0) {
      cpnDbg("[CPN] skip_no_follower_auth_resolved");
      return;
    }

    // Get notification settings for these followers (receiver keys are auth user ids)
    const { data: notificationSettings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("user_id")
      .eq("target_user_id", authorProfileId)
      .in("user_id", followerAuthUserIds)
      .eq("enabled", true);

    cpnDbg("[CPN] settings", {
      count: notificationSettings?.length ?? 0,
      enabledFollowerIds: notificationSettings?.map((s) => s.user_id) ?? [],
      settingsError: settingsError?.message ?? null,
    });

    if (settingsError) {
      console.error("Error fetching notification settings:", settingsError);
      // Fallback: notify all followers with resolvable auth ids if settings query fails
      const notifications = followerRows
        .map((follow) => {
          const user_id = followerProfileIdToAuthUserId.get(follow.follower_id);
          if (!user_id) return null;
          return {
            user_id,
            actor_id: authorId,
            type: "post" as const,
            entity_type: postType,
            entity_id: postId,
            additional_data: {},
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);

      cpnDbg("[CPN] insert_attempt", {
        count: notifications.length,
      });

      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Error creating post notifications:", insertError);
      } else {
        cpnDbg("[CPN] insert_success");
        const recipientUserIds = notifications.map((n) => n.user_id);
        cpnDbg("[CPN] push_invoke", {
          recipientCount: recipientUserIds.length,
          postId,
        });
        void invokeSendPostPush({
          postId,
          entityType: postType,
          actorId: authorId,
          recipientUserIds,
        });
      }
      return;
    }

    // Only notify followers who have notifications enabled (settings.user_id is auth)
    const enabledFollowerIds = new Set(
      notificationSettings?.map((s) => s.user_id) || []
    );
    const notificationsToCreate = followerRows
      .filter((follow) => {
        const authId = followerProfileIdToAuthUserId.get(follow.follower_id);
        return authId !== undefined && enabledFollowerIds.has(authId);
      })
      .map((follow) => {
        const user_id = followerProfileIdToAuthUserId.get(follow.follower_id)!;
        return {
          user_id,
          actor_id: authorId,
          type: "post" as const,
          entity_type: postType,
          entity_id: postId,
          additional_data: {},
        };
      });

    if (notificationsToCreate.length === 0) {
      cpnDbg("[CPN] skip_no_notifications_to_create");
      return; // No enabled notifications to send
    }

    // Insert notifications
    cpnDbg("[CPN] insert_attempt", {
      count: notificationsToCreate.length,
    });

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationsToCreate);

    if (insertError) {
      console.error("Error creating post notifications:", insertError);
    } else {
      cpnDbg("[CPN] insert_success");
      cpnDbg("[CPN] push_invoke", {
        recipientCount: notificationsToCreate.length,
        postId,
      });
      void invokeSendPostPush({
        postId,
        entityType: postType,
        actorId: authorId,
        recipientUserIds: notificationsToCreate.map((n) => n.user_id),
      });
    }
  } catch (error) {
    console.error("Error in createPostNotifications:", error);
  }
}
