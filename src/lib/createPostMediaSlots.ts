import { CREATE_FLOW_LIMITS } from "./createFlowLimits";

/** Total media slots per post (images + at most one video). */
export const MAX_TOTAL_POST_MEDIA =
  CREATE_FLOW_LIMITS.activities.maxTotalImagesPerPost;

export function countTotalPostMedia(
  totalImages: number,
  hasVideo: boolean,
): number {
  return totalImages + (hasVideo ? 1 : 0);
}

export function formatPostMediaCountLabel(
  totalImages: number,
  hasVideo: boolean,
): string {
  return `${countTotalPostMedia(totalImages, hasVideo)}/${MAX_TOTAL_POST_MEDIA}`;
}

export function imageSlotsRemaining(
  totalImages: number,
  hasVideo: boolean,
): number {
  return Math.max(
    0,
    MAX_TOTAL_POST_MEDIA - countTotalPostMedia(totalImages, hasVideo),
  );
}

export function isTotalMediaAtCap(
  totalImages: number,
  hasVideo: boolean,
): boolean {
  return countTotalPostMedia(totalImages, hasVideo) >= MAX_TOTAL_POST_MEDIA;
}

export function canAddPostVideo(totalImages: number, hasVideo: boolean): boolean {
  if (hasVideo) return false;
  return countTotalPostMedia(totalImages, true) <= MAX_TOTAL_POST_MEDIA;
}
