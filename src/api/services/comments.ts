import { supabase } from "../../lib/supabaseClient";
import {
  Comment,
  CommentWithAuthor,
  CommentWithDetails,
  CommentLike,
  CreateCommentData,
  UpdateCommentData,
  CommentCount,
} from "../../types/comment";

// Cache configuration
const COMMENTS_CACHE_KEY = "comments_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedComments {
  [postId: string]: {
    data: CommentWithDetails[];
    timestamp: number;
  };
}

// Cache management
const getCachedComments = (postId: string): CommentWithDetails[] | null => {
  try {
    const cached = localStorage.getItem(COMMENTS_CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedComments = JSON.parse(cached);
    const postCache = parsed[postId];

    if (!postCache) return null;

    // Check if cache is still valid
    if (Date.now() - postCache.timestamp > CACHE_DURATION) {
      return null;
    }

    return postCache.data;
  } catch {
    return null;
  }
};

const setCachedComments = (
  postId: string,
  comments: CommentWithDetails[]
): void => {
  try {
    const cached = localStorage.getItem(COMMENTS_CACHE_KEY);
    const parsed: CachedComments = cached ? JSON.parse(cached) : {};

    parsed[postId] = {
      data: comments,
      timestamp: Date.now(),
    };

    localStorage.setItem(COMMENTS_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore cache errors
  }
};

const invalidateCommentsCache = (postId: string): void => {
  try {
    const cached = localStorage.getItem(COMMENTS_CACHE_KEY);
    if (!cached) return;

    const parsed: CachedComments = JSON.parse(cached);
    delete parsed[postId];
    localStorage.setItem(COMMENTS_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore cache errors
  }
};

// Get comments for a post with author details and like counts
export const getCommentsForPost = async (
  postId: string
): Promise<CommentWithDetails[]> => {
  // Check cache first
  const cached = getCachedComments(postId);
  if (cached) return cached;

  try {
    console.log("Loading comments for post:", postId); // Debug log

    // First, get comments
    const { data: comments, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    console.log("Raw comments:", comments); // Debug log

    // Debug: Check if images are in the raw comments
    comments.forEach((comment, index) => {
      console.log(`Comment ${index} images:`, comment.images);
    });

    if (!comments || comments.length === 0) {
      console.log("No comments found for post:", postId);
      return [];
    }

    // [OPTIMIZATION: Phase 2 - Batch] Batch fetch all comment author profiles in one query
    // Why: Single database query instead of multiple sequential queries, much faster
    const authorIds = [...new Set(comments.map((c) => c.author_id))];
    console.log("Author IDs:", authorIds); // Debug log

    let profiles: any[] = [];
    if (authorIds.length > 0) {
      console.log("Fetching profiles for author IDs:", authorIds); // Debug log

      // Try the main query first
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", authorIds);

      if (profilesError) {
        console.error("Profiles error:", profilesError);
        console.error("Error details:", {
          message: profilesError.message,
          details: profilesError.details,
          hint: profilesError.hint,
          code: profilesError.code,
        });

        // Try alternative query without RLS restrictions
        console.log("Trying alternative profile fetch...");
        const { data: altProfiles, error: altError } = await supabase
          .from("profiles")
          .select("user_id, username, display_name, avatar_url")
          .in("user_id", authorIds)
          .limit(100);

        if (altError) {
          console.error("Alternative profiles error:", altError);
          profiles = [];
        } else {
          profiles = altProfiles || [];
          console.log("Alternative profiles fetched:", profiles);
        }
      } else {
        profiles = profilesData || [];
        console.log("Profiles fetched successfully:", profiles); // Debug log
      }
    } else {
      console.log("No author IDs found, skipping profiles fetch");
    }

    // Combine comments with author data
    const commentsWithAuthors = comments.map((comment) => {
      const author = profiles?.find((p) => p.user_id === comment.author_id);
      return {
        ...comment,
        author: author
          ? {
              id: author.user_id,
              username: author.username,
              display_name: author.display_name,
              avatar_url: author.avatar_url,
            }
          : {
              id: comment.author_id,
              username: "Unknown",
              display_name: "Unknown User",
              avatar_url: null,
            },
      };
    });

    console.log("Comments with authors:", commentsWithAuthors); // Debug log

    // Get like counts for each comment
    const commentIds = commentsWithAuthors?.map((c) => c.id) || [];
    const { data: likes } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .in("comment_id", commentIds);

    // Get current user's likes
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: userLikes } = user
      ? await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", commentIds)
      : { data: [] };

    // Build comment details with like counts
    const commentsWithDetails: CommentWithDetails[] = (
      commentsWithAuthors || []
    ).map((comment) => {
      const likeCount =
        likes?.filter((like) => like.comment_id === comment.id).length || 0;
      const isLiked =
        userLikes?.some((like) => like.comment_id === comment.id) || false;

      return {
        ...comment,
        like_count: likeCount,
        is_liked: isLiked,
        replies: [], // Will be populated by buildCommentTree
      };
    });

    console.log("Comments with details:", commentsWithDetails); // Debug log

    // Build comment tree (top-level comments with nested replies)
    const commentTree = buildCommentTree(commentsWithDetails);

    console.log("Final comment tree:", commentTree); // Debug log

    // Cache the results
    setCachedComments(postId, commentTree);

    return commentTree;
  } catch (error) {
    console.error("Error fetching comments:", error);
    throw error;
  }
};

// Build comment tree from flat list
const buildCommentTree = (
  comments: CommentWithDetails[]
): CommentWithDetails[] => {
  const commentMap = new Map<string, CommentWithDetails>();
  const rootComments: CommentWithDetails[] = [];

  // Create a map of all comments
  comments.forEach((comment) => {
    commentMap.set(comment.id, { ...comment, replies: [] });
  });

  // Build the tree
  comments.forEach((comment) => {
    const commentWithReplies = commentMap.get(comment.id)!;

    if (comment.parent_id) {
      // This is a reply
      const parent = commentMap.get(comment.parent_id);
      if (parent) {
        parent.replies!.push(commentWithReplies);
      }
    } else {
      // This is a top-level comment
      rootComments.push(commentWithReplies);
    }
  });

  return rootComments;
};

// Create a new comment
export const createComment = async (
  commentData: CreateCommentData
): Promise<Comment> => {
  try {
    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("User not authenticated");
    }

    console.log("Creating comment:", commentData); // Debug log
    console.log("User ID:", user.id); // Debug log

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: commentData.post_id,
        author_id: user.id, // Add missing author_id
        parent_id: commentData.parent_id || null,
        content: commentData.content.trim(),
        images: commentData.images || [], // Include images field
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase create comment error:", error); // Debug log
      throw error;
    }

    console.log("Comment created successfully:", data); // Debug log

    // Invalidate cache for this post
    invalidateCommentsCache(commentData.post_id);

    return data;
  } catch (error) {
    console.error("Error creating comment:", error);
    throw error;
  }
};

// Update a comment
export const updateComment = async (
  commentId: string,
  updateData: UpdateCommentData
): Promise<Comment> => {
  try {
    const { data, error } = await supabase
      .from("comments")
      .update({
        content: updateData.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache for this post
    invalidateCommentsCache(data.post_id);

    return data;
  } catch (error) {
    console.error("Error updating comment:", error);
    throw error;
  }
};

// Delete a comment (soft delete)
export const deleteComment = async (commentId: string): Promise<void> => {
  try {
    // First get the comment to know which post to invalidate cache for
    const { data: comment } = await supabase
      .from("comments")
      .select("post_id")
      .eq("id", commentId)
      .single();

    const { error } = await supabase
      .from("comments")
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId);

    if (error) throw error;

    // Invalidate cache for this post
    if (comment) {
      invalidateCommentsCache(comment.post_id);
    }
  } catch (error) {
    console.error("Error deleting comment:", error);
    throw error;
  }
};

// Like a comment
export const likeComment = async (commentId: string): Promise<void> => {
  try {
    const { error } = await supabase.from("comment_likes").insert({
      comment_id: commentId,
    });

    if (error) throw error;

    // Invalidate cache for this comment's post
    const { data: comment } = await supabase
      .from("comments")
      .select("post_id")
      .eq("id", commentId)
      .single();

    if (comment) {
      invalidateCommentsCache(comment.post_id);
    }
  } catch (error) {
    console.error("Error liking comment:", error);
    throw error;
  }
};

// Unlike a comment
export const unlikeComment = async (commentId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", commentId);

    if (error) throw error;

    // Invalidate cache for this comment's post
    const { data: comment } = await supabase
      .from("comments")
      .select("post_id")
      .eq("id", commentId)
      .single();

    if (comment) {
      invalidateCommentsCache(comment.post_id);
    }
  } catch (error) {
    console.error("Error unliking comment:", error);
    throw error;
  }
};

// Get comment count for a post
export const getCommentCount = async (postId: string): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId)
      .eq("is_deleted", false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Error getting comment count:", error);
    return 0;
  }
};

// Get comment counts for multiple posts
export const getCommentCounts = async (
  postIds: string[]
): Promise<CommentCount[]> => {
  try {
    const { data, error } = await supabase
      .from("comments")
      .select("post_id")
      .in("post_id", postIds)
      .eq("is_deleted", false);

    if (error) throw error;

    // Count comments per post
    const counts: { [postId: string]: number } = {};
    data?.forEach((comment) => {
      counts[comment.post_id] = (counts[comment.post_id] || 0) + 1;
    });

    // Return counts for all requested posts
    return postIds.map((postId) => ({
      post_id: postId,
      count: counts[postId] || 0,
    }));
  } catch (error) {
    console.error("Error getting comment counts:", error);
    return postIds.map((postId) => ({ post_id: postId, count: 0 }));
  }
};
