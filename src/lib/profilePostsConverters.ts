/**
 * Shared conversion functions for profile posts
 *
 * Converts PostgreSQL RPC function responses (LikedPostWithDetails, SavedPostWithDetails)
 * to FeedItem format for use with ProgressiveFeed component.
 */

import { type FeedItem } from "../api/queries/getPublicFeed";
import { type LikedPostWithDetails } from "../api/services/likes";
import { type SavedPostWithDetails } from "../api/services/savedPosts";

/**
 * Convert LikedPostWithDetails to FeedItem format
 * Used for Interacted tab in profile pages
 */
export function convertLikedToFeedItem(liked: LikedPostWithDetails): FeedItem {
  return {
    id: liked.posts.id,
    type: liked.posts.type as "experience" | "hangout",
    caption: liked.posts.caption,
    is_anonymous: liked.posts.is_anonymous || false,
    anonymous_name: (liked.posts as any).anonymous_name || null,
    anonymous_avatar: (liked.posts as any).anonymous_avatar || null,
    created_at: liked.posts.created_at,
    selected_dates: null,
    tags: null,
    author_id: liked.posts.author_id,
    author: {
      id: liked.posts.author_id,
      username: liked.posts.profiles?.username || null,
      display_name: liked.posts.profiles?.display_name || null,
      avatar_url: liked.posts.profiles?.avatar_url || null,
    },
    follow_status: (liked.posts as any).follow_status ?? undefined,
    is_liked: true, // Always true for interacted tab
    is_saved: (liked.posts as any).is_saved ?? false,
    like_count: (liked.posts as any).like_count ?? 0,
    comment_count: (liked.posts as any).comment_count ?? 0,
    has_images: (liked.posts as any).has_images ?? false,
    rsvp_data: null,
    activities: (liked.posts as any).activities || [],
  };
}

/**
 * Convert SavedPostWithDetails to FeedItem format
 * Used for Saved tab in profile pages
 */
export function convertSavedToFeedItem(saved: SavedPostWithDetails): FeedItem {
  return {
    id: saved.posts.id,
    type: saved.posts.type as "experience" | "hangout",
    caption: saved.posts.caption,
    is_anonymous: saved.posts.is_anonymous || false,
    anonymous_name: (saved.posts as any).anonymous_name || null,
    anonymous_avatar: (saved.posts as any).anonymous_avatar || null,
    created_at: saved.posts.created_at,
    selected_dates: null,
    tags: null,
    author_id: saved.posts.author_id,
    author: {
      id: saved.posts.author_id,
      username: saved.posts.profiles?.username || null,
      display_name: saved.posts.profiles?.display_name || null,
      avatar_url: saved.posts.profiles?.avatar_url || null,
    },
    follow_status: (saved.posts as any).follow_status ?? undefined,
    is_liked: (saved.posts as any).is_liked ?? false,
    is_saved: true, // Always true for saved tab
    like_count: (saved.posts as any).like_count ?? 0,
    comment_count: (saved.posts as any).comment_count ?? 0,
    has_images: (saved.posts as any).has_images ?? false,
    rsvp_data: null,
    activities: (saved.posts as any).activities || [],
  };
}
