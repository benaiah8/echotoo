// src/api/queries/getUserPostsCreated.ts
import { supabase } from "../../lib/supabaseClient";

export async function getUserPostsCreated(
  authorId: string,
  from = 0,
  limit = 20,
  includeDrafts = true, // NEW: include draft posts by default
  isOwner = false // NEW: whether the current user is the owner
) {
  console.log("[getUserPostsCreated] Starting query with params:", {
    authorId,
    from,
    limit,
    includeDrafts,
    isOwner,
  });

  let query = supabase
    .from("posts")
    .select(
      `
      id, 
      caption, 
      created_at, 
      type,
      is_anonymous,
      anonymous_name,
      anonymous_avatar,
      selected_dates,
      tags,
      status
    `
    ) // Simplified - removed activities join
    .eq("author_id", authorId);

  // If not the owner, filter out anonymous posts
  if (!isOwner) {
    query = query.or("is_anonymous.is.null,is_anonymous.eq.false");
  }

  // Filter by status based on ownership and includeDrafts flag
  if (!isOwner) {
    // Non-owners only see published posts
    query = query.eq("status", "published");
  } else if (isOwner && !includeDrafts) {
    // Owner can choose to exclude drafts
    query = query.eq("status", "published");
  }
  // If isOwner && includeDrafts, don't filter by status (returns both published and draft)

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1)
    .abortSignal(AbortSignal.timeout(10000)); // 10 second timeout

  console.log("[getUserPostsCreated] Query result:", {
    dataLength: data?.length,
    error: error?.message,
    hasError: !!error,
  });

  return { data: data ?? [], error };
}
