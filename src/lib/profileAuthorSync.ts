/**
 * Sync embedded post.author display after profile display name / username changes.
 * Clears stale caches and patches visible feed items by author_id.
 */

import { applyPostPatch } from "./applyPostPatch";
import { dataCache } from "./dataCache";
import { clearAllPersistedHomeFeeds } from "./homeFeedListCache";
import {
  clearPersistedProfilePosts,
  type ProfilePostListTab,
} from "./profilePostListCache";

export type ProfileAuthorDisplayPayload = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PROFILE_POST_TABS: ProfilePostListTab[] = [
  "created",
  "interacted",
  "saved",
];

export function parseProfileAuthorDisplayPayload(
  detail: unknown
): ProfileAuthorDisplayPayload | null {
  if (!detail || typeof detail !== "object") return null;
  const profile = (detail as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  if (typeof p.user_id !== "string" || !p.user_id) return null;
  if (typeof p.id !== "string" || !p.id) return null;
  return {
    id: p.id,
    user_id: p.user_id,
    username: typeof p.username === "string" ? p.username : null,
    display_name: typeof p.display_name === "string" ? p.display_name : null,
    avatar_url: typeof p.avatar_url === "string" ? p.avatar_url : null,
  };
}

/** Clear feed + profile post caches that embed stale author objects. */
export async function invalidateCachesAfterProfileDisplayUpdate(
  userId: string
): Promise<void> {
  if (!userId) return;

  dataCache.delete(`profile_created_${userId}`);
  dataCache.delete(`profile_interacted_${userId}`);
  dataCache.delete(`profile_saved_${userId}`);

  for (const tab of PROFILE_POST_TABS) {
    clearPersistedProfilePosts(tab, userId);
  }

  clearAllPersistedHomeFeeds();
  await dataCache.clearFeedCache();
}

/**
 * Patch one post item when it belongs to the updated profile.
 * Skips anonymous posts. Returns null when no patch is needed.
 */
export function patchPostAuthorForProfileUpdate<T extends Record<string, unknown>>(
  item: T,
  profile: ProfileAuthorDisplayPayload
): T | null {
  if (item.is_anonymous === true) return null;

  const authorId = item.author_id;
  if (typeof authorId !== "string" || authorId !== profile.user_id) return null;

  const existing =
    item.author && typeof item.author === "object"
      ? (item.author as Record<string, unknown>)
      : null;

  return applyPostPatch(item, {
    author: {
      id: profile.id || (typeof existing?.id === "string" ? existing.id : ""),
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    },
  }) as T;
}

/** Listen for profile:updated with a full profile payload (display fields). */
export function onProfileAuthorDisplayUpdated(
  handler: (profile: ProfileAuthorDisplayPayload) => void
): () => void {
  const wrapped = (e: Event) => {
    const profile = parseProfileAuthorDisplayPayload(
      (e as CustomEvent).detail
    );
    if (profile) handler(profile);
  };
  window.addEventListener("profile:updated", wrapped);
  return () => window.removeEventListener("profile:updated", wrapped);
}
