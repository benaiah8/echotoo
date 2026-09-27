/**
 * Published immersive fullscreen — manual video-content quarter turns.
 * Visual transform only. Does not change device/app orientation.
 */

import type { CSSProperties } from "react";

export type ManualVideoRotateDeg = 0 | 90 | 180 | 270;

export function normalizeManualVideoRotateDeg(
  value: number,
): ManualVideoRotateDeg {
  const n = ((Math.round(value / 90) % 4) + 4) % 4;
  return (n * 90) as ManualVideoRotateDeg;
}

export function nextManualVideoRotateDeg(
  current: ManualVideoRotateDeg,
): ManualVideoRotateDeg {
  return normalizeManualVideoRotateDeg(current + 90);
}

export function isManualVideoQuarterTurn(deg: ManualVideoRotateDeg): boolean {
  return deg === 90 || deg === 270;
}

/**
 * Fit style for a content layer centered in a W×H stage.
 * At 90°/270°, width/height swap so object-contain still fits the viewport.
 */
export function resolveManualVideoRotateFitStyle(
  deg: ManualVideoRotateDeg,
  containerWidthPx: number,
  containerHeightPx: number,
): CSSProperties {
  if (!(containerWidthPx > 0) || !(containerHeightPx > 0)) {
    return deg === 0
      ? { position: "absolute", inset: 0 }
      : {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "100%",
          height: "100%",
          transform: `translate(-50%, -50%) rotate(${deg}deg)`,
        };
  }

  const quarter = isManualVideoQuarterTurn(deg);
  const width = quarter ? containerHeightPx : containerWidthPx;
  const height = quarter ? containerWidthPx : containerHeightPx;

  if (deg === 0) {
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height,
    };
  }

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width,
    height,
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
  };
}

/** True when rotate control should appear in published immersive FS. */
export function shouldShowPublishedFullscreenVideoRotateControl(options: {
  open: boolean;
  activeIsVideo: boolean;
}): boolean {
  return options.open && options.activeIsVideo;
}
