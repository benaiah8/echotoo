import { supabase } from "../../lib/supabaseClient";

/** JSON payload for owner publish RPCs — matches deployed owner_create_post / owner_republish_post contracts. */
export type OwnerCreatePostPayload = Record<string, unknown>;

export type OwnerRepublishPostPayload = Record<string, unknown>;

type OwnerCreatePostRpcRow = {
  post: Record<string, unknown> | null;
  created: boolean | null;
};

export type OwnerCreatePostResult = {
  post: Record<string, unknown>;
  created: boolean;
};

function parseOwnerCreatePostRow(raw: unknown): OwnerCreatePostResult {
  const row = (
    Array.isArray(raw) ? raw[0] : raw
  ) as OwnerCreatePostRpcRow | null | undefined;

  const post = row?.post;
  const id = typeof post?.id === "string" ? post.id : null;
  if (!id || !post) {
    throw new Error("Publish failed: invalid response from server");
  }

  return {
    post,
    created: Boolean(row?.created),
  };
}

/**
 * Atomic owner publish (post + activities). Requires draftMeta.publishPostId as p_post_id.
 */
export async function ownerCreatePost(
  postId: string,
  payload: OwnerCreatePostPayload
): Promise<OwnerCreatePostResult> {
  if (!postId?.trim()) {
    throw new Error("Missing post id");
  }

  const { data, error } = await supabase.rpc("owner_create_post", {
    p_post_id: postId,
    p_payload: payload,
  });

  if (error) {
    throw new Error(error.message || "Could not publish post");
  }

  return parseOwnerCreatePostRow(data);
}

type OwnerRepublishPostRpcRow = {
  post: Record<string, unknown> | null;
  updated: boolean | null;
};

export type OwnerRepublishPostResult = {
  post: Record<string, unknown>;
  updated: boolean;
};

function parseOwnerRepublishPostRow(raw: unknown): OwnerRepublishPostResult {
  const row = (
    Array.isArray(raw) ? raw[0] : raw
  ) as OwnerRepublishPostRpcRow | null | undefined;

  const post = row?.post;
  const id = typeof post?.id === "string" ? post.id : null;
  if (!id || !post) {
    throw new Error("Republish failed: invalid response from server");
  }

  return {
    post,
    updated: Boolean(row?.updated),
  };
}

/**
 * Atomic owner edit (post + optional activity replace). Preserves existing DB post type.
 */
export async function ownerRepublishPost(
  postId: string,
  payload: OwnerRepublishPostPayload
): Promise<OwnerRepublishPostResult> {
  if (!postId?.trim()) {
    throw new Error("Missing post id");
  }

  const { data, error } = await supabase.rpc("owner_republish_post", {
    p_post_id: postId,
    p_payload: payload,
  });

  if (error) {
    throw new Error(error.message || "Could not save post");
  }

  return parseOwnerRepublishPostRow(data);
}
