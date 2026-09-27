/**
 * DEV diagnostic: normalized adjacent drag progress for Mine motion probe / proxy.
 * Uses Embla public APIs only — scrollProgress + scrollSnapList are both 0..1.
 */

import { mineEdgeVisiblePx } from "./mineEdgeNavGesture";
import { PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG as PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG_TOKEN } from "./peopleCandidateMediaPresentation";

export type MineMotionProbeProgress = {
  prev: number;
  next: number;
};

export type MineMotionProbeMode = "box" | "proxy";

/**
 * Shared mutable handle for DEV Mine motion visuals.
 * Overlay owns media/URL/ready updates (off hot path).
 * Carousel writes transform only during Embla `scroll`.
 */
export type MineMotionProbeController = {
  mode: MineMotionProbeMode;
  root: HTMLElement | null;
  /** Proxy front image (box mode leaves null). */
  img: HTMLImageElement | null;
  prevUrl: string | null;
  nextUrl: string | null;
  prevReady: boolean;
  nextReady: boolean;
  /** Target Mine front frame size at scale 1 (proxy mode). */
  frameW: number;
  frameH: number;
  /**
   * When true, adjacent URLs are frozen for the active navigation flight.
   * Live index changes must not overwrite them.
   */
  flightLocked: boolean;
  /** Embla snap where the active flight started (progress anchor identity). */
  flightDepartureIndex: number | null;
  /**
   * Claimed landing snap for the active flight.
   * `MINE_MOTION_PROBE_FLIGHT_DEST_OPEN` = swipe in progress (ignore settle).
   * `null` when unlocked.
   */
  flightDestinationIndex: number | null;
  /** Increments on every new (non-duplicate) flight begin. */
  flightEpoch: number;
  /** Bumped on live adjacent resync; stale Image callbacks must match. */
  mediaGeneration: number;
  /**
   * Overlay-assigned: refresh live adjacents for an authoritative carousel index.
   * Prefer Embla selectedScrollSnap at settle / departure — not a stale React index.
   * When omitted, Overlay falls back to its latest rendered index.
   */
  resyncAdjacent: ((authoritativeIndex?: number) => void) | null;
  /**
   * Overlay-assigned: after a successful settle unlock (button serialization flush).
   */
  onFlightSettled: (() => void) | null;
  /**
   * Edge-card engagement for the active flight only.
   * `true` = finger drag (approved grow/tilt). `false` = button/programmatic (rest).
   * Cleared on unlock.
   */
  flightAnimateEdgeCards: boolean;
};

/**
 * Swipe flight destination until pointerUp/select claims the landing snap.
 * Settle must not unlock while destination is open.
 */
export const MINE_MOTION_PROBE_FLIGHT_DEST_OPEN = -1;

export type BeginMineMotionProbeFlightResult = "begun" | "duplicate";

export type BeginMineMotionProbeFlightOpts = {
  departureIndex: number;
  /**
   * Button: concrete landing index.
   * Swipe start: `MINE_MOTION_PROBE_FLIGHT_DEST_OPEN`.
   */
  destinationIndex: number;
  /**
   * When set, updates `flightAnimateEdgeCards` for this flight.
   * Omit on duplicate-safe scrollTo begins so prepare/lock source wins.
   */
  animateEdgeCards?: boolean;
};

export const MINE_INCOMING_PROXY_START_SCALE = 0.5;
/** Absolute start tilt (deg). NEXT = +this, PREV = −this → 0 at center. */
export const MINE_INCOMING_PROXY_START_ROTATE_DEG = 5;

export function mineIncomingProxyScale(progress: number): number {
  const p =
    !Number.isFinite(progress) || progress <= 0
      ? 0
      : progress >= 1
        ? 1
        : progress;
  return (
    MINE_INCOMING_PROXY_START_SCALE +
    p * (1 - MINE_INCOMING_PROXY_START_SCALE)
  );
}

/** Linear tilt: NEXT +5→0, PREV −5→0. */
export function mineIncomingProxyRotateDeg(
  progress: number,
  side: "prev" | "next"
): number {
  const p =
    !Number.isFinite(progress) || progress <= 0
      ? 0
      : progress >= 1
        ? 1
        : progress;
  const mag = MINE_INCOMING_PROXY_START_ROTATE_DEG * (1 - p);
  if (mag === 0) return 0;
  return side === "next" ? mag : -mag;
}

/**
 * DEV real-incoming: portrait-only nav wrapper (translate + scale + tilt).
 * Outer `[data-people-mine-nav-motion]` must stay identity (caption/note upright).
 */
export const MINE_NAV_PORTRAIT_SELECTOR =
  '[data-people-mine-nav-portrait="true"]';
/** @deprecated Outer wrapper is no longer transformed; kept for cleanup. */
export const MINE_NAV_MOTION_SELECTOR = '[data-people-mine-nav-motion="true"]';

/** Match MineEdgeNavCards resting tilt (deg). */
export const MINE_EDGE_CARD_REST_ROTATE_DEG =
  PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG_TOKEN;
/**
 * Portrait navigation tilt magnitude (deg).
 * Incoming start / outgoing end; independent of edge-card rest.
 */
export const MINE_PORTRAIT_NAV_ROTATE_DEG = 7;
/** @deprecated Prefer MINE_PORTRAIT_NAV_ROTATE_DEG. */
export const MINE_INCOMING_PORTRAIT_START_ROTATE_DEG =
  MINE_PORTRAIT_NAV_ROTATE_DEG;
/** Opposite-direction peak tilt during edge-card engagement (deg). */
export const MINE_EDGE_CARD_OPPOSITE_TILT_DEG = 4;
export const MINE_EDGE_CARD_MAX_SCALE = 1.28;
export const MINE_EDGE_CARD_MAX_INWARD_PX = 12;
/** Visible fringe of parked portrait under the edge strip (px). */
export const MINE_INCOMING_PORTRAIT_PEEK_PX = 12;

/**
 * Horizontal half-extent of a scaled+rotated axis-aligned portrait frame.
 */
export function mineIncomingPortraitAabbHalfWidth(args: {
  frameW: number;
  frameH: number;
  scale: number;
  rotateDeg: number;
}): number {
  const w = Math.max(0, args.frameW) * Math.max(0, args.scale);
  const h = Math.max(0, args.frameH) * Math.max(0, args.scale);
  if (!(w > 0) || !(h > 0)) return 0;
  const rad = (Math.abs(args.rotateDeg) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return (w / 2) * c + (h / 2) * s;
}

/**
 * Viewport X of the parked incoming portrait center (mostly off-screen).
 * NEXT: beyond right edge; PREVIOUS: beyond left edge.
 */
export function mineIncomingPortraitParkedCenterX(args: {
  side: "prev" | "next";
  slideW: number;
  frameW: number;
  frameH: number;
  peekPx?: number;
}): number {
  const peek =
    typeof args.peekPx === "number" && Number.isFinite(args.peekPx)
      ? Math.max(0, args.peekPx)
      : MINE_INCOMING_PORTRAIT_PEEK_PX;
  const scale0 = MINE_INCOMING_PROXY_START_SCALE;
  const rot0 =
    args.side === "next"
      ? MINE_PORTRAIT_NAV_ROTATE_DEG
      : -MINE_PORTRAIT_NAV_ROTATE_DEG;
  const half = mineIncomingPortraitAabbHalfWidth({
    frameW: args.frameW,
    frameH: args.frameH,
    scale: scale0,
    rotateDeg: rot0,
  });
  if (!(args.slideW > 0) || !(half > 0)) {
    return args.side === "next" ? args.slideW : 0;
  }
  // NEXT: center just past the right boundary so only `peek` of the left fringe shows.
  if (args.side === "next") {
    return args.slideW + half - peek;
  }
  // PREVIOUS: center just past the left boundary.
  return -half + peek;
}

/**
 * Extra slide-local X so Embla track + wrapper = desired edge-peek → center path.
 *
 * natural(p) ≈ slideOrigin*(1-p) + portraitCenterLocalX
 * desired(p) = parkedCenterX*(1-p) + portraitCenterLocalX*p
 * extra = desired − natural
 *
 * NEXT slideOrigin = +slideW; PREVIOUS slideOrigin = −slideW.
 */
export function mineIncomingRealSlideExtraTranslateX(args: {
  side: "prev" | "next";
  progress: number;
  slideW: number;
  portraitCenterLocalX: number;
  /** @deprecated Ignored — parked peek geometry replaces edge-center targeting. */
  edgeCenterX?: number;
  frameW: number;
  frameH: number;
  peekPx?: number;
}): number {
  const p = clamp01(args.progress);
  if (!(args.slideW > 0) || p >= 1) return 0;
  const slideOrigin = args.side === "next" ? args.slideW : -args.slideW;
  const parkedCenterX = mineIncomingPortraitParkedCenterX({
    side: args.side,
    slideW: args.slideW,
    frameW: args.frameW,
    frameH: args.frameH,
    peekPx: args.peekPx,
  });
  return (1 - p) * (parkedCenterX - slideOrigin - args.portraitCenterLocalX);
}

/** Portrait tilt: NEXT +7→0, PREV −7→0. */
export function mineIncomingPortraitRotateDeg(
  progress: number,
  side: "prev" | "next"
): number {
  const p = clamp01(progress);
  const mag = MINE_PORTRAIT_NAV_ROTATE_DEG * (1 - p);
  if (mag === 0) return 0;
  return side === "next" ? mag : -mag;
}

/**
 * Outgoing parks into the opposite edge from the incoming emergence.
 * NEXT → left park (= incoming PREV park); PREV → right park (= incoming NEXT).
 */
export function mineOutgoingPortraitParkedCenterX(args: {
  side: "prev" | "next";
  slideW: number;
  frameW: number;
  frameH: number;
  peekPx?: number;
}): number {
  return mineIncomingPortraitParkedCenterX({
    ...args,
    side: args.side === "next" ? "prev" : "next",
  });
}

/**
 * Extra slide-local X for the DEPARTURE portrait.
 *
 * natural(p) ≈ portraitCenterLocalX + departureDelta
 *   NEXT: departureDelta = −slideW·p
 *   PREV: departureDelta = +slideW·p
 * desired(p) = portraitCenterLocalX·(1−p) + parkedCenterX·p
 * extra = desired − natural
 *
 * At p=0 extra is 0 (normal center). At p=1 extra is generally non-zero
 * (combined Embla + transform places the portrait at the parked edge).
 */
export function mineOutgoingRealSlideExtraTranslateX(args: {
  side: "prev" | "next";
  progress: number;
  slideW: number;
  portraitCenterLocalX: number;
  frameW: number;
  frameH: number;
  peekPx?: number;
}): number {
  const p = clamp01(args.progress);
  if (!(args.slideW > 0) || p <= 0) return 0;
  const parkedCenterX = mineOutgoingPortraitParkedCenterX({
    side: args.side,
    slideW: args.slideW,
    frameW: args.frameW,
    frameH: args.frameH,
    peekPx: args.peekPx,
  });
  // NEXT: p * (parkedLeft - center + slideW)
  // PREV: p * (parkedRight - center - slideW)
  if (args.side === "next") {
    return p * (parkedCenterX - args.portraitCenterLocalX + args.slideW);
  }
  return p * (parkedCenterX - args.portraitCenterLocalX - args.slideW);
}

/** Outgoing scale: 1 → 0.50 (inverse of incoming). */
export function mineOutgoingPortraitScale(progress: number): number {
  const p = clamp01(progress);
  return 1 - p * (1 - MINE_INCOMING_PROXY_START_SCALE);
}

/** Outgoing tilt: NEXT 0→−7, PREV 0→+7. */
export function mineOutgoingPortraitRotateDeg(
  progress: number,
  side: "prev" | "next"
): number {
  const p = clamp01(progress);
  const mag = MINE_PORTRAIT_NAV_ROTATE_DEG * p;
  if (mag === 0) return 0;
  return side === "next" ? -mag : mag;
}

/**
 * Edge-card engagement 0→1→0, peak near progress 0.6.
 * Drives subtle scale / inward shift / tilt; rest at 0 and 1.
 */
export function mineEdgeCardEngagement(progress: number): number {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return 0;
  const peak = 0.6;
  if (p < peak) return p / peak;
  return (1 - p) / (1 - peak);
}

export function mineEdgeCardRestTransform(side: "prev" | "next"): string {
  const rot =
    side === "next"
      ? MINE_EDGE_CARD_REST_ROTATE_DEG
      : -MINE_EDGE_CARD_REST_ROTATE_DEG;
  return `translateY(-50%) rotate(${rot}deg)`;
}

/**
 * Edge-card engagement from the same progress (no separate timeline).
 * Resting CSS baseline is translateY(-50%) rotate(±5deg).
 * Scale expands toward center via outer-edge transform-origin.
 */
export function mineEdgeCardMotionTransform(
  side: "prev" | "next",
  progress: number
): string {
  const eng = mineEdgeCardEngagement(progress);
  if (eng <= 0) return mineEdgeCardRestTransform(side);
  const restRot =
    side === "next"
      ? MINE_EDGE_CARD_REST_ROTATE_DEG
      : -MINE_EDGE_CARD_REST_ROTATE_DEG;
  const opposite =
    side === "next"
      ? -MINE_EDGE_CARD_OPPOSITE_TILT_DEG
      : MINE_EDGE_CARD_OPPOSITE_TILT_DEG;
  const rot = restRot * (1 - eng) + opposite * eng;
  const scale = 1 + (MINE_EDGE_CARD_MAX_SCALE - 1) * eng;
  // Inward: NEXT moves left (−x), PREV moves right (+x).
  const inward =
    (side === "next" ? -1 : 1) * MINE_EDGE_CARD_MAX_INWARD_PX * eng;
  return `translateY(-50%) translateX(${inward}px) rotate(${rot}deg) scale(${scale})`;
}

export function mineEdgeCardTransformOrigin(side: "prev" | "next"): string {
  return side === "prev" ? "left center" : "right center";
}

function clearPortraitNavEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.style.transform = "";
  el.style.transformOrigin = "";
  el.style.willChange = "";
}

function clearOuterNavEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  // Ensure rejected outer motion cannot linger.
  el.style.transform = "";
  el.style.transformOrigin = "";
  el.style.willChange = "";
}

export function clearMineIncomingRealSlideVisual(
  slides: readonly HTMLElement[]
): void {
  for (const slide of slides) {
    clearPortraitNavEl(
      slide.querySelector<HTMLElement>(MINE_NAV_PORTRAIT_SELECTOR)
    );
    clearOuterNavEl(
      slide.querySelector<HTMLElement>(MINE_NAV_MOTION_SELECTOR)
    );
  }
}

export function clearMineEdgeCardNavVisual(
  cards: { prev?: HTMLElement | null; next?: HTMLElement | null } | null
): void {
  if (!cards) return;
  for (const side of ["prev", "next"] as const) {
    const el = cards[side];
    if (!el) continue;
    el.style.transformOrigin = mineEdgeCardTransformOrigin(side);
    el.style.transform = mineEdgeCardRestTransform(side);
    el.style.transition = "";
  }
}

function writePortraitNavTransform(
  el: HTMLElement,
  extraX: number,
  scale: number,
  rotateDeg: number
): void {
  el.style.transformOrigin = "center center";
  el.style.willChange = "transform";
  el.style.transform = `translate3d(${extraX}px, 0, 0) rotate(${rotateDeg}deg) scale(${scale})`;
}

export type MineIncomingRealSlideWriteArgs = {
  slides: readonly HTMLElement[];
  progress: MineMotionProbeProgress;
  departureIndex: number;
  slideW: number;
  portraitCenterLocalX: number;
  frameW: number;
  frameH: number;
  /** Optional cached portrait nodes keyed by slide index. */
  portraitEls?: readonly (HTMLElement | null | undefined)[];
  edgeCards?: { prev?: HTMLElement | null; next?: HTMLElement | null } | null;
  /**
   * When false, edge cards stay at resting transforms (button/programmatic).
   * When true, apply drag engagement. Default true for backward-compatible tests.
   */
  animateEdgeCards?: boolean;
  /**
   * When progress is idle, still write the parked pose for this side
   * (flight begin / programmatic prepare).
   */
  forceSide?: "prev" | "next" | null;
};

/**
 * Incoming + outgoing portrait writes for Embla `scroll` (no rAF, no React).
 * Clears other slides' nav transforms every call.
 * Caption/note outer wrappers stay identity.
 */
export function writeMineIncomingRealSlideVisual(
  args: MineIncomingRealSlideWriteArgs
): void {
  const {
    slides,
    progress,
    departureIndex,
    slideW,
    portraitCenterLocalX,
    frameW,
    frameH,
    portraitEls,
    edgeCards,
    animateEdgeCards = true,
    forceSide = null,
  } = args;

  clearMineIncomingRealSlideVisual(slides);
  if (edgeCards) {
    clearMineEdgeCardNavVisual(edgeCards);
  }

  const engaged =
    progress.next > 0
      ? "next"
      : progress.prev > 0
        ? "prev"
        : forceSide;
  if (!engaged || !(slideW > 0)) return;
  if (!(frameW > 0) || !(frameH > 0)) return;

  const p =
    forceSide && progress.next <= 0 && progress.prev <= 0
      ? 0
      : engaged === "next"
        ? progress.next
        : progress.prev;

  const resolvePortrait = (index: number): HTMLElement | null =>
    portraitEls?.[index] ??
    slides[index]?.querySelector<HTMLElement>(MINE_NAV_PORTRAIT_SELECTOR) ??
    null;

  const clearOuterAt = (index: number) => {
    clearOuterNavEl(
      slides[index]?.querySelector<HTMLElement>(MINE_NAV_MOTION_SELECTOR)
    );
  };

  // --- Incoming (adjacent) ---
  const incomingIndex =
    engaged === "next" ? departureIndex + 1 : departureIndex - 1;
  if (incomingIndex >= 0 && incomingIndex < slides.length) {
    const el = resolvePortrait(incomingIndex);
    if (el) {
      clearOuterAt(incomingIndex);
      const extraX = mineIncomingRealSlideExtraTranslateX({
        side: engaged,
        progress: p,
        slideW,
        portraitCenterLocalX,
        frameW,
        frameH,
      });
      writePortraitNavTransform(
        el,
        extraX,
        mineIncomingProxyScale(p),
        mineIncomingPortraitRotateDeg(p, engaged)
      );
    }
  }

  // --- Outgoing (frozen departure). At p=0 leave cleared = normal center. ---
  if (
    p > 0 &&
    departureIndex >= 0 &&
    departureIndex < slides.length
  ) {
    const outEl = resolvePortrait(departureIndex);
    if (outEl) {
      clearOuterAt(departureIndex);
      writePortraitNavTransform(
        outEl,
        mineOutgoingRealSlideExtraTranslateX({
          side: engaged,
          progress: p,
          slideW,
          portraitCenterLocalX,
          frameW,
          frameH,
        }),
        mineOutgoingPortraitScale(p),
        mineOutgoingPortraitRotateDeg(p, engaged)
      );
    }
  }

  // Drag only: both edge cards share the engagement curve.
  // Programmatic/button flights keep resting transforms (already cleared above).
  if (animateEdgeCards && edgeCards) {
    for (const side of ["prev", "next"] as const) {
      const card = edgeCards[side];
      if (!card) continue;
      card.style.transition = "none";
      card.style.transformOrigin = mineEdgeCardTransformOrigin(side);
      card.style.transform = mineEdgeCardMotionTransform(side, p);
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Snap-relative prev/next progress from normalized Embla progress values.
 * `anchorIndex` is frozen at pointerDown / pre-scrollTo.
 *
 * Embla 8.x: scrollProgress and scrollSnapList increase toward higher indices.
 */
export function computeMineMotionProbeProgress(
  scrollProgress: number,
  scrollSnapList: readonly number[],
  anchorIndex: number
): MineMotionProbeProgress {
  if (scrollSnapList.length === 0) return { prev: 0, next: 0 };
  if (!Number.isFinite(scrollProgress)) return { prev: 0, next: 0 };

  const anchor = Math.max(
    0,
    Math.min(scrollSnapList.length - 1, Math.floor(anchorIndex))
  );
  const anchorProgress = scrollSnapList[anchor];
  if (anchorProgress === undefined || !Number.isFinite(anchorProgress)) {
    return { prev: 0, next: 0 };
  }

  let prev = 0;
  let next = 0;

  if (anchor > 0) {
    const prevSnap = scrollSnapList[anchor - 1];
    if (prevSnap !== undefined) {
      const prevStep = anchorProgress - prevSnap;
      if (prevStep > 0) {
        prev = clamp01((anchorProgress - scrollProgress) / prevStep);
      }
    }
  }

  if (anchor < scrollSnapList.length - 1) {
    const nextSnap = scrollSnapList[anchor + 1];
    if (nextSnap !== undefined) {
      const nextStep = nextSnap - anchorProgress;
      if (nextStep > 0) {
        next = clamp01((scrollProgress - anchorProgress) / nextStep);
      }
    }
  }

  if (prev > 0 && next > 0) {
    if (prev >= next) next = 0;
    else prev = 0;
  }

  return { prev, next };
}

/** Visible strip used by Mine edge cards — for probe start anchors only. */
export function mineMotionProbeVisiblePx(shellW: number): number {
  // Keep probe start X aligned with the clearance-aware edge-card strip.
  return mineEdgeVisiblePx(shellW);
}

export const MINE_MOTION_PROBE_DOT_INSET_PX = 9;

/** Diagnostic box size (plain probe mode). */
export const MINE_MOTION_PROBE_BOX_W_PX = 40;

/**
 * Edge-card / proxy vertical center. Prefer measured `--mine-edge-center-y`
 * (front portrait center, set on resize). Fallback matches legacy 49.5%.
 */
export const MINE_INCOMING_PROXY_CSS_TOP_RATIO = 0.495;
export const MINE_INCOMING_PROXY_CSS_TOP =
  "var(--mine-edge-center-y, 49.5%)";

export const MINE_MOTION_PROBE_FRONT_CARD_SELECTOR =
  '[data-people-mine-card="front"]';
export const MINE_MOTION_PROBE_PHOTO_FRAME_SELECTOR =
  '[data-people-duo-photo-frame="true"]';

export type MineMotionProbeGeometry = {
  shellW: number;
  /** Destination visual-center X in the proxy positioning container. */
  centerX: number;
  /** Destination visual-center Y in the proxy positioning container. */
  centerY: number;
  /** p=0 visual-center Y (CSS top ratio × container height). */
  startCenterY: number;
  prevStartX: number;
  nextStartX: number;
  /** Measured front-photo width at scale 1; 0 = use controller token size. */
  frameW: number;
  frameH: number;
};

export type MineMotionProbeLanding = {
  centerX: number;
  centerY: number;
  startCenterY: number;
  frameW: number;
  frameH: number;
};

export type MineMotionProbeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Convert viewport rects into proxy-container landing geometry.
 *
 * Slide-local frame center is applied at the carousel host origin so the
 * destination is the *resting* centered portrait, not a mid-scroll slide.
 */
export function mineMotionProbeLandingFromRects(
  container: MineMotionProbeRect,
  host: MineMotionProbeRect,
  slide: MineMotionProbeRect,
  frame: MineMotionProbeRect
): MineMotionProbeLanding | null {
  if (
    !(container.width > 0) ||
    !(container.height > 0) ||
    !(host.width > 0) ||
    !(host.height > 0) ||
    !(slide.width > 0) ||
    !(slide.height > 0) ||
    !(frame.width > 0) ||
    !(frame.height > 0)
  ) {
    return null;
  }
  const localX = frame.left + frame.width / 2 - slide.left;
  const localY = frame.top + frame.height / 2 - slide.top;
  const centerX = host.left - container.left + localX;
  const centerY = host.top - container.top + localY;
  return {
    centerX,
    centerY,
    // Edge cards align to the resting front portrait — start Y matches dest Y.
    startCenterY: centerY,
    frameW: frame.width,
    frameH: frame.height,
  };
}

export function queryMineMotionProbeFrontFrame(
  slide: HTMLElement
): HTMLElement | null {
  const front =
    slide.querySelector<HTMLElement>(MINE_MOTION_PROBE_FRONT_CARD_SELECTOR) ??
    slide.querySelector<HTMLElement>(MINE_MOTION_PROBE_PHOTO_FRAME_SELECTOR);
  return front;
}

export function measureMineMotionProbeLanding(args: {
  container: HTMLElement;
  host: HTMLElement;
  slide: HTMLElement;
  frame: HTMLElement;
}): MineMotionProbeLanding | null {
  return mineMotionProbeLandingFromRects(
    args.container.getBoundingClientRect(),
    args.host.getBoundingClientRect(),
    args.slide.getBoundingClientRect(),
    args.frame.getBoundingClientRect()
  );
}

export function computeMineMotionProbeGeometry(
  shellW: number,
  landing?: MineMotionProbeLanding | null
): MineMotionProbeGeometry {
  const w = Math.max(0, shellW);
  const visible = mineMotionProbeVisiblePx(w);
  const inset = MINE_MOTION_PROBE_DOT_INSET_PX;
  return {
    shellW: w,
    centerX: landing && landing.frameW > 0 ? landing.centerX : w / 2,
    centerY: landing?.centerY ?? 0,
    startCenterY: landing?.startCenterY ?? 0,
    prevStartX: visible - inset,
    nextStartX: w - visible + inset,
    frameW: landing?.frameW ?? 0,
    frameH: landing?.frameH ?? 0,
  };
}

export function createMineMotionProbeController(
  mode: MineMotionProbeMode
): MineMotionProbeController {
  return {
    mode,
    root: null,
    img: null,
    prevUrl: null,
    nextUrl: null,
    prevReady: false,
    nextReady: false,
    frameW: 0,
    frameH: 0,
    flightLocked: false,
    flightDepartureIndex: null,
    flightDestinationIndex: null,
    flightEpoch: 0,
    mediaGeneration: 0,
    resyncAdjacent: null,
    onFlightSettled: null,
    flightAnimateEdgeCards: false,
  };
}

/**
 * Start or idempotently continue a proxy flight.
 *
 * Duplicate (same departure + destination while locked): no media thrash.
 * New navigation (different departure/destination, or unlocked): rebind
 * adjacent media from `departureIndex` so anchor and URLs stay coherent.
 */
export function beginMineMotionProbeFlight(
  ctrl: MineMotionProbeController | null | undefined,
  opts: BeginMineMotionProbeFlightOpts
): BeginMineMotionProbeFlightResult {
  if (!ctrl || ctrl.mode !== "proxy") return "duplicate";
  const departureIndex = Math.floor(opts.departureIndex);
  const destinationIndex = Math.floor(opts.destinationIndex);
  if (!Number.isFinite(departureIndex) || !Number.isFinite(destinationIndex)) {
    return "duplicate";
  }

  if (
    ctrl.flightLocked &&
    ctrl.flightDepartureIndex === departureIndex &&
    ctrl.flightDestinationIndex === destinationIndex
  ) {
    // Keep source flag fresh on idempotent prepare/lock (queued button steps).
    if (typeof opts.animateEdgeCards === "boolean") {
      ctrl.flightAnimateEdgeCards = opts.animateEdgeCards;
    }
    return "duplicate";
  }

  ctrl.flightEpoch += 1;
  ctrl.flightDepartureIndex = departureIndex;
  ctrl.flightDestinationIndex = destinationIndex;
  if (typeof opts.animateEdgeCards === "boolean") {
    ctrl.flightAnimateEdgeCards = opts.animateEdgeCards;
  }
  // Allow resync to write departure neighbors for this flight.
  ctrl.flightLocked = false;
  ctrl.resyncAdjacent?.(departureIndex);
  ctrl.flightLocked = true;
  return "begun";
}

/**
 * Freeze adjacent URLs for a swipe flight (open destination until claim).
 * New departure while locked rebinds media — never keeps old URLs with a new anchor.
 */
export function lockMineMotionProbeFlight(
  ctrl: MineMotionProbeController | null | undefined,
  departureIndex?: number
): BeginMineMotionProbeFlightResult {
  if (!ctrl || ctrl.mode !== "proxy") return "duplicate";
  const departure =
    typeof departureIndex === "number" && Number.isFinite(departureIndex)
      ? Math.floor(departureIndex)
      : ctrl.flightDepartureIndex ?? 0;
  return beginMineMotionProbeFlight(ctrl, {
    departureIndex: departure,
    destinationIndex: MINE_MOTION_PROBE_FLIGHT_DEST_OPEN,
    animateEdgeCards: true,
  });
}

/**
 * Button PREVIOUS/NEXT: begin flight with known destination before React index updates.
 * Duplicate prepare (same departure+destination) is idempotent for scrollTo effect.
 * Edge cards stay at rest for programmatic flights.
 */
export function prepareMineMotionProbeProgrammaticFlight(
  ctrl: MineMotionProbeController | null | undefined,
  departureIndex: number,
  destinationIndex: number
): BeginMineMotionProbeFlightResult {
  return beginMineMotionProbeFlight(ctrl, {
    departureIndex,
    destinationIndex,
    animateEdgeCards: false,
  });
}

/**
 * Claim the landing snap for an open swipe flight (pointerUp / select).
 */
export function claimMineMotionProbeFlightDestination(
  ctrl: MineMotionProbeController | null | undefined,
  destinationIndex: number
): void {
  if (!ctrl || ctrl.mode !== "proxy" || !ctrl.flightLocked) return;
  if (ctrl.flightDestinationIndex !== MINE_MOTION_PROBE_FLIGHT_DEST_OPEN) {
    return;
  }
  if (!Number.isFinite(destinationIndex)) return;
  ctrl.flightDestinationIndex = Math.floor(destinationIndex);
}

/**
 * End flight lock when settle matches the active flight destination.
 *
 * - Open swipe destination: ignore (stale settle must not clear a newer drag).
 * - Claimed destination: unlock only if `settledIndex` matches.
 * - Omit `settledIndex` / pass with force via `force: true` for cleanup/reInit.
 *
 * Returns true when the active flight was released.
 */
export function unlockMineMotionProbeFlight(
  ctrl: MineMotionProbeController | null | undefined,
  settledIndex?: number,
  opts?: { force?: boolean }
): boolean {
  if (!ctrl) return false;
  if (!ctrl.flightLocked) return false;

  const force = opts?.force === true;
  if (!force) {
    if (ctrl.flightDestinationIndex === MINE_MOTION_PROBE_FLIGHT_DEST_OPEN) {
      return false;
    }
    if (
      typeof settledIndex === "number" &&
      Number.isFinite(settledIndex) &&
      ctrl.flightDestinationIndex != null &&
      Math.floor(settledIndex) !== ctrl.flightDestinationIndex
    ) {
      return false;
    }
    if (
      ctrl.flightDestinationIndex != null &&
      ctrl.flightDestinationIndex >= 0 &&
      (typeof settledIndex !== "number" || !Number.isFinite(settledIndex))
    ) {
      // Non-forced unlock without a settled index cannot validate ownership.
      return false;
    }
  }

  ctrl.flightLocked = false;
  ctrl.flightDepartureIndex = null;
  ctrl.flightDestinationIndex = null;
  ctrl.flightAnimateEdgeCards = false;
  if (
    typeof settledIndex === "number" &&
    Number.isFinite(settledIndex)
  ) {
    ctrl.resyncAdjacent?.(Math.floor(settledIndex));
  } else {
    ctrl.resyncAdjacent?.();
  }
  ctrl.onFlightSettled?.();
  return true;
}

export type MineMotionProbeAdjacentMedia = {
  prevUrl: string | null;
  nextUrl: string | null;
};

/**
 * Pure neighbor URL pick for a settled/departure snap (test + Overlay helper).
 * `sideUrls[i]` is the resolved proxy URL for carouselItems[i] (or null).
 */
export function mineMotionProbeAdjacentAtIndex(
  sideUrls: readonly (string | null | undefined)[],
  authoritativeIndex: number
): MineMotionProbeAdjacentMedia {
  if (sideUrls.length === 0) {
    return { prevUrl: null, nextUrl: null };
  }
  const at = Math.max(
    0,
    Math.min(sideUrls.length - 1, Math.floor(authoritativeIndex))
  );
  return {
    prevUrl: at > 0 ? (sideUrls[at - 1] ?? null) : null,
    nextUrl: at < sideUrls.length - 1 ? (sideUrls[at + 1] ?? null) : null,
  };
}

/**
 * Apply live adjacent URLs when not flight-locked.
 * Returns false if skipped because a flight is active.
 * Bumps mediaGeneration so stale Image callbacks are rejected.
 */
export function applyMineMotionProbeAdjacentMedia(
  ctrl: MineMotionProbeController | null | undefined,
  media: MineMotionProbeAdjacentMedia
): boolean {
  if (!ctrl || ctrl.mode !== "proxy") return false;
  if (ctrl.flightLocked) return false;

  const prevSame = ctrl.prevUrl === media.prevUrl;
  const nextSame = ctrl.nextUrl === media.nextUrl;
  ctrl.prevUrl = media.prevUrl;
  ctrl.nextUrl = media.nextUrl;
  // Only clear readiness when the URL identity actually changes.
  if (!prevSame) ctrl.prevReady = false;
  if (!nextSame) ctrl.nextReady = false;
  ctrl.mediaGeneration += 1;
  return true;
}

/**
 * Mark a side ready only if generation + URL still match (stale-load safe).
 */
export function markMineMotionProbeSideReady(
  ctrl: MineMotionProbeController | null | undefined,
  side: "prev" | "next",
  url: string,
  generation: number
): void {
  if (!ctrl || ctrl.mode !== "proxy") return;
  if (ctrl.mediaGeneration !== generation) return;
  if (side === "prev") {
    if (ctrl.prevUrl === url) ctrl.prevReady = true;
  } else if (ctrl.nextUrl === url) {
    ctrl.nextReady = true;
  }
}

export function hideMineMotionProbeVisual(
  ctrl: MineMotionProbeController | null | undefined
): void {
  const el = ctrl?.root;
  if (!el) return;
  el.style.visibility = "hidden";
  el.style.transform = "translate3d(-9999px, -9999px, 0)";
}

/**
 * Direct transform write for Embla `scroll` (no rAF, no React).
 * Box mode: x only. Proxy mode: x + rotate + scale; hides when media not ready.
 */
export function writeMineMotionProbeVisual(
  ctrl: MineMotionProbeController | null | undefined,
  progress: MineMotionProbeProgress,
  geom: MineMotionProbeGeometry
): void {
  if (!ctrl?.root || geom.shellW <= 0) return;

  const engaged =
    progress.next > 0 ? "next" : progress.prev > 0 ? "prev" : null;
  if (!engaged) {
    hideMineMotionProbeVisual(ctrl);
    return;
  }

  const p = engaged === "next" ? progress.next : progress.prev;
  const startX = engaged === "next" ? geom.nextStartX : geom.prevStartX;
  const x = startX + p * (geom.centerX - startX);

  if (ctrl.mode === "box") {
    const half = MINE_MOTION_PROBE_BOX_W_PX / 2;
    ctrl.root.style.transformOrigin = "center center";
    ctrl.root.style.visibility = "visible";
    ctrl.root.style.transform = `translate3d(${x - half}px, -50%, 0)`;
    return;
  }

  // Proxy mode
  const url = engaged === "next" ? ctrl.nextUrl : ctrl.prevUrl;
  const ready = engaged === "next" ? ctrl.nextReady : ctrl.prevReady;
  const frameW = geom.frameW > 0 ? geom.frameW : ctrl.frameW;
  const frameH = geom.frameH > 0 ? geom.frameH : ctrl.frameH;
  if (!url || !ready || !(frameW > 0) || !(frameH > 0)) {
    hideMineMotionProbeVisual(ctrl);
    return;
  }

  if (ctrl.img && ctrl.img.getAttribute("src") !== url) {
    ctrl.img.src = url;
  }

  const scale = mineIncomingProxyScale(p);
  const rotateDeg = mineIncomingProxyRotateDeg(p, engaged);
  const halfW = frameW / 2;
  const halfH = frameH / 2;
  const startY = geom.startCenterY;
  const y = startY + p * (geom.centerY - startY);
  // CSS `top` is startY (49.5% of container). Pixel ty matches prior `-50%` at p=0.
  const ty = y - startY - halfH;
  ctrl.root.style.transformOrigin =
    engaged === "next" ? "bottom left" : "bottom right";
  ctrl.root.style.visibility = "visible";
  ctrl.root.style.transform = `translate3d(${x - halfW}px, ${ty}px, 0) rotate(${rotateDeg}deg) scale(${scale})`;
}
