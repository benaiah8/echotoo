// src/api/services/posts.ts
import { isDraftPostId, discardAllDrafts } from "../../lib/drafts";
import { supabase } from "../../lib/supabaseClient";
import { createPostNotifications } from "./notifications";
import { retry } from "../../lib/retry";
import { publishProfileTrace } from "../../lib/debugProfileFeed";

export type PostType = "experience" | "hangout";

/**
 * Best-effort FCM for new post: Edge resolves recipients from notifications (server fan-out)
 * and must not throw (publish should succeed regardless).
 */
async function invokePostPublishedPush(data: {
  id: string;
  type: PostType;
  author_id: string;
}): Promise<void> {
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
        post_id: data.id,
        entity_type: data.type,
        actor_id: data.author_id,
      },
    });
    if (error) {
      console.warn("[send-post-push]", error.message);
    }
  } catch (e) {
    console.warn("[send-post-push]", e instanceof Error ? e.message : e);
  }
}

export type NewPost = {
  type: PostType;
  caption: string;
  // NEW
  visibility?: "public" | "friends" | "private"; // public default
  is_anonymous?: boolean; // false default
  anonymous_name?: string | null; // NEW: anonymous name
  anonymous_avatar?: string | null; // NEW: anonymous avatar
  rsvp_capacity?: number | null; // null default
  selected_dates?: string[] | null; // ISO strings
  is_recurring?: boolean | null; // recurrence flag
  recurrence_days?: string[] | null; // ["MO","TU",...]
  tags?: string[] | null;
  status?: "draft" | "published"; // NEW: draft or published status
  /** When true, viewers may submit star ratings (DB default false). */
  rating_enabled?: boolean;
};

export async function insertPost(input: NewPost) {
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .insert([
      {
        type: input.type,
        caption: input.caption,
        visibility: input.visibility ?? "public",
        is_anonymous: input.is_anonymous ?? false,
        anonymous_name: input.anonymous_name ?? null, // NEW: anonymous name
        anonymous_avatar: input.anonymous_avatar ?? null, // NEW: anonymous avatar
        rsvp_capacity: input.rsvp_capacity ?? null,
        selected_dates: input.selected_dates ?? null,
        is_recurring: input.is_recurring ?? null,
        recurrence_days: input.recurrence_days ?? null,
        tags: input.tags ?? null,
        status: input.status ?? "published", // NEW: default to published
        rating_enabled: input.rating_enabled ?? false,
        author_id: session.user.id,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;

  // Create notifications for followers when a post is published
  if (data.status === "published") {
    try {
      await createPostNotifications(data.id, data.type, data.author_id);
    } catch (notificationError) {
      console.error("Error creating post notifications:", notificationError);
      // Don't throw here - post creation succeeded, notification failure shouldn't break it
    }
    void invokePostPublishedPush(data);
  }

  return data; // { id, ... }
}

export async function saveDraft(input: NewPost) {
  // Save draft - same as insertPost but with status: "draft"
  return insertPost({ ...input, status: "draft" });
}

export async function publishDraft(postId: string) {
  // Convert draft to published post
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "published" })
    .eq("id", postId)
    .eq("author_id", session.user.id) // Security: only owner can publish
    .select("*")
    .single();

  if (error) throw error;
  if (data.status === "published") {
    void invokePostPublishedPush(data);
  }
  return data;
}

export async function getPost(id: string) {
  // [OPTIMIZATION: Phase 7.2] Add retry logic to database query
  // Why: Handles transient network failures gracefully, improves reliability
  const result = await retry(
    async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    {
      maxRetries: 3,
      initialDelay: 1000,
      onRetry: (attempt, err) => {
        console.log(`[getPost] Retry attempt ${attempt} for post ${id}:`, err);
      },
    }
  );

  return result;
}

export async function deletePost(id: string) {
  if (isDraftPostId(id)) {
    discardAllDrafts();
    publishProfileTrace("DELETE_SUCCESS", { postId: id });
    return true;
  }

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  // First verify the user owns this post
  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;
  if (post.author_id !== session.user.id) {
    throw new Error("You can only delete your own posts");
  }

  // Delete the post (this will cascade delete activities and RSVPs due to foreign key constraints)
  const { error } = await supabase.from("posts").delete().eq("id", id);

  if (error) throw error;

  publishProfileTrace("DELETE_SUCCESS", { postId: id });
  return true;
}

export async function getPostForEdit(id: string) {
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session) throw new Error("Not authenticated");

  // [OPTIMIZATION: Phase 7.2] Add retry logic to database queries
  // Why: Handles transient network failures gracefully, improves reliability
  const result = await retry(
    async () => {
      // Get post data
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();

      if (postError) throw postError;
      if (post.author_id !== session.user.id) {
        throw new Error("You can only edit your own posts");
      }

      // Get activities data
      const { data: activities, error: activitiesError } = await supabase
        .from("activities")
        .select("*")
        .eq("post_id", id)
        .order("order_idx", { ascending: true });

      if (activitiesError) throw activitiesError;

      return {
        post,
        activities: activities || [],
      };
    },
    {
      maxRetries: 3,
      initialDelay: 1000,
      onRetry: (attempt, err) => {
        console.log(
          `[getPostForEdit] Retry attempt ${attempt} for post ${id}:`,
          err
        );
      },
    }
  );

  return result;
}
