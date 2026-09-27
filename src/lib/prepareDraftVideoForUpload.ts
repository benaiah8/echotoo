/**
 * Future insertion point for lightweight video compression/preprocessing.
 *
 * V3G0 / V3G1.2: pass-through — returns the same File unchanged.
 *
 * NEXT PASS (intended):
 * - after local selection → background prepare/compress where needed
 * - creator continues editing while preparation runs
 * - preparation is cancellable
 * - original retained until output succeeds
 * - prepared output persisted with draft metadata
 * - Publish uses prepared output when ready
 * - canceled/failed preparation may fall back to original
 *
 * Do not start Bunny upload during Create.
 */
export async function prepareDraftVideoForUpload(file: File): Promise<File> {
  return file;
}
