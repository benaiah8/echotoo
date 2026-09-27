export type FinalizeVideoAspectClass = "landscape" | "square" | "portrait";

import { FINALIZE_MEDIA_THUMB_WIDTH_FRACTION } from "./createFinalizeMediaThumb";

/** height / width */
export function classifyFinalizeVideoAspect(
  width: number,
  height: number,
): FinalizeVideoAspectClass {
  if (width <= 0 || height <= 0) return "square";
  const ratio = height / width;
  if (ratio < 0.9) return "landscape";
  if (ratio > 1.15) return "portrait";
  return "square";
}

export type FinalizeHeroContainerFrame = {
  aspectRatio: string;
  maxHeight: string;
  minHeight?: string;
  aspectClass?: FinalizeVideoAspectClass;
};

export type FinalizeHeroContainerStyle = {
  aspectRatio: string;
  maxHeight: string;
  minHeight?: string;
};

export function finalizeHeroContainerStyleObject(
  frame: FinalizeHeroContainerFrame,
): FinalizeHeroContainerStyle {
  return {
    aspectRatio: frame.aspectRatio,
    maxHeight: frame.maxHeight,
    ...(frame.minHeight ? { minHeight: frame.minHeight } : {}),
  };
}

/** Default compose image hero — unchanged. */
export const COMPOSE_IMAGE_HERO_FRAME: FinalizeHeroContainerFrame = {
  aspectRatio: "4/5",
  maxHeight: "50vh",
};

/** Full composer content width (matches page padding). */
export const COMPOSER_CONTENT_WIDTH_EXPR = "calc(min(100vw, 640px) - 2rem)";

/** Minimum video hero height — 16:9 at full composer width. */
export const VIDEO_HERO_MIN_HEIGHT_EXPR = `calc(${COMPOSER_CONTENT_WIDTH_EXPR} * 9 / 16)`;

/** Maximum video hero height — safe viewport below header / above chrome. */
export const VIDEO_HERO_MAX_HEIGHT_EXPR =
  "min(70dvh, calc(100dvh - var(--create-flow-top-bar-total, calc(var(--safe-area-top-layout) + 52px)) - 12rem))";

/**
 * Pixel math for tests: clamp natural full-width height between 16:9 min and max cap.
 *
 * frameHeight = clamp(
 *   containerWidth * videoHeight / videoWidth,
 *   containerWidth * 9 / 16,
 *   maxHeightPx,
 * )
 */
export function computeVideoHeroHeightAtWidth(
  videoWidth: number,
  videoHeight: number,
  containerWidthPx: number,
  maxHeightPx: number,
): number {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return Math.min(containerWidthPx * 9 / 16, maxHeightPx);
  }
  const natural = (containerWidthPx * videoHeight) / videoWidth;
  const minHeight = (containerWidthPx * 9) / 16;
  return Math.max(minHeight, Math.min(natural, maxHeightPx));
}

/** Maximum mixed-media hero height — safe viewport below header / above chrome. */
export const MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR = VIDEO_HERO_MAX_HEIGHT_EXPR;

/** Square minimum — full composer content width (1:1). */
export const MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR = COMPOSER_CONTENT_WIDTH_EXPR;

/**
 * Pixel math for mixed posts: clamp natural full-width height between square min and max cap.
 *
 * frameHeight = clamp(
 *   containerWidth * mediaHeight / mediaWidth,
 *   containerWidth,
 *   maxHeightPx,
 * )
 */
export function computeMixedMediaHeroHeightAtWidth(
  mediaWidth: number,
  mediaHeight: number,
  containerWidthPx: number,
  maxHeightPx: number,
): number {
  const minHeight = containerWidthPx;
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return minHeight;
  }
  const natural = (containerWidthPx * mediaHeight) / mediaWidth;
  return Math.max(minHeight, Math.min(natural, maxHeightPx));
}

/**
 * Mixed image+video compose hero — square minimum, portrait may grow to safe max.
 * Used whenever the draft contains an active video (with or without images).
 */
export function resolveFinalizeMixedMediaHeroFrame(
  width?: number,
  height?: number,
): FinalizeHeroContainerFrame {
  const w = width && width > 0 ? width : 1;
  const h = height && height > 0 ? height : 1;

  return {
    aspectRatio: `${w}/${h}`,
    minHeight: MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR,
    maxHeight: MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR,
    aspectClass: classifyFinalizeVideoAspect(w, h),
  };
}

export type ResolveFinalizeComposeHeroInput = {
  hasActiveVideo: boolean;
  /**
   * @deprecated C3.2 — mixed frame no longer depends on the active slide.
   * Kept for call-site compatibility; ignored for height.
   */
  activeVideoHero?: boolean;
  videoWidth?: number;
  videoHeight?: number;
};

/**
 * Single frame owner for Create Finalize hero shell.
 * Image-only drafts keep legacy 4/5.
 * Any draft with video uses one shared mixed frame derived from VIDEO dims
 * (square 1:1 until dimensions are known) — independent of active slide.
 */
export function resolveFinalizeComposeHeroFrame(
  input: ResolveFinalizeComposeHeroInput,
): FinalizeHeroContainerStyle {
  if (!input.hasActiveVideo) {
    return finalizeHeroContainerStyleObject(COMPOSE_IMAGE_HERO_FRAME);
  }

  return finalizeHeroContainerStyleObject(
    resolveFinalizeMixedMediaHeroFrame(input.videoWidth, input.videoHeight),
  );
}

export function resolveFinalizeVideoHeroFrame(
  width?: number,
  height?: number,
): FinalizeHeroContainerFrame {
  const w = width && width > 0 ? width : 16;
  const h = height && height > 0 ? height : 9;

  return {
    aspectRatio: `${w}/${h}`,
    minHeight: VIDEO_HERO_MIN_HEIGHT_EXPR,
    maxHeight: VIDEO_HERO_MAX_HEIGHT_EXPR,
    aspectClass: classifyFinalizeVideoAspect(w, h),
  };
}

/** Reference inner dock width (compose content minus horizontal pad). */
const EXPANDED_TRAY_REFERENCE_WIDTH_PX = 400;
/** Selected ring + rounded corners allowance beyond square thumb edge. */
const EXPANDED_TRAY_THUMB_CHROME_PAD_PX = 12;

/**
 * Expanded tray height for one full thumbnail row at reference dock width.
 * Derived from `w-[28%] aspect-square` thumb geometry.
 */
export function computeExpandedMediaTrayMaxHeightPx(
  dockInnerWidthPx = EXPANDED_TRAY_REFERENCE_WIDTH_PX,
): number {
  const thumbPx = dockInnerWidthPx * FINALIZE_MEDIA_THUMB_WIDTH_FRACTION;
  return Math.ceil(thumbPx + EXPANDED_TRAY_THUMB_CHROME_PAD_PX);
}

/** Compact expanded tray — one full thumbnail row (no vertical clip). */
export const EXPANDED_MEDIA_TRAY_MAX_HEIGHT = `${computeExpandedMediaTrayMaxHeightPx() / 16}rem`;

export {
  CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS,
  CREATE_FINALIZE_DOCK_CSS_VARS,
  CREATE_FINALIZE_DOCK_STACK_CLASS,
  CREATE_FINALIZE_DOCK_STACK_ORDER,
  CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS,
} from "./createFinalizeMediaDockLayout";
