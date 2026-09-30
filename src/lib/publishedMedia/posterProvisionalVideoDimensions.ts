/**
 * Temporary frame geometry from poster natural size while a published video
 * is still pending/uploading/processing and DB width/height are missing.
 * Client-only — never written as authoritative ready dimensions.
 */

import { isPositivePublishedDimension } from "./mergePublishedVideoDimensions";
import type { PublishedVideoStatus } from "./types";

const PROCESSING_STATUSES: ReadonlySet<PublishedVideoStatus> = new Set([
  "pending",
  "uploading",
  "processing",
]);

export function isPublishedVideoProcessingStatus(
  status: PublishedVideoStatus | null | undefined,
): boolean {
  return status != null && PROCESSING_STATUSES.has(status);
}

export function shouldApplyPosterProvisionalVideoDimensions(options: {
  status: PublishedVideoStatus | null | undefined;
  videoWidth: number | null | undefined;
  videoHeight: number | null | undefined;
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  if (!isPublishedVideoProcessingStatus(options.status)) return false;
  if (
    isPositivePublishedDimension(options.videoWidth) &&
    isPositivePublishedDimension(options.videoHeight)
  ) {
    return false;
  }
  return (
    isPositivePublishedDimension(options.naturalWidth) &&
    isPositivePublishedDimension(options.naturalHeight)
  );
}

export function posterProvisionalDimensionsAlreadyApplied(options: {
  videoWidth: number | null | undefined;
  videoHeight: number | null | undefined;
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return (
    options.videoWidth === options.naturalWidth &&
    options.videoHeight === options.naturalHeight
  );
}
