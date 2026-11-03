/**
 * Discover-only profile photo selection — excludes Google OAuth provider URLs
 * from presentation while preserving EchoToo managed uploads and ambiguous sources.
 */
import {
  isManagedProfilePhotoStoragePath,
  normalizeProfilePhotos,
  PROFILE_PHOTOS_MAX,
} from "../profilePhotos";
import { isAvatarPresetValue } from "../avatarPresets";

const GOOGLE_USERCONTENT_SUFFIX = ".googleusercontent.com";

/** Verified Google OAuth / profile photo CDN host (URL parse, no substring on path). */
export function isGoogleOAuthProviderPhotoUrl(
  value: string | null | undefined
): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    return (
      host === "googleusercontent.com" ||
      host.endsWith(GOOGLE_USERCONTENT_SUFFIX)
    );
  } catch {
    return false;
  }
}

/**
 * Photos shown in Discover after merge: drop Google provider URLs; keep order.
 * Managed EchoToo uploads for `userId` are kept; other non-Google paths are kept
 * (ambiguous https / legacy) to avoid dropping unknown legitimate photos.
 */
export function filterDiscoverPresentationPhotos(
  photos: readonly string[],
  userId: string | null | undefined
): string[] {
  void userId;
  const normalized = normalizeProfilePhotos(photos);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of normalized) {
    if (seen.has(path)) continue;
    if (isGoogleOAuthProviderPhotoUrl(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= PROFILE_PHOTOS_MAX) break;
  }
  return out;
}

/** Clamp shared carousel index when the filtered collection shrinks. */
export function clampDiscoverPhotoIndex(
  index: number,
  photoCount: number
): number {
  if (photoCount <= 0) return 0;
  const n = Math.floor(index);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n >= photoCount) return photoCount - 1;
  return n;
}

/**
 * Discover `avatar_url` on merged identity — never reintroduce Google when photos
 * were filtered; prefer managed compat face aligned with uploads.
 */
export function resolveDiscoverMergedAvatarUrl(
  matches: readonly { avatar_url?: string | null }[],
  userId: string | null | undefined,
  filteredPhotos: readonly string[]
): string | null {
  const primary = filteredPhotos[0] ?? null;
  if (primary && isManagedProfilePhotoStoragePath(primary, userId)) {
    return primary;
  }

  const candidates: string[] = [];
  for (const row of matches) {
    const raw =
      typeof row.avatar_url === "string" ? row.avatar_url.trim() : "";
    if (raw) candidates.push(raw);
  }

  for (const c of candidates) {
    if (isManagedProfilePhotoStoragePath(c, userId)) return c;
  }
  if (primary) return primary;

  for (const c of candidates) {
    if (isAvatarPresetValue(c)) return c;
  }
  for (const c of candidates) {
    if (!isGoogleOAuthProviderPhotoUrl(c)) return c;
  }

  return null;
}
