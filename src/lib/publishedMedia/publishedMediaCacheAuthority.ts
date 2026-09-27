/**
 * Narrow published-media cache write authority (Pass 2A).
 * Prevents partial legacy galleries from clobbering complete ones.
 * Valid media_order remains fully authoritative.
 */

import { isPublishedMediaOrder, type PublishedMediaItem } from "./types";

export type PublishedMediaCacheProvenance = "media-order" | "legacy-gallery";

/** Legacy gallery completeness belief (only for provenance === "legacy-gallery"). */
export type PublishedMediaLegacyScope = "partial" | "full";

export type PublishedMediaCacheAuthority = {
  provenance: PublishedMediaCacheProvenance;
  legacyScope?: PublishedMediaLegacyScope;
};

export function resolvePublishedMediaCacheAuthority(options: {
  mediaOrder: unknown;
  /** Explicit legacy scope when media_order is not valid. Default partial. */
  legacyScope?: PublishedMediaLegacyScope;
}): PublishedMediaCacheAuthority {
  if (isPublishedMediaOrder(options.mediaOrder)) {
    return { provenance: "media-order" };
  }
  return {
    provenance: "legacy-gallery",
    legacyScope: options.legacyScope ?? "partial",
  };
}

function imageKeys(items: readonly PublishedMediaItem[]): string[] {
  return items
    .filter((i): i is Extract<PublishedMediaItem, { kind: "image" }> => i.kind === "image")
    .map((i) => i.key);
}

function imageKeySet(items: readonly PublishedMediaItem[]): Set<string> {
  return new Set(imageKeys(items));
}

/**
 * True when `incoming` is a strictly poorer legacy image membership than `existing`
 * (incoming is a proper subset / fewer images that are all already known).
 */
export function isPoorerLegacyImageMembership(
  existingItems: readonly PublishedMediaItem[],
  incomingItems: readonly PublishedMediaItem[],
): boolean {
  const existing = imageKeys(existingItems);
  const incoming = imageKeys(incomingItems);
  if (incoming.length >= existing.length) return false;
  if (existing.length === 0) return false;
  const existingSet = new Set(existing);
  return incoming.every((k) => existingSet.has(k));
}

/**
 * True when incoming legacy gallery is a completeness upgrade over existing legacy
 * (contains all existing image keys and adds at least one).
 */
export function isLegacyGalleryCompletenessUpgrade(
  existingItems: readonly PublishedMediaItem[],
  incomingItems: readonly PublishedMediaItem[],
): boolean {
  const existing = imageKeySet(existingItems);
  const incoming = imageKeySet(incomingItems);
  if (incoming.size <= existing.size) return false;
  for (const k of existing) {
    if (!incoming.has(k)) return false;
  }
  return true;
}

export type PublishedMediaCacheWriteCandidate = {
  items: PublishedMediaItem[];
  mediaOrder: unknown;
  provenance: PublishedMediaCacheProvenance;
  legacyScope?: PublishedMediaLegacyScope;
};

export type PublishedMediaCacheWriteDecision = "apply" | "keep-existing";

/**
 * Decide whether an incoming cache write may replace `existing`.
 *
 * Rules:
 * - No existing → apply
 * - Incoming valid media_order → apply (authoritative membership)
 * - Existing valid media_order + incoming legacy → keep existing
 * - Both legacy: reject strictly poorer membership (partial cannot replace full/richer)
 * - Both legacy: allow completeness upgrades and non-poorer refreshes
 */
export function decidePublishedMediaCacheWrite(options: {
  existing: PublishedMediaCacheWriteCandidate | null;
  incoming: PublishedMediaCacheWriteCandidate;
}): PublishedMediaCacheWriteDecision {
  const { existing, incoming } = options;
  if (!existing || existing.items.length === 0) return "apply";

  const incomingOrder = isPublishedMediaOrder(incoming.mediaOrder);
  const existingOrder = isPublishedMediaOrder(existing.mediaOrder);

  if (incomingOrder) return "apply";
  if (existingOrder) return "keep-existing";

  // Both legacy galleries.
  if (isPoorerLegacyImageMembership(existing.items, incoming.items)) {
    return "keep-existing";
  }

  // Prefer keeping a known-full gallery over a partial with equal/ambiguous membership.
  if (
    existing.legacyScope === "full" &&
    incoming.legacyScope === "partial" &&
    !isLegacyGalleryCompletenessUpgrade(existing.items, incoming.items)
  ) {
    return "keep-existing";
  }

  return "apply";
}
