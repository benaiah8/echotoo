import { supabase } from "../../lib/supabaseClient";
import {
  emitBlockStatusChanged,
  markUserBlocked,
  markUserUnblocked,
  seedBlockedUserIds,
} from "../../lib/blockStatusCache";

const BLOCK_LIST_LIMIT = 100;

export type BlockStatusChangeCacheOptions = {
  affectedProfileId?: string | null;
  viewerProfileId?: string | null;
};

async function requireSessionUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export type BlockedUserListRow = {
  blockId: string;
  blockedUserId: string;
  blockedAt: string;
  profileId: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/** True if the signed-in user has blocked `blockedUserId` (auth user id). */
export async function isBlockingUser(blockedUserId: string): Promise<boolean> {
  if (!blockedUserId?.trim()) return false;
  const uid = await requireSessionUserId();
  if (uid === blockedUserId) return false;
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_user_id", uid)
    .eq("blocked_user_id", blockedUserId)
    .maybeSingle();
  if (error) {
    console.error("[blocks] isBlockingUser", error);
    return false;
  }
  return !!data?.id;
}

/** Refresh feed/profile caches after block or unblock. */
export async function flushCachesAfterBlockStatusChange(options?: {
  affectedAuthorUserId?: string | null;
  affectedProfileId?: string | null;
  viewerProfileId?: string | null;
}): Promise<void> {
  const { dataCache } = await import("../../lib/dataCache");
  const { clearAllPersistedHomeFeeds } = await import(
    "../../lib/homeFeedListCache"
  );

  await dataCache.clearFeedCache();
  clearAllPersistedHomeFeeds();

  const authorId = options?.affectedAuthorUserId;
  if (authorId) {
    dataCache.delete(`profile_created_${authorId}`);
    dataCache.delete(`profile_interacted_${authorId}`);
    dataCache.delete(`profile_saved_${authorId}`);
    const { clearPersistedProfilePosts } = await import(
      "../../lib/profilePostListCache"
    );
    for (const tab of ["created", "interacted", "saved"] as const) {
      clearPersistedProfilePosts(tab, authorId);
    }
  }

  if (options?.affectedProfileId) {
    const { invalidateProfile } = await import("../../lib/profileCache");
    invalidateProfile(options.affectedProfileId);
  }

  const { invalidatePostDetailCacheForViewer } = await import(
    "../queries/getPostById"
  );
  invalidatePostDetailCacheForViewer(options?.viewerProfileId ?? null);

  const { clearPublishedMediaCache } = await import("../../lib/publishedMedia");
  clearPublishedMediaCache();

  const { invalidateAllPairUpCache } = await import("../../lib/pairUpCache");
  invalidateAllPairUpCache();

  const { HOME_TAB_REFRESH_EVENT, PROFILE_TAB_REFRESH_EVENT } = await import(
    "../../lib/homeRefreshEvents"
  );
  window.dispatchEvent(new CustomEvent(PROFILE_TAB_REFRESH_EVENT));
  window.dispatchEvent(new CustomEvent(HOME_TAB_REFRESH_EVENT));
}

/** @deprecated Prefer flushCachesAfterBlockStatusChange */
export async function flushCachesAfterUnblock(options?: {
  unblockedProfileId?: string | null;
  unblockedUserId?: string | null;
  viewerProfileId?: string | null;
}): Promise<void> {
  return flushCachesAfterBlockStatusChange({
    affectedAuthorUserId: options?.unblockedUserId ?? null,
    affectedProfileId: options?.unblockedProfileId ?? null,
    viewerProfileId: options?.viewerProfileId ?? null,
  });
}

export async function blockUser(
  blockedUserId: string,
  options?: BlockStatusChangeCacheOptions
): Promise<void> {
  const uid = await requireSessionUserId();
  if (uid === blockedUserId) throw new Error("Cannot block yourself");
  const { error } = await supabase.from("user_blocks").insert({
    blocker_user_id: uid,
    blocked_user_id: blockedUserId,
  });
  if (error) throw error;

  markUserBlocked(blockedUserId);
  emitBlockStatusChanged({ blockedUserId, blocked: true });
  await flushCachesAfterBlockStatusChange({
    affectedAuthorUserId: blockedUserId,
    affectedProfileId: options?.affectedProfileId ?? null,
    viewerProfileId: options?.viewerProfileId ?? null,
  });
}

export async function unblockUser(
  blockedUserId: string,
  options?: BlockStatusChangeCacheOptions
): Promise<void> {
  const uid = await requireSessionUserId();
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", uid)
    .eq("blocked_user_id", blockedUserId);
  if (error) throw error;

  markUserUnblocked(blockedUserId);
  emitBlockStatusChanged({ blockedUserId, blocked: false });
  await flushCachesAfterBlockStatusChange({
    affectedAuthorUserId: blockedUserId,
    affectedProfileId: options?.affectedProfileId ?? null,
    viewerProfileId: options?.viewerProfileId ?? null,
  });
}

/** Block list for the signed-in user, merged with profile display fields. */
export async function listMyBlockedUsersWithProfiles(): Promise<
  BlockedUserListRow[]
> {
  const uid = await requireSessionUserId();
  const { data: blocks, error } = await supabase
    .from("user_blocks")
    .select("id, blocked_user_id, created_at")
    .eq("blocker_user_id", uid)
    .order("created_at", { ascending: false })
    .limit(BLOCK_LIST_LIMIT);

  if (error) {
    console.error("[blocks] listMyBlockedUsersWithProfiles", error);
    throw error;
  }

  if (!blocks?.length) return [];

  const blockedUserIds = blocks.map((b) => b.blocked_user_id);
  seedBlockedUserIds(blockedUserIds);

  const { getProfilesByUserIds } = await import("./follows");
  const profiles = await getProfilesByUserIds(blockedUserIds);
  const profileByUserId = new Map(profiles.map((p) => [p.user_id, p]));

  return blocks.map((block) => {
    const profile = profileByUserId.get(block.blocked_user_id);
    return {
      blockId: block.id,
      blockedUserId: block.blocked_user_id,
      blockedAt: block.created_at,
      profileId: profile?.id ?? null,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}
