/**
 * Narrow merge for the same published video mediaId (PV3.7).
 * Membership/order stay outside this helper — callers replace structures authoritatively.
 */

import {
  isPositivePublishedDimension,
  mergePublishedVideoDimensions,
} from "./mergePublishedVideoDimensions";
import type { PublishedMediaItem, PublishedPostMediaRow, PublishedVideoStatus } from "./types";

export function mergePublishedPosterUrl(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  if (typeof incoming === "string" && incoming.trim()) {
    return incoming.trim();
  }
  if (typeof existing === "string" && existing.trim()) {
    return existing.trim();
  }
  return null;
}

export function mergePublishedDurationSec(
  existing: number | null | undefined,
  incoming: number | null | undefined,
): number | null {
  if (typeof incoming === "number" && Number.isFinite(incoming) && incoming >= 0) {
    return incoming;
  }
  if (typeof existing === "number" && Number.isFinite(existing) && existing >= 0) {
    return existing;
  }
  return null;
}

export type MergePublishedVideoItemInput = {
  existing: Extract<PublishedMediaItem, { kind: "video" }>;
  incoming: {
    videoId?: string | null;
    status?: PublishedVideoStatus;
    posterUrl?: string | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
  };
};

/** Merge video fields for one mediaId — preserves poster/dims when incoming is null. */
export function mergePublishedVideoItemFields(
  input: MergePublishedVideoItemInput,
): Extract<PublishedMediaItem, { kind: "video" }> {
  const { existing, incoming } = input;
  const dims = mergePublishedVideoDimensions({
    existingWidth: existing.width,
    existingHeight: existing.height,
    incomingWidth: incoming.width,
    incomingHeight: incoming.height,
  });
  return {
    ...existing,
    key: existing.key,
    mediaId: existing.mediaId,
    videoId:
      typeof incoming.videoId === "string" && incoming.videoId.trim()
        ? incoming.videoId.trim()
        : existing.videoId,
    status: incoming.status ?? existing.status,
    posterUrl: mergePublishedPosterUrl(existing.posterUrl, incoming.posterUrl),
    width: dims.width,
    height: dims.height,
    durationSec: mergePublishedDurationSec(
      existing.durationSec,
      incoming.durationSec,
    ),
  };
}

export function mergePublishedVideoItemFromRow(
  existing: Extract<PublishedMediaItem, { kind: "video" }>,
  row: PublishedPostMediaRow,
): Extract<PublishedMediaItem, { kind: "video" }> {
  return mergePublishedVideoItemFields({
    existing,
    incoming: {
      videoId: row.bunny_video_id,
      status: row.video_status,
      posterUrl: row.poster_url,
      width: row.width,
      height: row.height,
      durationSec: row.duration_sec,
    },
  });
}

/**
 * When reseeding a full item list, preserve positive dims + valid posters per mediaId.
 * Does not alter membership/order of `next`.
 */
export function preservePublishedVideoMetadataAcrossItems(
  existing: readonly PublishedMediaItem[] | null | undefined,
  next: PublishedMediaItem[],
): PublishedMediaItem[] {
  if (!existing?.length) return next;
  const byMediaId = new Map<
    string,
    Extract<PublishedMediaItem, { kind: "video" }>
  >();
  for (const item of existing) {
    if (item.kind === "video") byMediaId.set(item.mediaId, item);
  }
  if (byMediaId.size === 0) return next;
  return next.map((item) => {
    if (item.kind !== "video") return item;
    const prev = byMediaId.get(item.mediaId);
    if (!prev) return item;
    return mergePublishedVideoItemFields({
      existing: prev,
      incoming: {
        videoId: item.videoId,
        status: item.status,
        posterUrl: item.posterUrl,
        width: item.width,
        height: item.height,
        durationSec: item.durationSec,
      },
    });
  });
}

/** @deprecated Prefer preservePublishedVideoMetadataAcrossItems — kept for call-site clarity. */
export function preservePositiveVideoDimensions(
  existing: readonly PublishedMediaItem[] | null | undefined,
  next: PublishedMediaItem[],
): PublishedMediaItem[] {
  return preservePublishedVideoMetadataAcrossItems(existing, next);
}

export { isPositivePublishedDimension };
