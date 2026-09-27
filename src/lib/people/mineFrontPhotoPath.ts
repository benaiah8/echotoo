/**
 * Resolve Mine front-photo storage path + display URL from the same inputs
 * as portrait media and the ±2 warm window (photoIndexByPersonKey).
 */

import { avatarDisplayUrl } from "../avatarDisplayUrl";
import {
  resolveProfileIdentityMedia,
  type ProfileIdentityMediaSource,
} from "../profileIdentityMedia";

/** Storage / preset path for the displayed front photo at `photoIndex`. */
export function resolveMineFrontPhotoPath(
  source: ProfileIdentityMediaSource,
  photoIndex: number,
): string | null {
  const resolved = resolveProfileIdentityMedia(source);
  if (resolved.kind === "photos" && resolved.photos.length > 0) {
    const n = resolved.photos.length;
    const i = ((photoIndex % n) + n) % n;
    return resolved.photos[i] ?? null;
  }
  if (resolved.kind === "echo" && resolved.echoPreset) {
    return resolved.echoPreset;
  }
  if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    return resolved.primaryPhoto;
  }
  return null;
}

/** Display URL for warm + atmosphere (avatarDisplayUrl pipeline). */
export function resolveMineFrontDisplayUrl(
  source: ProfileIdentityMediaSource,
  photoIndex: number,
): string | null {
  const path = resolveMineFrontPhotoPath(source, photoIndex);
  if (!path) return null;
  return avatarDisplayUrl(path) ?? null;
}
