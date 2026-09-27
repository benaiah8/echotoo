import { supabase } from "../../lib/supabaseClient";
import type { ProfileSearchRow } from "../queries/searchProfiles";
import { invalidatePostDetailCache } from "../queries/getPostById";
import { invalidateOnPostDelete } from "../../lib/cacheInvalidation";
import { dataCache } from "../../lib/dataCache";
import { clearPersistedProfilePosts } from "../../lib/profilePostListCache";
import { clearAllPersistedHomeFeeds } from "../../lib/homeFeedListCache";
import {
  emitPostChanged,
  emitPostOwnershipChanged,
} from "../../lib/postEvents";

const AUDIT_RECENT_FETCH_LIMIT = 50;
const DEFAULT_QUICK_TARGET_LIMIT = 8;

export type AdminTransferPostOwnershipResult = {
  postId: string;
  oldAuthorId: string;
  newAuthorId: string;
  didChange: boolean;
};

export type AdminDeletePostResult = {
  postId: string;
  authorId: string;
  deleted: boolean;
};

export type AdminRepublishPostResult = {
  postId: string;
  authorId: string;
  updated: boolean;
};

export type AdminGetPostForEditResult = {
  post: Record<string, unknown>;
  activities: Record<string, unknown>[];
  mediaOrder?: unknown;
  postMedia?: unknown[];
};

type TransferRpcRow = {
  post_id: string;
  old_author_id: string;
  new_author_id: string;
  did_change: boolean;
};

type RepublishRpcRow = {
  post_id: string;
  author_id: string;
  updated: boolean;
};

type GetForEditRpcRow = {
  post: Record<string, unknown>;
  activities: unknown;
};

const PROFILE_POST_TABS = ["created", "interacted", "saved"] as const;

function parseTransferRpcRow(raw: unknown): AdminTransferPostOwnershipResult {
  const row = (Array.isArray(raw) ? raw[0] : raw) as TransferRpcRow | null | undefined;
  if (!row?.post_id || !row.old_author_id || !row.new_author_id) {
    throw new Error("Transfer failed: invalid response from server");
  }
  return {
    postId: row.post_id,
    oldAuthorId: row.old_author_id,
    newAuthorId: row.new_author_id,
    didChange: Boolean(row.did_change),
  };
}

/**
 * Reviewer-only RPC: transfer post ownership to another auth user (`profiles.user_id`).
 */
export async function adminTransferPostOwnership(
  postId: string,
  newAuthorUserId: string
): Promise<AdminTransferPostOwnershipResult> {
  if (!postId?.trim()) throw new Error("Missing post id");
  if (!newAuthorUserId?.trim()) throw new Error("Missing target user");

  const { data, error } = await supabase.rpc("admin_transfer_post_ownership", {
    p_post_id: postId,
    p_new_author_user_id: newAuthorUserId,
  });

  if (error) {
    throw new Error(error.message || "Could not transfer post ownership");
  }

  return parseTransferRpcRow(data);
}

/**
 * Reviewer-only published delete via server-owned Edge orchestration
 * (Bunny cleanup + admin_delete_post audit/DB).
 */
export async function adminDeletePost(
  postId: string
): Promise<AdminDeletePostResult> {
  if (!postId?.trim()) throw new Error("Missing post id");

  const { invokeDeletePublishedPost, DELETE_PUBLISHED_POST_USER_ERROR } =
    await import("../../lib/deletePublishedPost/invokeDeletePublishedPost");

  const result = await invokeDeletePublishedPost({ postId });
  if (!result.ok) {
    throw new Error(result.error || DELETE_PUBLISHED_POST_USER_ERROR);
  }

  return {
    postId: result.postId,
    authorId: result.authorId ?? "",
    deleted: true,
  };
}

function parseRepublishRpcRow(raw: unknown): AdminRepublishPostResult {
  const row = (Array.isArray(raw) ? raw[0] : raw) as RepublishRpcRow | null | undefined;
  if (!row?.post_id || !row.author_id) {
    throw new Error("Republish failed: invalid response from server");
  }
  return {
    postId: row.post_id,
    authorId: row.author_id,
    updated: Boolean(row.updated),
  };
}

/**
 * Reviewer-only RPC: load post + activities for admin edit UI.
 */
export async function adminGetPostForEdit(
  postId: string
): Promise<AdminGetPostForEditResult> {
  if (!postId?.trim()) throw new Error("Missing post id");

  const { data, error } = await supabase.rpc("admin_get_post_for_edit", {
    p_post_id: postId,
  });

  if (error) {
    throw new Error(error.message || "Could not load post for admin edit");
  }

  const row = (Array.isArray(data) ? data[0] : data) as GetForEditRpcRow | null;
  if (!row?.post || typeof row.post !== "object") {
    throw new Error("Could not load post for admin edit");
  }

  const post = row.post as Record<string, unknown>;
  if (typeof post.id !== "string" || !post.id) {
    throw new Error("Invalid post data from server");
  }

  let activities: Record<string, unknown>[] = [];
  if (Array.isArray(row.activities)) {
    activities = row.activities.filter(
      (a): a is Record<string, unknown> => !!a && typeof a === "object"
    );
  }

  const { getPublishedPostMediaForDetail } = await import(
    "../../lib/publishedMedia/getPublishedPostMediaForDetail"
  );
  const media = await getPublishedPostMediaForDetail(post.id);

  return {
    post,
    activities,
    mediaOrder: media.mediaOrder ?? post.media_order ?? null,
    postMedia: media.postMedia ?? [],
  };
}

/**
 * Reviewer-only RPC: republish post edits without changing author_id.
 */
export async function adminRepublishPost(
  postId: string,
  payload: unknown
): Promise<AdminRepublishPostResult> {
  if (!postId?.trim()) throw new Error("Missing post id");

  const { data, error } = await supabase.rpc("admin_republish_post", {
    p_post_id: postId,
    p_payload: payload,
  });

  if (error) {
    throw new Error(error.message || "Could not save admin edit");
  }

  return parseRepublishRpcRow(data);
}

/**
 * Clear caches after admin edit — uses post owner id, not session user.
 */
export async function invalidateCachesAfterAdminPostEdit(
  postId: string,
  authorId: string
): Promise<void> {
  if (!postId || !authorId) return;

  invalidatePostDetailCache(postId);
  void import("../../lib/publishedMedia").then(({ invalidatePublishedMedia }) => {
    invalidatePublishedMedia(postId);
  });
  dataCache.delete(`profile_created_${authorId}`);
  dataCache.delete(`profile_interacted_${authorId}`);
  dataCache.delete(`profile_saved_${authorId}`);
  for (const tab of PROFILE_POST_TABS) {
    clearPersistedProfilePosts(tab, authorId);
  }
  clearAllPersistedHomeFeeds();
  await dataCache.clearFeedCache();
}

/**
 * Clear caches that may still embed a deleted post. Visible lists rely on emitPostDeleted.
 */
export async function invalidateCachesAfterPostDelete(
  postId: string,
  authorId?: string | null
): Promise<void> {
  invalidateOnPostDelete(postId);

  if (authorId) {
    dataCache.delete(`profile_created_${authorId}`);
    dataCache.delete(`profile_interacted_${authorId}`);
    dataCache.delete(`profile_saved_${authorId}`);
    for (const tab of PROFILE_POST_TABS) {
      clearPersistedProfilePosts(tab, authorId);
    }
  }
}

/**
 * Reviewer-only: recent transfer targets from `admin_post_action_audit`, hydrated from profiles.
 */
export async function listRecentAdminAssignmentTargets(
  limit = DEFAULT_QUICK_TARGET_LIMIT
): Promise<ProfileSearchRow[]> {
  const cap = Math.min(Math.max(limit, 1), 12);

  const { data: auditRows, error: auditError } = await supabase
    .from("admin_post_action_audit")
    .select("new_author_id, created_at")
    .eq("action", "transfer_ownership")
    .not("new_author_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(AUDIT_RECENT_FETCH_LIMIT);

  if (auditError) {
    console.error(
      "[adminPosts] listRecentAdminAssignmentTargets audit",
      auditError
    );
    return [];
  }
  if (!auditRows?.length) return [];

  const orderedUserIds: string[] = [];
  const seen = new Set<string>();
  for (const row of auditRows) {
    const uid = row.new_author_id as string | null;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    orderedUserIds.push(uid);
    if (orderedUserIds.length >= cap) break;
  }

  if (!orderedUserIds.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, user_id, username, display_name, avatar_url")
    .in("user_id", orderedUserIds)
    .is("deleted_at", null);

  if (profileError) {
    console.error(
      "[adminPosts] listRecentAdminAssignmentTargets profiles",
      profileError
    );
    return [];
  }
  if (!profiles?.length) return [];

  const byUserId = new Map(profiles.map((p) => [p.user_id, p]));

  return orderedUserIds
    .map((uid) => byUserId.get(uid))
    .filter((p): p is NonNullable<typeof p> => !!p?.user_id)
    .map((p) => ({
      id: p.id,
      user_id: p.user_id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      member_no: null,
      follows_you: false,
      you_follow: false,
    }));
}

/**
 * Clear feed/profile/detail caches and patch visible cards with new author when possible.
 */
export async function invalidateCachesAfterPostOwnershipTransfer(
  postId: string,
  oldAuthorId: string,
  newAuthorId: string
): Promise<void> {
  invalidatePostDetailCache(postId);
  dataCache.delete(`profile_created_${oldAuthorId}`);
  dataCache.delete(`profile_created_${newAuthorId}`);
  clearPersistedProfilePosts("created", oldAuthorId);
  clearPersistedProfilePosts("created", newAuthorId);
  await dataCache.clearFeedCache();

  if (oldAuthorId === newAuthorId) return;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("user_id", newAuthorId)
      .is("deleted_at", null)
      .maybeSingle();

    if (profile) {
      emitPostChanged(postId, {
        author_id: newAuthorId,
        author: {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
      });
    } else {
      emitPostChanged(postId, { author_id: newAuthorId });
    }
  } catch {
    emitPostChanged(postId, { author_id: newAuthorId });
  }

  if (oldAuthorId !== newAuthorId) {
    emitPostOwnershipChanged(postId, oldAuthorId, newAuthorId);
  }
}
