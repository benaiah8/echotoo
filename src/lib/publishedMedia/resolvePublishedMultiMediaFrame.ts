/**
 * Canonical multi-media carousel frame (PV3.6).
 * Video-priority aspect ratio, else image-only median (clamped), else provisional 1:1.
 */

import type { PublishedMediaItem, PublishedMediaFrameStyle } from "./types";
import { isPositivePublishedDimension } from "./mergePublishedVideoDimensions";

/** Soft floor so ultra-wide multi frames stay usable. */
export const PUBLISHED_MULTI_MIN_HEIGHT = "12rem";

/** Image-only provisional until enough natural sizes are known. */
export const PUBLISHED_MULTI_PROVISIONAL_ASPECT = 1;

/** Clamp band for image-only representative ratios. */
export const PUBLISHED_MULTI_ASPECT_MIN = 9 / 16;
export const PUBLISHED_MULTI_ASPECT_MAX = 16 / 9;

/** Reject 1×1 / tiny CDN placeholders before freezing multi ratio. */
export const PUBLISHED_IMAGE_SAMPLE_MIN_PX = 32;

export type PublishedImageAspectSample = {
  key: string;
  width: number;
  height: number;
};

export function isUsablePublishedImageNaturalSize(
  width: number,
  height: number,
): boolean {
  return (
    isPositivePublishedDimension(width) &&
    isPositivePublishedDimension(height) &&
    width >= PUBLISHED_IMAGE_SAMPLE_MIN_PX &&
    height >= PUBLISHED_IMAGE_SAMPLE_MIN_PX
  );
}

export function publishedMediaMembershipSignature(
  items: readonly PublishedMediaItem[],
): string {
  return items.map((item) => item.key).join("\0");
}

/** First valid video source aspect in media order. */
export function findPrimaryPublishedVideoAspectRatio(
  items: readonly PublishedMediaItem[],
): number | null {
  for (const item of items) {
    if (item.kind !== "video") continue;
    if (
      !isPositivePublishedDimension(item.width) ||
      !isPositivePublishedDimension(item.height)
    ) {
      continue;
    }
    return item.width / item.height;
  }
  return null;
}

export function medianNumber(values: readonly number[]): number | null {
  const nums = values.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function clampPublishedImageOnlyAspectRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return PUBLISHED_MULTI_PROVISIONAL_ASPECT;
  }
  return Math.min(
    PUBLISHED_MULTI_ASPECT_MAX,
    Math.max(PUBLISHED_MULTI_ASPECT_MIN, ratio),
  );
}

export function aspectRatioFromImageSample(
  sample: PublishedImageAspectSample,
): number | null {
  if (!isUsablePublishedImageNaturalSize(sample.width, sample.height)) {
    return null;
  }
  return sample.width / sample.height;
}

/**
 * Image-only representative ratio from known samples (median + clamp).
 * Returns null when no usable samples yet.
 */
export function resolvePublishedImageOnlyAspectRatio(
  samples: readonly PublishedImageAspectSample[],
): number | null {
  const ratios: number[] = [];
  for (const sample of samples) {
    const r = aspectRatioFromImageSample(sample);
    if (r != null) ratios.push(r);
  }
  const median = medianNumber(ratios);
  if (median == null) return null;
  return clampPublishedImageOnlyAspectRatio(median);
}

export function formatPublishedAspectRatioCss(ratio: number): string {
  // Prefer compact readable form when close to simple fractions.
  const rounded = Math.round(ratio * 10000) / 10000;
  return `${rounded}`;
}

export type ResolvePublishedMultiMediaFrameInput = {
  items: readonly PublishedMediaItem[];
  /** Known decoded/owner image sizes keyed by item.key */
  imageAspectSamples?: readonly PublishedImageAspectSample[];
  /**
   * Frozen ratio from prior commit (presentation state).
   * When set, reused unless membership changed (caller resets).
   */
  committedAspectRatio?: number | null;
};

export type ResolvePublishedMultiMediaFrameResult = {
  style: PublishedMediaFrameStyle;
  /** Ratio used for CSS aspect-ratio (always > 0 when multi). */
  aspectRatio: number;
  source: "video" | "image-median" | "committed" | "provisional";
  /** True when caller should freeze this ratio for the membership. */
  shouldCommit: boolean;
};

/**
 * Resolve stable shared frame for items.length > 1.
 * No maxHeight when a ratio (including provisional 1:1) is used.
 */
export function resolvePublishedMultiMediaFrame(
  input: ResolvePublishedMultiMediaFrameInput,
): ResolvePublishedMultiMediaFrameResult {
  const items = input.items;
  const committed =
    typeof input.committedAspectRatio === "number" &&
    Number.isFinite(input.committedAspectRatio) &&
    input.committedAspectRatio > 0
      ? input.committedAspectRatio
      : null;

  if (committed != null) {
    return {
      style: {
        width: "100%",
        aspectRatio: formatPublishedAspectRatioCss(committed),
        height: "auto",
        minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
      },
      aspectRatio: committed,
      source: "committed",
      shouldCommit: false,
    };
  }

  const videoRatio = findPrimaryPublishedVideoAspectRatio(items);
  if (videoRatio != null) {
    return {
      style: {
        width: "100%",
        aspectRatio: formatPublishedAspectRatioCss(videoRatio),
        height: "auto",
        minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
      },
      aspectRatio: videoRatio,
      source: "video",
      shouldCommit: true,
    };
  }

  const hasVideo = items.some((item) => item.kind === "video");
  // Mixed set still waiting on video dims: stay provisional (do not freeze image median).
  if (hasVideo) {
    return {
      style: {
        width: "100%",
        aspectRatio: formatPublishedAspectRatioCss(
          PUBLISHED_MULTI_PROVISIONAL_ASPECT,
        ),
        height: "auto",
        minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
      },
      aspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
      source: "provisional",
      shouldCommit: false,
    };
  }

  const imageKeys = items
    .filter((i): i is Extract<PublishedMediaItem, { kind: "image" }> => i.kind === "image")
    .map((i) => i.key);
  const samples = input.imageAspectSamples ?? [];
  const samplesForSet = samples.filter((s) => imageKeys.includes(s.key));
  const median = resolvePublishedImageOnlyAspectRatio(samplesForSet);

  const allImagesSampled =
    imageKeys.length > 0 &&
    imageKeys.every((key) =>
      samplesForSet.some(
        (s) =>
          s.key === key && isUsablePublishedImageNaturalSize(s.width, s.height),
      ),
    );

  if (median != null && allImagesSampled) {
    return {
      style: {
        width: "100%",
        aspectRatio: formatPublishedAspectRatioCss(median),
        height: "auto",
        minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
      },
      aspectRatio: median,
      source: "image-median",
      shouldCommit: true,
    };
  }

  // Provisional 1:1 until samples complete (prefer over legacy 40vh/50vh).
  return {
    style: {
      width: "100%",
      aspectRatio: formatPublishedAspectRatioCss(
        PUBLISHED_MULTI_PROVISIONAL_ASPECT,
      ),
      height: "auto",
      minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
    },
    aspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    source: "provisional",
    shouldCommit: false,
  };
}
