/**
 * Public Create source resolution contract (PASS C3.1).
 * Caps accepted sources at 4K-class display size (UHD / DCI / portrait).
 */

/** Max display long edge (e.g. 4096 for DCI 4K). */
export const MAX_CREATE_VIDEO_LONG_EDGE_PX = 4096;

/** Max display short edge (UHD/DCI height). */
export const MAX_CREATE_VIDEO_SHORT_EDGE_PX = 2160;

/** Max coded/display pixel area. */
export const MAX_CREATE_VIDEO_PIXEL_AREA =
  MAX_CREATE_VIDEO_LONG_EDGE_PX * MAX_CREATE_VIDEO_SHORT_EDGE_PX;

export type VideoDisplaySize = {
  width: number;
  height: number;
};

/**
 * Convert coded width/height + rotation into display orientation size.
 * Rotation 90/270 swaps axes.
 */
export function toCreateVideoDisplaySize(
  codedWidth: number,
  codedHeight: number,
  rotationDegrees: number = 0,
): VideoDisplaySize {
  const w = Math.max(0, Math.floor(codedWidth));
  const h = Math.max(0, Math.floor(codedHeight));
  const rot = ((Math.floor(rotationDegrees) % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    return { width: h, height: w };
  }
  return { width: w, height: h };
}

/**
 * True when known display dimensions exceed the public 4K contract.
 * Unknown/zero dimensions return false (caller should probe further).
 */
export function isCreateVideoResolutionOverLimit(
  width: number | null | undefined,
  height: number | null | undefined,
  rotationDegrees: number = 0,
): boolean {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return false;
  }
  const display = toCreateVideoDisplaySize(width, height, rotationDegrees);
  const longEdge = Math.max(display.width, display.height);
  const shortEdge = Math.min(display.width, display.height);
  if (longEdge > MAX_CREATE_VIDEO_LONG_EDGE_PX) return true;
  if (shortEdge > MAX_CREATE_VIDEO_SHORT_EDGE_PX) return true;
  if (display.width * display.height > MAX_CREATE_VIDEO_PIXEL_AREA) return true;
  return false;
}
