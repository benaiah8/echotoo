/**
 * Duo-only presentation identity — reuses Discover photo classification
 * without changing Discover merge paths or global profile resolvers.
 */
import type { ProfileIdentityMediaSource } from "../profileIdentityMedia";
import {
  resolveProfileIdentityMedia,
} from "../profileIdentityMedia";
import { normalizeProfilePhotos } from "../profilePhotos";
import { isAvatarPresetValue } from "../avatarPresets";
import {
  filterDiscoverPresentationPhotos,
  isGoogleOAuthProviderPhotoUrl,
  resolveDiscoverMergedAvatarUrl,
} from "./discoverProfilePhotoSelection";

/**
 * Strip Google OAuth provider URLs from Duo portraits; keep managed uploads,
 * Echo presets, and ambiguous non-Google legacy sources.
 */
export function adaptDuoPresentationIdentity(
  source: ProfileIdentityMediaSource
): ProfileIdentityMediaSource {
  const userId = source.user_id ?? null;
  const filtered = filterDiscoverPresentationPhotos(
    normalizeProfilePhotos(source.profile_photos),
    userId
  );

  let avatar_url = source.avatar_url ?? null;
  if (filtered.length > 0) {
    avatar_url = resolveDiscoverMergedAvatarUrl(
      [{ avatar_url: source.avatar_url }],
      userId,
      filtered
    );
  } else if (isGoogleOAuthProviderPhotoUrl(avatar_url)) {
    avatar_url = isAvatarPresetValue(avatar_url) ? avatar_url : null;
  }

  if (
    filtered.length === 0 &&
    avatar_url &&
    isGoogleOAuthProviderPhotoUrl(avatar_url) &&
    !isAvatarPresetValue(avatar_url)
  ) {
    avatar_url = null;
  }

  return {
    ...source,
    profile_photos: filtered,
    avatar_url,
  };
}

/** Displayable Duo portrait count (Google OAuth URLs excluded). Echo/empty → 0. */
export function peopleDuoModernDisplayPhotoCount(
  source: ProfileIdentityMediaSource
): number {
  const adapted = adaptDuoPresentationIdentity(source);
  const resolved = resolveProfileIdentityMedia(adapted);
  if (resolved.kind === "photos" && resolved.photos.length > 0) {
    return resolved.photos.length;
  }
  return 0;
}
