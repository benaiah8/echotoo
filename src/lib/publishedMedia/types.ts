/**
 * Published post media model (Post Detail / future Feed).
 * Separate from Create DraftVideo — remote Bunny + activity image URLs only.
 */

import type { PostMediaVideoStatus } from "../bunnyUpload/types";
import type { PublishedMediaOrderItem } from "../createDraftMediaOrder";
import {
  normalizePublishedImageUrl,
  resolvePublishedImageDisplayUrl,
} from "./normalizePublishedImageUrl";

export type PublishedVideoStatus = PostMediaVideoStatus;

export type PublishedMediaItem =
  | {
      kind: "image";
      key: string;
      url: string;
    }
  | {
      kind: "video";
      key: string;
      mediaId: string;
      videoId: string;
      status: PublishedVideoStatus;
      posterUrl: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    };

export type PublishedPostMediaRow = {
  id: string;
  post_id: string | null;
  sort_order: number;
  kind: string;
  bunny_video_id: string;
  video_status: PublishedVideoStatus;
  poster_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
};

export function isPublishedMediaOrder(
  value: unknown,
): value is PublishedMediaOrderItem[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    if (row.kind === "image") {
      return typeof row.url === "string" && row.url.trim().length > 0;
    }
    if (row.kind === "video") {
      return typeof row.mediaId === "string" && row.mediaId.trim().length > 0;
    }
    return false;
  });
}

function videoItemFromRow(row: PublishedPostMediaRow): PublishedMediaItem {
  return {
    kind: "video",
    key: `video:${row.id}`,
    mediaId: row.id,
    videoId: row.bunny_video_id,
    status: row.video_status,
    posterUrl: row.poster_url,
    width: row.width,
    height: row.height,
    durationSec: row.duration_sec,
  };
}

function imageItem(url: string): PublishedMediaItem | null {
  const display = resolvePublishedImageDisplayUrl(url);
  const identity = normalizePublishedImageUrl(url);
  if (!display || !identity) return null;
  return {
    kind: "image",
    key: `image:${identity}`,
    url: display,
  };
}

/**
 * Build ordered PublishedMediaItem[] for Post Detail.
 *
 * Valid media_order is authoritative for membership + order (lookup only).
 * Legacy (no media_order): images then videos by sort_order.
 */
export function buildPublishedMediaItems(options: {
  imageUrls: string[];
  mediaOrder: unknown;
  postMedia: PublishedPostMediaRow[];
}): PublishedMediaItem[] {
  const imageUrls = options.imageUrls.filter(
    (u) => typeof u === "string" && u.trim().length > 0,
  );
  const videos = options.postMedia.filter(
    (row) =>
      row &&
      typeof row.id === "string" &&
      typeof row.bunny_video_id === "string" &&
      row.bunny_video_id.trim().length > 0,
  );
  const byId = new Map(videos.map((v) => [v.id, v]));

  // Index gallery URLs by normalized identity for resolving media_order paths.
  const galleryByIdentity = new Map<string, string>();
  for (const url of imageUrls) {
    const id = normalizePublishedImageUrl(url);
    if (id && !galleryByIdentity.has(id)) {
      galleryByIdentity.set(id, url);
    }
  }

  if (isPublishedMediaOrder(options.mediaOrder)) {
    const out: PublishedMediaItem[] = [];
    const usedVideoIds = new Set<string>();
    const usedImageIds = new Set<string>();

    for (const item of options.mediaOrder) {
      if (item.kind === "image") {
        const identity = normalizePublishedImageUrl(item.url);
        if (!identity || usedImageIds.has(identity)) continue;
        // Prefer gallery-normalized display URL when available.
        const source = galleryByIdentity.get(identity) ?? item.url;
        const built = imageItem(source);
        if (!built) continue;
        usedImageIds.add(identity);
        out.push(built);
        continue;
      }
      const row = byId.get(item.mediaId.trim());
      if (!row || usedVideoIds.has(row.id)) continue;
      usedVideoIds.add(row.id);
      out.push(videoItemFromRow(row));
    }

    // Valid media_order is authoritative — do NOT append leftover gallery/videos.
    return out;
  }

  // Legacy: images first, then attached videos (sort_order).
  const out: PublishedMediaItem[] = [];
  const usedImageIds = new Set<string>();
  for (const url of imageUrls) {
    const identity = normalizePublishedImageUrl(url);
    if (!identity || usedImageIds.has(identity)) continue;
    const built = imageItem(url);
    if (!built) continue;
    usedImageIds.add(identity);
    out.push(built);
  }
  const sortedVideos = [...videos].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  for (const row of sortedVideos) {
    out.push(videoItemFromRow(row));
  }
  return out;
}

/** Aspect ratio for video layout; null → caller uses fallback. */
export function publishedVideoAspectRatio(
  item: Extract<PublishedMediaItem, { kind: "video" }>,
): number | null {
  const w = item.width;
  const h = item.height;
  if (
    typeof w === "number" &&
    typeof h === "number" &&
    w > 0 &&
    h > 0 &&
    Number.isFinite(w) &&
    Number.isFinite(h)
  ) {
    return w / h;
  }
  return null;
}

/** Canonical video-only post: exactly one media item and it is video. */
export function isPublishedVideoOnly(
  items: readonly PublishedMediaItem[],
): boolean {
  return items.length === 1 && items[0]?.kind === "video";
}

/** Exactly one published image (no video). */
export function isPublishedSingleImage(
  items: readonly PublishedMediaItem[],
): boolean {
  return items.length === 1 && items[0]?.kind === "image";
}

export type PublishedMediaFrameStyle = {
  height?: string;
  width?: string;
  aspectRatio?: string;
  maxHeight?: string;
  minHeight?: string;
};

export type PublishedMediaFrameOptions = {
  /**
   * Resolved multi-media aspect ratio from resolvePublishedMultiMediaFrame.
   * When omitted for multi items, uses provisional 1:1 (not legacy maxHeight).
   */
  multiAspectRatio?: number | null;
  /** Emergency only — prefer omitted; PV3.6 uses 1:1 provisional instead. */
  emergencyMaxHeight?: string;
};

/**
 * Outer media stage style (PV3.2–PV3.7).
 * Single video with dims → natural aspect-ratio (no maxHeight).
 * Single video without dims → shared temporary fallback (not Feed 40vh / Detail 50vh).
 * Single image → intrinsic height (width 100%, height auto).
 * Multi → shared aspect-ratio (+ minHeight); no maxHeight when ratio known.
 */
/** Temporary geometry when single video lacks positive width/height. */
export const PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT = "16 / 9";
export const PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT = "12rem";

export function publishedMediaFrameStyle(
  items: readonly PublishedMediaItem[],
  maxHeight: string,
  options?: PublishedMediaFrameOptions,
): PublishedMediaFrameStyle {
  if (isPublishedSingleImage(items)) {
    return {
      width: "100%",
      height: "auto",
    };
  }
  if (isPublishedVideoOnly(items)) {
    const video = items[0] as Extract<PublishedMediaItem, { kind: "video" }>;
    const w = video.width;
    const h = video.height;
    if (
      typeof w !== "number" ||
      typeof h !== "number" ||
      !(w > 0) ||
      !(h > 0) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h)
    ) {
      // Ignore surface-specific maxHeight (40vh vs 50vh) — one temporary fallback.
      void maxHeight;
      return {
        width: "100%",
        aspectRatio: PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT,
        height: "auto",
        minHeight: PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT,
      };
    }
    return {
      width: "100%",
      aspectRatio: `${w} / ${h}`,
      height: "auto",
    };
  }

  // Multi-media: content-aware shared ratio (caller supplies committed/provisional).
  const multi =
    typeof options?.multiAspectRatio === "number" &&
    Number.isFinite(options.multiAspectRatio) &&
    options.multiAspectRatio > 0
      ? options.multiAspectRatio
      : 1;
  return {
    width: "100%",
    aspectRatio: `${Math.round(multi * 10000) / 10000}`,
    height: "auto",
    minHeight: "12rem",
  };
}
