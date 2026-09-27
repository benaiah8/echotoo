import type { CSSProperties } from "react";

export type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type AppBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
};

const HOLE_PAD_PX = 8;
const TOOLTIP_GAP_PX = 12;
const TOOLTIP_MAX_WIDTH_PX = 320;
/** Space reserved below the glass card for compact progress capsule. */
export const TOUR_PROGRESS_BELOW_PX = 44;
/** Rough min height for tooltip body when judging place-below vs place-above. */
const TOOLTIP_MIN_BODY_PX = 120;
/** Minimum inset from usable top for spotlight outlines. */
export const SPOTLIGHT_TOP_INSET_PX = 10;
/** Minimum inset from usable edges (left/right/bottom). */
export const SPOTLIGHT_EDGE_INSET_PX = 8;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Prefer the desktop phone frame when present; otherwise the visual viewport.
 */
export function readTourCenterBounds(): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const b = readUsableAppBounds();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

/**
 * Usable app viewport for spotlight/tooltip clamping.
 * Prefer desktop phone frame; otherwise window + safe-area top.
 */
export function readUsableAppBounds(): AppBounds {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      left: 0,
      top: 0,
      width: 390,
      height: 800,
      bottom: 800,
      right: 390,
    };
  }

  const frame =
    (document.querySelector(".desktop-phone-frame") as HTMLElement | null) ??
    (document.querySelector(".desktop-phone-inner") as HTMLElement | null);
  if (frame) {
    const r = frame.getBoundingClientRect();
    if (r.width >= 200 && r.height >= 200) {
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        right: r.right,
      };
    }
  }

  let safeTop = 0;
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--safe-area-top-layout")
      .trim();
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) safeTop = parsed;
  } catch {
    /* ignore */
  }

  const top = Math.max(0, safeTop);
  return {
    left: 0,
    top,
    width: window.innerWidth,
    height: window.innerHeight - top,
    bottom: window.innerHeight,
    right: window.innerWidth,
  };
}

/**
 * Clamp a target rect (before hole padding) so the padded spotlight stays
 * inside the usable app frame with a small inset from the top edge.
 */
export function clampSpotlightTargetRect(
  rect: SpotlightRect,
  holePadPx = HOLE_PAD_PX
): SpotlightRect {
  const bounds = readUsableAppBounds();
  const minTop = bounds.top + SPOTLIGHT_TOP_INSET_PX + holePadPx;
  const minLeft = bounds.left + SPOTLIGHT_EDGE_INSET_PX + holePadPx;
  const maxRight = bounds.right - SPOTLIGHT_EDGE_INSET_PX - holePadPx;
  const maxBottom = bounds.bottom - SPOTLIGHT_EDGE_INSET_PX - holePadPx;

  let top = rect.top;
  let left = rect.left;
  let width = rect.width;
  let height = rect.height;

  if (top < minTop) {
    const shift = minTop - top;
    top = minTop;
    height = Math.max(8, height - shift);
  }

  if (left < minLeft) {
    const shift = minLeft - left;
    left = minLeft;
    width = Math.max(8, width - shift);
  }

  if (left + width > maxRight) {
    width = Math.max(8, maxRight - left);
  }

  if (top + height > maxBottom) {
    height = Math.max(8, maxBottom - top);
  }

  return { top, left, width, height };
}

/**
 * Clamp an already-padded hole rect into usable bounds (final paint safety).
 */
export function clampHoleRect(hole: SpotlightRect): SpotlightRect {
  const bounds = readUsableAppBounds();
  const minTop = bounds.top + SPOTLIGHT_TOP_INSET_PX;
  const minLeft = bounds.left + SPOTLIGHT_EDGE_INSET_PX;
  const maxRight = bounds.right - SPOTLIGHT_EDGE_INSET_PX;
  const maxBottom = bounds.bottom - SPOTLIGHT_EDGE_INSET_PX;

  const top = Math.max(minTop, hole.top);
  const left = Math.max(minLeft, hole.left);
  let width = hole.width;
  let height = hole.height;

  if (left + width > maxRight) width = Math.max(8, maxRight - left);
  if (top + height > maxBottom) height = Math.max(8, maxBottom - top);

  return { top, left, width, height };
}

/**
 * Positions the tooltip+progress stack relative to the spotlight hole.
 * Progress sits OUTSIDE the glass card, immediately below it — reserve
 * TOUR_PROGRESS_BELOW_PX so the row stays on-screen and clear of BottomTab.
 *
 * Near-top targets: prefer placing the stack BELOW the spotlight so the
 * tooltip + progress never paint under the status / safe area.
 */
export function computeTooltipStyle(rect: SpotlightRect | null): CSSProperties {
  const bounds = readUsableAppBounds();
  const vw = bounds.width;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const safeBottom = Math.max(88, vh - bounds.bottom + 72);
  const usableTop = bounds.top + SPOTLIGHT_TOP_INSET_PX;

  if (!rect) {
    const width = Math.min(
      TOOLTIP_MAX_WIDTH_PX,
      Math.max(200, bounds.width - 32)
    );
    return {
      position: "fixed",
      left: bounds.left + bounds.width / 2,
      top: bounds.top + bounds.height / 2,
      transform: "translate(-50%, -50%)",
      width,
      maxWidth: `min(${TOOLTIP_MAX_WIDTH_PX}px, calc(100vw - 2rem))`,
    };
  }

  const width = Math.min(TOOLTIP_MAX_WIDTH_PX, vw - 32);
  const holeBottom = rect.top + rect.height + HOLE_PAD_PX;
  const holeTop = rect.top - HOLE_PAD_PX;
  const spaceBelow = vh - holeBottom - safeBottom;
  const stackNeed = TOOLTIP_MIN_BODY_PX + TOUR_PROGRESS_BELOW_PX;
  // Prefer below when near the top of the usable app (Step 2 chrome).
  const nearTop = holeTop < usableTop + 72;
  const placeBelow = nearTop || spaceBelow >= stackNeed;

  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    bounds.left + 16,
    Math.max(bounds.left + 16, bounds.right - width - 16)
  );

  if (placeBelow) {
    const maxTop =
      vh - safeBottom - TOUR_PROGRESS_BELOW_PX - TOOLTIP_MIN_BODY_PX;
    const top = clamp(
      holeBottom + TOOLTIP_GAP_PX,
      usableTop + 8,
      Math.max(usableTop + 8, maxTop)
    );
    return {
      position: "fixed",
      left,
      top,
      width,
      maxWidth: `calc(100vw - 2rem)`,
    };
  }

  // Anchor stack from bottom so [tooltip][progress] sits above the hole.
  const bottom = Math.max(safeBottom, vh - holeTop + TOOLTIP_GAP_PX);
  return {
    position: "fixed",
    left,
    bottom,
    width,
    maxWidth: `calc(100vw - 2rem)`,
  };
}
