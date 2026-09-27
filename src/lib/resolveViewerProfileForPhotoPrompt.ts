import {
  inspectCachedProfileByUserId,
  peekCachedProfileByUserIdExpired,
  getCachedProfile,
} from "./profileCache";
import { normalizeProfilePhotos } from "./profilePhotos";

export type ResolvedViewerProfileForPhotoPrompt = {
  profileId: string;
  userId: string;
  photos: string[];
};

type CachedProfileRow = {
  id: string;
  user_id: string;
  profile_photos?: string[] | null;
};

function fromCachedRow(
  cached: CachedProfileRow,
  userId: string,
): ResolvedViewerProfileForPhotoPrompt | null {
  if (!cached.id || cached.user_id !== userId) return null;
  return {
    profileId: cached.id,
    userId: cached.user_id,
    photos: normalizeProfilePhotos(cached.profile_photos),
  };
}

/**
 * Cache-only viewer profile for photo-prompt decisions.
 * Never performs a Profile SELECT — returns null on cache miss.
 */
export function getCachedViewerProfileForPhotoPrompt(
  userId: string,
): ResolvedViewerProfileForPhotoPrompt | null {
  if (!userId) return null;

  const byUser = inspectCachedProfileByUserId(userId);
  if (byUser?.data) {
    const resolved = fromCachedRow(byUser.data, userId);
    if (resolved) return resolved;
  }

  const storedProfileId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("my_profile_id")
      : null;

  if (storedProfileId) {
    const cached = getCachedProfile(storedProfileId);
    if (cached) {
      const resolved = fromCachedRow(cached, userId);
      if (resolved) return resolved;
    }
  }

  const peek = peekCachedProfileByUserIdExpired(userId);
  if (peek) {
    return fromCachedRow(peek, userId);
  }

  return null;
}

/** @deprecated Use getCachedViewerProfileForPhotoPrompt (cache-only, sync). */
export function resolveViewerProfileForPhotoPrompt(
  userId: string,
): Promise<ResolvedViewerProfileForPhotoPrompt | null> {
  return Promise.resolve(getCachedViewerProfileForPhotoPrompt(userId));
}
