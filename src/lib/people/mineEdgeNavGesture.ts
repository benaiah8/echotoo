import {
  PEOPLE_MINE_EDGE_CARD_H_CAP_PX,
  PEOPLE_MINE_EDGE_CARD_LAYOUT_W_PX,
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_MIN_PX,
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX,
  PEOPLE_MINE_EDGE_VISIBLE_FLOOR_PX,
  PEOPLE_MINE_EDGE_VISIBLE_MAX_PX,
  PEOPLE_MINE_EDGE_VISIBLE_MIN_PX,
  mineEdgeRotationInwardExtraPx,
  peopleMineEdgeVisibleMinPx,
  peopleMinePreferredEdgeVisiblePx,
  peopleMineTallFactor,
  peoplePlansTargetFrameW,
  peopleMineVisualClearanceMinPx,
  peopleMineVisualClearancePx,
} from "./peopleCandidateMediaPresentation";

/**
 * Mine edge PREVIOUS/NEXT: move past this cancels a pending activate.
 * Raised from 10→18 so ordinary Android finger jitter still counts as a tap.
 */
export const MINE_EDGE_NAV_MOVE_CANCEL_PX = 18;

/** Underlying card layout width (mostly off-screen; unchanged). */
export const MINE_EDGE_CARD_LAYOUT_W_PX = PEOPLE_MINE_EDGE_CARD_LAYOUT_W_PX;

/** Prefer at least this much visible strip when clearance allows (short baseline). */
export const MINE_EDGE_VISIBLE_IDEAL_MIN_PX = PEOPLE_MINE_EDGE_VISIBLE_MIN_PX;

/** Cap visible strip — scales with host up to this. */
export const MINE_EDGE_VISIBLE_MAX_PX = PEOPLE_MINE_EDGE_VISIBLE_MAX_PX;

/**
 * Target visual gap (front-frame AABB ↔ rotated edge AABB) — short baseline.
 * Live clearance uses {@link peopleMineVisualClearancePx}(tallFactor).
 */
export const MINE_EDGE_PORTRAIT_CLEARANCE_PX =
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX;

/**
 * Floor when clearance is tight (narrow phones). Never forced above clearance.
 */
export const MINE_EDGE_VISIBLE_FLOOR_PX = PEOPLE_MINE_EDGE_VISIBLE_FLOOR_PX;

export {
  mineEdgeRotationInwardExtraPx,
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX,
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_MIN_PX,
  peopleMineTallFactor,
  peopleMineVisualClearancePx,
  peopleMineEdgeVisibleMinPx,
};

/** Pure: whether pointer moved past tap tolerance. */
export function mineEdgeNavMovedPastTap(
  origin: { x: number; y: number },
  x: number,
  y: number,
  thresholdPx: number = MINE_EDGE_NAV_MOVE_CANCEL_PX
): boolean {
  const dx = x - origin.x;
  const dy = y - origin.y;
  return Math.hypot(dx, dy) > thresholdPx;
}

/**
 * Side gutter between host edge and Mine *front frame* (host-centered).
 * Pass `actualFrameW` when height has shrunk the portrait below the
 * width-first target so edge exposure can consume surplus gutter.
 * Pass `hostH` so fallbacks stay aligned with metrics (Plans width is
 * fixed-rail; hostH no longer changes Plans target frame W).
 */
export function mineEdgeSideGutterPx(
  hostW: number,
  actualFrameW?: number,
  hostH: number = 0
): number {
  if (!(hostW > 0)) return 0;
  const frameW =
    actualFrameW != null && actualFrameW > 0
      ? actualFrameW
      : peoplePlansTargetFrameW(hostW, hostH);
  return Math.max(0, (hostW - frameW) / 2);
}

/**
 * Predicted visual gap for a CSS strip width (accounts for rest rotation).
 */
export function mineEdgeVisualGapPx(
  hostW: number,
  cssVisiblePx: number,
  actualFrameW?: number,
  cardH: number = PEOPLE_MINE_EDGE_CARD_H_CAP_PX,
  hostH: number = 0
): number {
  const gutter = mineEdgeSideGutterPx(hostW, actualFrameW, hostH);
  return gutter - cssVisiblePx - mineEdgeRotationInwardExtraPx(cardH);
}

/**
 * Visible CSS edge-card strip width (px).
 * Chooses strip so rotated AABB leaves tall-aware clearance to the front frame.
 * `actualFrameW` — painted frame width (height-bound layouts); omit for
 * width-first target planning.
 * `hostH` — carousel host height; required for tallFactor parity with metrics.
 */
export function mineEdgeVisiblePx(
  hostW: number,
  actualFrameW?: number,
  cardH: number = PEOPLE_MINE_EDGE_CARD_H_CAP_PX,
  hostH: number = 0
): number {
  const tall = peopleMineTallFactor(hostW, hostH);
  const clearance = peopleMineVisualClearancePx(tall);
  const clearanceMin = peopleMineVisualClearanceMinPx(tall);
  const edgeMin = peopleMineEdgeVisibleMinPx(tall);
  if (!(hostW > 0)) {
    return Math.max(MINE_EDGE_VISIBLE_FLOOR_PX, edgeMin);
  }
  const rot = mineEdgeRotationInwardExtraPx(cardH);
  const gutter = mineEdgeSideGutterPx(hostW, actualFrameW, hostH);
  const maxByMinGap = Math.floor(gutter - rot - clearanceMin);
  if (maxByMinGap <= 0) return 0;

  const fromGeometry = Math.round(gutter - rot - clearance);
  const preferred = peopleMinePreferredEdgeVisiblePx(hostW, hostH);
  const ideal =
    actualFrameW != null && actualFrameW > 0 ? fromGeometry : preferred;

  return Math.min(
    MINE_EDGE_VISIBLE_MAX_PX,
    maxByMinGap,
    Math.max(MINE_EDGE_VISIBLE_FLOOR_PX, edgeMin, ideal)
  );
}

/** True when host cannot fit a 44px strip without eating min visual clearance. */
export function mineEdgeCannotFitAccessibleTarget(
  hostW: number,
  actualFrameW?: number,
  hostH: number = 0
): boolean {
  const tall = peopleMineTallFactor(hostW, hostH);
  const clearanceMin = peopleMineVisualClearanceMinPx(tall);
  const gutter = mineEdgeSideGutterPx(hostW, actualFrameW, hostH);
  const rot = mineEdgeRotationInwardExtraPx();
  return gutter - rot - clearanceMin < 44;
}

// --- Button flight latch (Overlay) — pure transitions for tests ---

export type MineButtonFlightLatch = {
  flightActive: boolean;
  pendingTarget: number | null;
  /** Destination of the in-flight button step; null when idle. */
  flightDest: number | null;
};

export function createMineButtonFlightLatch(): MineButtonFlightLatch {
  return { flightActive: false, pendingTarget: null, flightDest: null };
}

/**
 * Begin a button step. Sets flightActive only when navigation can proceed to a
 * different index. Caller must invoke prepare + goToIndex after `shouldNavigate`.
 */
export function planMineButtonStep(
  latch: MineButtonFlightLatch,
  destinationIndex: number,
  currentIndex: number,
  length: number,
  canNavigate: boolean
): {
  latch: MineButtonFlightLatch;
  shouldNavigate: boolean;
  clamped: number;
} {
  const clamped = Math.max(0, Math.min(Math.max(0, length - 1), destinationIndex));
  if (!canNavigate || length <= 0) {
    return {
      latch: {
        flightActive: false,
        pendingTarget: latch.pendingTarget,
        flightDest: null,
      },
      shouldNavigate: false,
      clamped,
    };
  }
  if (clamped === currentIndex) {
    return {
      latch: {
        flightActive: false,
        pendingTarget:
          latch.pendingTarget === clamped ? null : latch.pendingTarget,
        flightDest: null,
      },
      shouldNavigate: false,
      clamped,
    };
  }
  return {
    latch: {
      flightActive: true,
      pendingTarget: latch.pendingTarget,
      flightDest: clamped,
    },
    shouldNavigate: true,
    clamped,
  };
}

/** Queue while a flight is active (absolute pending target). */
export function queueMineButtonTarget(
  latch: MineButtonFlightLatch,
  nextPending: number,
  length: number
): MineButtonFlightLatch {
  const clamped = Math.max(0, Math.min(Math.max(0, length - 1), nextPending));
  return { ...latch, pendingTarget: clamped };
}

/**
 * After a successful unlock / settle that ends the active button flight.
 * Returns the next single step to start, or null.
 */
export function flushMineButtonLatch(
  latch: MineButtonFlightLatch,
  currentIndex: number,
  length: number
): { latch: MineButtonFlightLatch; nextStep: number | null } {
  const pending = latch.pendingTarget;
  const cleared: MineButtonFlightLatch = {
    flightActive: false,
    pendingTarget: null,
    flightDest: null,
  };
  if (pending == null || length <= 0) {
    return { latch: cleared, nextStep: null };
  }
  const clampedPending = Math.max(0, Math.min(length - 1, pending));
  if (clampedPending === currentIndex) {
    return { latch: cleared, nextStep: null };
  }
  const step = clampedPending > currentIndex ? currentIndex + 1 : currentIndex - 1;
  if (clampedPending !== step) {
    return {
      latch: {
        flightActive: false,
        pendingTarget: clampedPending,
        flightDest: null,
      },
      nextStep: step,
    };
  }
  return { latch: cleared, nextStep: step };
}

/**
 * Mine edge PREVIOUS/NEXT hops always use Embla scrollTo(i, true).
 * Finger-drag paths never call this — they keep duration-15 / force physics.
 */
export function mineButtonStepShouldJump(): boolean {
  return true;
}

/**
 * Authoritative index diverged from the in-flight button destination
 * (e.g. finger drag committed elsewhere). Release active latch; keep pending.
 */
export function releaseMineButtonLatchOnIndexDiverge(
  latch: MineButtonFlightLatch,
  currentIndex: number
): MineButtonFlightLatch {
  if (!latch.flightActive || latch.flightDest == null) return latch;
  if (currentIndex === latch.flightDest) return latch;
  return {
    flightActive: false,
    pendingTarget: latch.pendingTarget,
    flightDest: null,
  };
}
