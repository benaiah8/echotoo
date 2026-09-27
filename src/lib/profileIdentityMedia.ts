/**
 * Public Profile identity media resolver for social surfaces (People, Group Up, etc.).
 * Zero network I/O — resolves from an inline public identity payload only.
 *
 * Priority: real profile_photos → Echo → legacy avatar_url → empty.
 * Echo is never appended to the real-photo carousel.
 */

import {
  isAvatarPresetValue,
} from "./avatarPresets";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
  resolveCompatAvatarUrl,
} from "./profilePhotos";
import {
  deterministicEchoPresetForIdentity,
} from "./echoPresetAssignment";

export {
  deterministicEchoPresetForIdentity,
  stableIdentityHash,
} from "./echoPresetAssignment";

/** Minimal public visual identity input — not a full Profile row. */
export type ProfileIdentityMediaSource = {
  profile_photos?: unknown;
  echo_preset?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  username?: string | null;
};

export type ProfileIdentityMediaKind =
  | "photos"
  | "echo"
  | "legacy-photo"
  | "empty";

export type ProfileIdentityMediaResolved = {
  /** Real profile photos only (0–3). Echo is never included. */
  photos: string[];
  /** First real photo path, or legacy real avatar when kind is legacy-photo. */
  primaryPhoto: string | null;
  /** Independent Echo preset token when applicable. */
  echoPreset: string | null;
  /** Compatibility face path (avatar_url sync / legacy). */
  fallbackAvatar: string | null;
  kind: ProfileIdentityMediaKind;
};

/**
 * Authoritative resolver for Profile identity media on social surfaces.
 * Performs no Supabase, Profile service, or Storage calls.
 */
export function resolveProfileIdentityMedia(
  source: ProfileIdentityMediaSource,
): ProfileIdentityMediaResolved {
  const photos = normalizeProfilePhotos(source.profile_photos);
  const echoPreset = normalizeEchoPreset(source.echo_preset);
  const avatarRaw =
    typeof source.avatar_url === "string" ? source.avatar_url.trim() : "";

  if (photos.length > 0) {
    return {
      photos,
      primaryPhoto: photos[0] ?? null,
      echoPreset,
      fallbackAvatar: resolveCompatAvatarUrl({
        avatar_url: source.avatar_url,
        profile_photos: photos,
        echo_preset: echoPreset,
      }),
      kind: "photos",
    };
  }

  if (echoPreset) {
    return {
      photos: [],
      primaryPhoto: null,
      echoPreset,
      fallbackAvatar: echoPreset,
      kind: "echo",
    };
  }

  if (avatarRaw) {
    if (isAvatarPresetValue(avatarRaw)) {
      return {
        photos: [],
        primaryPhoto: null,
        echoPreset: avatarRaw,
        fallbackAvatar: avatarRaw,
        kind: "echo",
      };
    }
    return {
      photos: [],
      primaryPhoto: avatarRaw,
      echoPreset: null,
      fallbackAvatar: avatarRaw,
      kind: "legacy-photo",
    };
  }

  return {
    photos: [],
    primaryPhoto: null,
    echoPreset: null,
    fallbackAvatar: null,
    kind: "empty",
  };
}

/** Neutral initial for empty fallback — never owner-specific copy. */
export function profileIdentityInitial(
  source: ProfileIdentityMediaSource,
): string {
  const display =
    typeof source.display_name === "string" ? source.display_name.trim() : "";
  const username =
    typeof source.username === "string" ? source.username.trim() : "";
  const letter = (display || username).charAt(0).toUpperCase();
  return letter || "?";
}

/** Input for display-only Echo resolution (Profile hero — no DB writes). */
export type DisplayEchoPresetSource = {
  profile_photos?: unknown;
  echo_preset?: string | null;
  avatar_url?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
};

/**
 * Display Echo for Profile hero — stored value wins; no Supabase/cache writes.
 *
 * Priority:
 * 1. valid stored echo_preset
 * 2. legacy preset encoded in avatar_url
 * 3. deterministic fallback from user_id, else profile_id
 */
export function resolveDisplayEchoPreset(
  source: DisplayEchoPresetSource,
): string | null {
  const stored = normalizeEchoPreset(source.echo_preset);
  if (stored) return stored;

  const avatarRaw =
    typeof source.avatar_url === "string" ? source.avatar_url.trim() : "";
  if (avatarRaw && isAvatarPresetValue(avatarRaw)) {
    return avatarRaw;
  }

  const userId =
    typeof source.user_id === "string" ? source.user_id.trim() : "";
  const profileId =
    typeof source.profile_id === "string" ? source.profile_id.trim() : "";
  const identityKey = userId || profileId;
  if (!identityKey) return null;

  return deterministicEchoPresetForIdentity(identityKey);
}
