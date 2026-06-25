import { supabase } from "../../lib/supabaseClient";
import { invalidatePostDetailCache } from "../queries/getPostById";
import { dataCache } from "../../lib/dataCache";
import { clearPersistedProfilePosts } from "../../lib/profilePostListCache";
import { emitPostChanged } from "../../lib/postEvents";

export type AdminTransferPostOwnershipResult = {
  postId: string;
  oldAuthorId: string;
  newAuthorId: string;
  didChange: boolean;
};

type RpcRow = {
  post_id: string;
  old_author_id: string;
  new_author_id: string;
  did_change: boolean;
};

function parseRpcRow(raw: unknown): AdminTransferPostOwnershipResult {
  const row = (Array.isArray(raw) ? raw[0] : raw) as RpcRow | null | undefined;
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

  return parseRpcRow(data);
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
}
