/**
 * Future prepared-artifact path helpers.
 * Source layout stays: create-drafts/{publishPostId}/{localId}.{ext}
 *
 * Note on naming: JS/native field `targetLongEdge` carries policy "720p/1080p"
 * short-edge targets. Native C2 maps that via Presentation.createForShortSide —
 * it does NOT treat 1080 as the literal longest pixel dimension.
 */

export function buildNativePreparedVideoTempPath(
  publishPostId: string,
  localId: string,
): string {
  return `create-drafts/${publishPostId}/${localId}.prepared.tmp.mp4`;
}

export function buildNativePreparedVideoPath(
  publishPostId: string,
  localId: string,
): string {
  return `create-drafts/${publishPostId}/${localId}.prepared.mp4`;
}
