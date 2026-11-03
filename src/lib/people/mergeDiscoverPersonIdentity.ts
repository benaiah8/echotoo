/**
 * Discover-only: reconcile profile media across loaded Pair Up rows for one person.
 * Uses pairUpPersonKey — never display_name. No network I/O.
 */
import type { PairUpCandidate } from "./types";
import { pairUpPersonKey } from "./pairUpPersonKey";
import type { ProfileIdentityMediaSource } from "../profileIdentityMedia";
import {
  resolveProfileIdentityMedia,
} from "../profileIdentityMedia";
import {
  filterDiscoverPresentationPhotos,
  resolveDiscoverMergedAvatarUrl,
} from "./discoverProfilePhotoSelection";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
  PROFILE_PHOTOS_MAX,
  uniqueOrderedProfilePhotos,
} from "../profilePhotos";

/** Rows sharing personKey in deck order (first-seen wins for display fields). */
function rowsForPersonKey(
  personKey: string,
  rows: readonly PairUpCandidate[]
): PairUpCandidate[] {
  const pk = personKey.trim();
  if (!pk) return [];
  return rows.filter((row) => pairUpPersonKey(row) === pk);
}

/**
 * Richest photo set among loaded rows: union in deck order, capped at 3.
 */
export function mergeDiscoverProfilePhotos(
  rows: readonly PairUpCandidate[]
): string[] {
  const union: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const path of normalizeProfilePhotos(row.profile_photos)) {
      if (seen.has(path)) continue;
      seen.add(path);
      union.push(path);
      if (union.length >= PROFILE_PHOTOS_MAX) return union;
    }
  }
  return uniqueOrderedProfilePhotos(union);
}

/**
 * Build one identity source for Discover media for a stable personKey.
 * Returns null when personKey is empty or no matching rows.
 */
export function mergeDiscoverPersonIdentity(
  personKey: string,
  deckRows: readonly PairUpCandidate[]
): ProfileIdentityMediaSource | null {
  const matches = rowsForPersonKey(personKey, deckRows);
  if (matches.length === 0) return null;

  const rawPhotos = mergeDiscoverProfilePhotos(matches);
  const anchor = matches[0]!;
  const userId = anchor.creator_id;
  const photos = filterDiscoverPresentationPhotos(rawPhotos, userId);

  let echoPreset: string | null = null;
  for (const row of matches) {
    const preset = normalizeEchoPreset(row.echo_preset);
    if (preset) {
      echoPreset = preset;
      break;
    }
  }

  const avatarUrl = resolveDiscoverMergedAvatarUrl(matches, userId, photos);

  return {
    profile_photos: photos,
    echo_preset: echoPreset,
    avatar_url: avatarUrl,
    display_name: anchor.display_name,
    username: anchor.username,
    user_id: anchor.creator_id,
    profile_id: anchor.profile_id,
  };
}

/**
 * True when every resolvable photo URL for this source has failed to load.
 * Multi-photo: one failure does not flip to character until all paths fail.
 */
export function discoverPersonPhotoLoadFallbackToCharacter(
  source: ProfileIdentityMediaSource,
  failedPaths: ReadonlySet<string>
): boolean {
  if (failedPaths.size === 0) return false;
  const resolved = resolveProfileIdentityMedia(source);
  if (resolved.kind === "photos" && resolved.photos.length > 0) {
    return resolved.photos.every((path) => failedPaths.has(path));
  }
  if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    return failedPaths.has(resolved.primaryPhoto);
  }
  return false;
}

/** Map personKey → merged identity for all people present in deckRows. */
export function buildDiscoverIdentityByPersonKey(
  deckRows: readonly PairUpCandidate[]
): Map<string, ProfileIdentityMediaSource> {
  const map = new Map<string, ProfileIdentityMediaSource>();
  const seen = new Set<string>();
  for (const row of deckRows) {
    const pk = pairUpPersonKey(row);
    if (!pk || seen.has(pk)) continue;
    seen.add(pk);
    const merged = mergeDiscoverPersonIdentity(pk, deckRows);
    if (merged) map.set(pk, merged);
  }
  return map;
}
