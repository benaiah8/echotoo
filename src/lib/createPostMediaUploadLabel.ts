/**
 * Copy for in-flight Create post media status (remote image upload + local video add).
 * Bunny video network upload wording is reserved for true upload-in-progress counts.
 */

/** Legacy Create upload label (image remote + Bunny video upload counts). */
export function formatCreateMediaUploadLabel(
  imageCount: number,
  videoCount: number,
): string | null {
  const images = Math.max(0, imageCount);
  const videos = Math.max(0, videoCount);
  const total = images + videos;
  if (total <= 0) return null;

  if (videos === 0) {
    return images === 1 ? "1 image uploading" : `${images} images uploading`;
  }
  if (images === 0) {
    return videos === 1 ? "1 video uploading" : `${videos} videos uploading`;
  }
  return `${total} media uploading`;
}

/**
 * Create status label with local "Adding video…" / "Preparing video…" support.
 * Prefer this on Finalize hero pill / notice when local ingest can be pending.
 */
export function formatCreateMediaStatusLabel(options: {
  imageUploadingCount: number;
  videoUploadingCount?: number;
  videoAddingCount?: number;
  /** Future local preparation — only when status is actually preparing. */
  videoPreparingCount?: number;
}): string | null {
  const images = Math.max(0, options.imageUploadingCount);
  const videoUploading = Math.max(0, options.videoUploadingCount ?? 0);
  const videoAdding = Math.max(0, options.videoAddingCount ?? 0);
  const videoPreparing = Math.max(0, options.videoPreparingCount ?? 0);

  if (videoAdding > 0) {
    const parts: string[] = [];
    if (images > 0) {
      parts.push(
        images === 1 ? "1 image uploading" : `${images} images uploading`,
      );
    }
    parts.push("Adding video…");
    return parts.join(" · ");
  }

  if (videoPreparing > 0) {
    const parts: string[] = [];
    if (images > 0) {
      parts.push(
        images === 1 ? "1 image uploading" : `${images} images uploading`,
      );
    }
    parts.push("Preparing video…");
    return parts.join(" · ");
  }

  return formatCreateMediaUploadLabel(images, videoUploading);
}
