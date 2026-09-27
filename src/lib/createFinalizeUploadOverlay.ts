/**
 * Finalize hero upload/status pill — image remote uploads and/or local video ingest/prep.
 * Bunny publish upload progress stays on the hero bar / video thumbnail.
 */
export function shouldShowFinalizeHeroUploadOverlayPill(options: {
  imageUploadingCount: number;
  videoUploadingCount?: number;
  videoAddingCount?: number;
  videoPreparingCount?: number;
}): boolean {
  return (
    options.imageUploadingCount > 0 ||
    (options.videoAddingCount ?? 0) > 0 ||
    (options.videoPreparingCount ?? 0) > 0
  );
}
