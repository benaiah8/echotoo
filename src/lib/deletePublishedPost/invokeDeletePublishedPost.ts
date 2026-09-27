/**
 * Client invoke: server-owned published post delete (Bunny + DB).
 * Do not delete posts from the client first.
 */

import { supabase } from "../supabaseClient";

export const DELETE_PUBLISHED_POST_USER_ERROR =
  "Couldn't delete the post. Try again.";

export type DeletePublishedPostParams = {
  postId: string;
};

export type DeletePublishedPostResult = {
  ok: true;
  deleted: true;
  postId: string;
  authorId: string | null;
  alreadyGone?: boolean;
};

export function parseDeletePublishedPostResponse(
  value: unknown,
): DeletePublishedPostResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || record.deleted !== true) return null;
  if (typeof record.postId !== "string" || !record.postId.trim()) return null;
  const authorId =
    record.authorId === null
      ? null
      : typeof record.authorId === "string"
        ? record.authorId
        : null;
  return {
    ok: true,
    deleted: true,
    postId: record.postId,
    authorId,
    alreadyGone: record.alreadyGone === true,
  };
}

export async function invokeDeletePublishedPost(
  params: DeletePublishedPostParams,
): Promise<
  | DeletePublishedPostResult
  | { ok: false; error: string }
> {
  const postId = params.postId?.trim();
  if (!postId) {
    return { ok: false, error: DELETE_PUBLISHED_POST_USER_ERROR };
  }

  const { data, error } = await supabase.functions.invoke(
    "delete-published-post",
    { body: { postId } },
  );

  if (error) {
    const body = data as { error?: string } | null;
    return {
      ok: false,
      error: body?.error?.trim() || DELETE_PUBLISHED_POST_USER_ERROR,
    };
  }

  const parsed = parseDeletePublishedPostResponse(data);
  if (!parsed) {
    return { ok: false, error: DELETE_PUBLISHED_POST_USER_ERROR };
  }

  return parsed;
}
