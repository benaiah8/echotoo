/**
 * Session object-URL cache for web DraftImage previews (PASS LI1A).
 * Never persist these URLs in draftMeta / activities / mediaOrder.
 */

const sessionPreviewUrls = new Map<string, string>();

export function getCachedDraftImagePreviewUrl(
  localId: string,
): string | undefined {
  return sessionPreviewUrls.get(localId.trim());
}

export function setCachedDraftImagePreviewUrl(
  localId: string,
  url: string,
): void {
  const id = localId.trim();
  if (!id || !url) return;
  sessionPreviewUrls.set(id, url);
}

/** Revoke and remove one session preview URL (blob: only). */
export function releaseDraftImagePreview(localId: string): void {
  const id = localId.trim();
  const url = sessionPreviewUrls.get(id);
  if (!url) return;
  sessionPreviewUrls.delete(id);
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** Revoke all session draft-image object URLs. */
export function clearDraftImagePreviewCache(): void {
  for (const localId of Array.from(sessionPreviewUrls.keys())) {
    releaseDraftImagePreview(localId);
  }
}

/** Test helper — current cache size. */
export function __draftImagePreviewCacheSizeForTests(): number {
  return sessionPreviewUrls.size;
}

export function __resetDraftImagePreviewCacheForTests(): void {
  clearDraftImagePreviewCache();
}
