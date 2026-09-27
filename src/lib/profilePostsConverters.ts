/**
 * Shared conversion functions for profile posts
 *
 * Converts PostgreSQL RPC function responses (LikedPostWithDetails, SavedPostWithDetails)
 * to FeedItem format for use with ProgressiveFeed component.
 */

import { type FeedItem } from "../api/queries/getPublicFeed";
import { type LikedPostWithDetails } from "../api/services/likes";
import { type SavedPostWithDetails } from "../api/services/savedPosts";
import {
  stampSlot0OntoActivities,
  type ListCardActivity,
} from "./listCardSlot0";
import { normalizeLatestCommentPreview } from "./latestCommentPreview";
import type { LatestCommentPreview } from "./latestCommentPreview";

/**
 * Convert LikedPostWithDetails to FeedItem format
 * Used for Interacted tab in profile pages
 */
export function convertLikedToFeedItem(liked: LikedPostWithDetails): FeedItem {
  const row = liked.posts as any;
  return {
    id: liked.posts.id,
    type: liked.posts.type as "experience" | "hangout",
    caption: liked.posts.caption,
    is_anonymous: liked.posts.is_anonymous || false,
    anonymous_name: row.anonymous_name || null,
    anonymous_avatar: row.anonymous_avatar || null,
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
    follow_status: row.follow_status ?? undefined,
    is_liked: true, // Always true for interacted tab
    is_saved: row.is_saved ?? false,
    like_count: row.like_count ?? 0,
    save_count: row.save_count ?? 0,
    comment_count: row.comment_count ?? 0,
    has_images: row.has_images ?? false,
    rating_enabled: row.rating_enabled ?? undefined,
    rating_average: row.rating_average ?? null,
    rating_count: row.rating_count ?? null,
    viewer_rating: row.viewer_rating ?? null,
    rsvp_data: null,
    activities: row.activities || [],
  };
}

/**
 * Convert SavedPostWithDetails to FeedItem format
 * Used for Saved tab in profile pages
 */
export function convertSavedToFeedItem(saved: SavedPostWithDetails): FeedItem {
  const row = saved.posts as SavedPostWithDetails["posts"] & {
    anonymous_name?: string | null;
    anonymous_avatar?: string | null;
    follow_status?: FeedItem["follow_status"];
    is_liked?: boolean;
    like_count?: number;
    save_count?: number;
    comment_count?: number;
    has_images?: boolean;
    rating_enabled?: boolean;
    rating_average?: number | null;
    rating_count?: number | null;
    viewer_rating?: number | null;
    latest_comment_preview?: LatestCommentPreview | null;
  };
  return {
    id: saved.posts.id,
    type: saved.posts.type as "experience" | "hangout",
    caption: saved.posts.caption,
    is_anonymous: saved.posts.is_anonymous || false,
    anonymous_name: row.anonymous_name || null,
    anonymous_avatar: row.anonymous_avatar || null,
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
    follow_status: row.follow_status ?? undefined,
    is_liked: row.is_liked ?? false,
    is_saved: true, // Always true for saved tab
    like_count: row.like_count ?? 0,
    save_count: row.save_count ?? 0,
    comment_count: row.comment_count ?? 0,
    has_images: row.has_images ?? false,
    rating_enabled: row.rating_enabled ?? undefined,
    rating_average: row.rating_average ?? null,
    rating_count: row.rating_count ?? null,
    viewer_rating: row.viewer_rating ?? null,
    rsvp_data: null,
    activities: stampSlot0OntoActivities(
      (row.activities || []) as ListCardActivity[],
      {
        slot0_location_name: row.slot0_location_name,
        slot0_location_url: row.slot0_location_url,
        slot0_key_info: row.slot0_key_info,
      },
    ) as FeedItem["activities"],
    latest_comment_preview: normalizeLatestCommentPreview(
      row.latest_comment_preview ??
        (saved.posts as { latest_comment_preview?: unknown })
          .latest_comment_preview,
    ),
  };
}
