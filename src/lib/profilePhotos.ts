/**
 * Profile photos + Echo companion helpers (Migration A).
 * Canonical storage paths/URLs live in `profiles.profile_photos` (0–3, array order).
 * `profiles.echo_preset` is independent of real photos (`preset:owl_NN`).
 * `profiles.avatar_url` remains the compatibility primary face
 * (DB trigger: photos[0] ?? echo_preset ?? null).
 */

import { isAvatarPresetValue } from "./avatarPresets";

export const PROFILE_PHOTOS_MAX = 3;

/** Shared select fragment for profile identity reads (append to existing lists). */
export const PROFILE_PHOTOS_SELECT_FRAGMENT = "profile_photos, echo_preset";

/**
 * Storage folder for Profile photos / avatars under the `media` bucket.
 * Paths look like `{userId}/avatar/{uuid}.webp`.
 */
export const PROFILE_PHOTO_STORAGE_KIND = "avatar";

/** Why automatic Storage cleanup was skipped (never delete on uncertainty). */
export type ProfilePhotoDeleteSkipReason =
  | "empty"
  | "missing_user_id"
  | "preset"
  | "http_url"
  | "not_managed_path"
  | "still_referenced";

export type ProfilePhotoDeletionDecision =
  | { action: "delete"; path: string }
  | { action: "skip"; reason: ProfilePhotoDeleteSkipReason };

/**
 * Normalize DB/cache photo arrays: strings only, drop blanks, cap at 3.
 * Safe for stale cache entries that omit the field.
 */
export function normalizeProfilePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed);
    if (out.length >= PROFILE_PHOTOS_MAX) break;
  }
  return out;
}

/**
 * Ordered unique photo paths (max {@link PROFILE_PHOTOS_MAX}).
 * Drops blanks and accidental duplicate insertions; preserves first-seen order.
 */
export function uniqueOrderedProfilePhotos(
  value: string[] | null | undefined,
): string[] {
  const normalized = normalizeProfilePhotos(value ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of normalized) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= PROFILE_PHOTOS_MAX) break;
  }
  return out;
}

/** Normalize Echo companion value; empty → null. Does not invent a random preset. */
export function normalizeEchoPreset(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the user has at least one real profile photo path/URL. */
export function hasRealProfilePhoto(
  photos: string[] | null | undefined,
): boolean {
  return normalizeProfilePhotos(photos).length > 0;
}

/** Photo 1 (primary), or null. */
export function primaryProfilePhoto(
  photos: string[] | null | undefined,
): string | null {
  return normalizeProfilePhotos(photos)[0] ?? null;
}

/**
 * Photos for Profile hero display only (no DB writes).
 * Prefer `profile_photos`; if empty, allow a single legacy real `avatar_url`
 * (not an Echo preset) so older cache/rows still show a photo.
 */
export function resolveProfileHeroPhotos(args: {
  profile_photos?: string[] | null;
  avatar_url?: string | null;
}): string[] {
  const photos = normalizeProfilePhotos(args.profile_photos);
  if (photos.length > 0) return photos;

  const raw =
    typeof args.avatar_url === "string" ? args.avatar_url.trim() : "";
  if (!raw || isAvatarPresetValue(raw)) return [];
  return [raw];
}

/**
 * Defensive compatibility face when `avatar_url` might be missing from a partial
 * payload. Prefer explicit `avatar_url` (DB trigger keeps it in sync).
 */
export function resolveCompatAvatarUrl(args: {
  avatar_url?: string | null;
  profile_photos?: string[] | null;
  echo_preset?: string | null;
}): string | null {
  const raw =
    typeof args.avatar_url === "string" ? args.avatar_url.trim() : "";
  if (raw) return raw;

  const primary = primaryProfilePhoto(args.profile_photos);
  if (primary) return primary;

  return normalizeEchoPreset(args.echo_preset);
}

/** True when the value looks like an Echo preset token (not a real upload). */
export function isEchoPresetValue(value: string | null | undefined): boolean {
  return isAvatarPresetValue(value);
}

/**
 * True when `value` is a managed Supabase Storage object key for THIS user:
 * `{userId}/avatar/...` inside the `media` bucket.
 *
 * Intentionally rejects:
 * - presets (`preset:…`)
 * - any `http://` / `https://` URL (Cloudinary, public Supabase URLs, etc.)
 * - paths owned by another user
 * - malformed / traversal-looking keys
 *
 * Does not parse public URLs into keys — callers must store storage keys.
 */
export function isManagedProfilePhotoStoragePath(
  value: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (typeof value !== "string" || typeof userId !== "string") return false;
  const path = value.trim();
  const uid = userId.trim();
  if (!path || !uid) return false;

  if (isEchoPresetValue(path)) return false;
  // Any absolute / protocol URL — never delete from a URL string this release.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  if (path.startsWith("//") || path.startsWith("/")) return false;
  if (path.includes("..") || path.includes("\\")) return false;
  if (path.includes("?") || path.includes("#")) return false;

  const prefix = `${uid}/${PROFILE_PHOTO_STORAGE_KIND}/`;
  if (!path.startsWith(prefix)) return false;

  const rest = path.slice(prefix.length);
  if (!rest || rest.startsWith("/") || rest.includes("..")) return false;
  // Single object segment under avatar/ (uuid.ext). No nested folders.
  if (rest.includes("/")) return false;
  return true;
}

/**
 * Pure eligibility decision for deleting a superseded Profile photo object.
 * Does not touch Storage, DB, or cache.
 */
export function decideProfilePhotoStorageDeletion(args: {
  userId: string | null | undefined;
  removedPhoto: string | null | undefined;
  remainingPhotos?: string[] | null;
}): ProfilePhotoDeletionDecision {
  const uid =
    typeof args.userId === "string" ? args.userId.trim() : "";
  if (!uid) return { action: "skip", reason: "missing_user_id" };

  const removed =
    typeof args.removedPhoto === "string" ? args.removedPhoto.trim() : "";
  if (!removed) return { action: "skip", reason: "empty" };

  if (isEchoPresetValue(removed)) {
    return { action: "skip", reason: "preset" };
  }

  if (/^https?:\/\//i.test(removed) || /^[a-z][a-z0-9+.-]*:/i.test(removed)) {
    return { action: "skip", reason: "http_url" };
  }

  const remaining = normalizeProfilePhotos(args.remainingPhotos ?? []);
  if (remaining.includes(removed)) {
    return { action: "skip", reason: "still_referenced" };
  }

  if (!isManagedProfilePhotoStoragePath(removed, uid)) {
    return { action: "skip", reason: "not_managed_path" };
  }

  return { action: "delete", path: removed };
}
