/**
 * People Duo portrait media tokens (presentation only).
 * Fan geometry adapted from ProfilePhotoHero / profilePhotoHeroPresentation —
 * duplicated here so People can diverge without affecting Profile.
 * Identity priority lives in resolveProfileIdentityMedia.
 */

/**
 * Preferred portrait aspect (width / height).
 * 3:4 primary; short viewports may clamp toward 4:5.
 */
export const PEOPLE_CANDIDATE_MEDIA_ASPECT = 3 / 4;
export const PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN = 4 / 5;

/** Front photo frame radius (Profile: rounded-[1.65rem]). */
export const PEOPLE_DUO_FRONT_RADIUS = "1.65rem";
/** Rear photo frame radius (Profile: rounded-[1.5rem]). */
export const PEOPLE_DUO_REAR_RADIUS = "1.5rem";
/** Approx px for tests (1.65rem @ 16px root). */
export const PEOPLE_DUO_PORTRAIT_RADIUS_PX = 26.4;

/** Front / active profile photo is always upright. */
export const PEOPLE_DUO_FRONT_ROTATE_DEG = 0;

/** Rear same-person card opacity (Profile REAR_CARD). */
export const PEOPLE_DUO_REAR_OPACITY = 0.72;

/** Embla gap between Duo slides. */
export const PEOPLE_DISCOVER_GAP_PX = 6;
export const PEOPLE_DUO_GAP_PX = PEOPLE_DISCOVER_GAP_PX;
export const PEOPLE_DISCOVER_MAX_SLIDE_W = 400;
export const PEOPLE_DISCOVER_MIN_FRAME_W = 160;

/**
 * Stack pad — minimum room for Profile-style % peeks (~5–6% of frame).
 * Must stay BELOW neighbor card-peek target so peeks show framed edge, not pad.
 */
export const PEOPLE_DISCOVER_STACK_PAD_X = 10;
export const PEOPLE_DISCOVER_STACK_PAD_Y = 8;
/**
 * Top stack pad for Mine upward peeks.
 * With ~4% frame rise, ~20px leaves ~16–20px from source surface (via
 * PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX + this pad − peek rise) on typical frames.
 */
export const PEOPLE_MINE_STACK_PAD_Y_TOP = 20;
export const PEOPLE_DUO_STACK_PAD_X = PEOPLE_DISCOVER_STACK_PAD_X;
export const PEOPLE_DUO_STACK_PAD_Y = PEOPLE_DISCOVER_STACK_PAD_Y;

/**
 * Target visible neighboring FRAMED card edge (after gap + stack pad).
 * ~18–24px of actual frame, not empty pad.
 */
export const PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX = 20;

/**
 * Outer margin: framedPeek + gap + stackPadX
 * so (hostW-slideW)/2 - gap - pad ≈ framedPeek.
 */
export function peopleDuoOuterNeighborBudgetPx(): number {
  return (
    PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX +
    PEOPLE_DISCOVER_GAP_PX +
    PEOPLE_DISCOVER_STACK_PAD_X
  );
}

/** @deprecated Prefer peopleDuoOuterNeighborBudgetPx(). */
export const PEOPLE_DISCOVER_NEIGHBOR_PEEK_PX = peopleDuoOuterNeighborBudgetPx();
export const PEOPLE_DUO_NEIGHBOR_PEEK_PX = PEOPLE_DISCOVER_NEIGHBOR_PEEK_PX;
export const PEOPLE_DUO_NEIGHBOR_FACE_PEEK_PX = PEOPLE_DUO_NEIGHBOR_CARD_PEEK_PX;

/** In-flow source block budget (date + caption) — Discover / legacy. */
export const PEOPLE_DUO_SOURCE_CHROME_H_PX = 62;
/** Quiet Duo note reserve below portrait (stable across empty/filled notes). */
export const PEOPLE_DUO_NOTE_RESERVE_H_PX = 40;

/**
 * Mine source surface tokens (Pass 1.1).
 * Stable reserve fits date + 3-line caption + pads; short captions do not shrink it.
 */
export const PEOPLE_MINE_SOURCE_SURFACE_PAD_PX = 11;
export const PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX = 8;
/** Space below the surface before the portrait stack pad (peek clearance partner). */
export const PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX = 10;
/** Date label line (~12px type). */
export const PEOPLE_MINE_SOURCE_DATE_LINE_H_PX = 15;
/** 13px / leading-relaxed × 3 lines. */
export const PEOPLE_MINE_SOURCE_CAPTION_3LINE_H_PX = Math.ceil(13 * 1.625 * 3);
/**
 * Fixed Mine source chrome = surface (pad + date + gap + 3-line caption + pad)
 * + gap to stack. Does not change per candidate.
 */
export const PEOPLE_MINE_SOURCE_CHROME_H_PX =
  PEOPLE_MINE_SOURCE_SURFACE_PAD_PX * 2 +
  PEOPLE_MINE_SOURCE_DATE_LINE_H_PX +
  PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX +
  PEOPLE_MINE_SOURCE_CAPTION_3LINE_H_PX +
  PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX;

/** Bounded vertical surplus pads (Mine host-fit). Slightly tighter top after taller chrome. */
export const PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX = 20;
export const PEOPLE_MINE_SURPLUS_PAD_BOTTOM_MAX_PX = 28;
export const PEOPLE_MINE_SURPLUS_TOP_RATIO = 0.38;

export const PEOPLE_DUO_NEIGHBOR_SCALE = 0.96;
export const PEOPLE_DUO_CENTER_SCALE = 1;

export const PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX = 10;

/** Profile-matched face/stack motion. */
export const PEOPLE_PHOTO_CROSSFADE_MS = 280;
export const PEOPLE_PHOTO_CROSSFADE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const PEOPLE_CANDIDATE_TEXT_TRANSITION_MS = 180;

export const PEOPLE_NEIGHBOR_ROTATE_DEG = 0;

export const PEOPLE_DUO_PHOTO_BORDER_LIGHT = "rgba(0, 0, 0, 0.18)";
export const PEOPLE_DUO_PHOTO_BORDER_DARK = "rgba(255, 255, 255, 0.22)";
export const PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS =
  "color-mix(in oklab, var(--text) 22%, transparent)";
export const PEOPLE_DUO_PHOTO_BORDER_REAR_CSS =
  "color-mix(in oklab, var(--text) 14%, transparent)";
/** @deprecated Prefer FRONT/REAR specific. */
export const PEOPLE_DUO_PHOTO_BORDER_CSS = PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS;

export type PeopleDuoPeekDirection = "up" | "down";
export type PeopleDuoPresentationVariant = "mine" | "discover";

export type PeoplePhotoStackPeek = {
  side: "left" | "right";
  depth: number;
  zIndex: number;
};

export function peopleDuoPeekOffsetPct(
  side: "left" | "right",
  depth: number,
  direction: PeopleDuoPeekDirection = "down"
): { x: number; y: number; rot: number } {
  const x = side === "left" ? -5 - depth * 1 : 5 + depth * 1;
  const rot = side === "left" ? -2.75 - depth * 0.45 : 2.75 + depth * 0.45;
  // Discover (down): preserve legacy Profile-matched Y.
  // Mine (up): slightly stronger lift so upper edges read clearly.
  const yMag = direction === "up" ? 4 + depth * 1.15 : 3 + depth * 1;
  const y = direction === "up" ? -yMag : yMag;
  return { x, y, rot };
}

/**
 * Profile-style % peek transform.
 * Front photo is never represented here.
 * `down` preserves Discover until parity; Mine uses `up`.
 */
export function peopleDuoPhotoPeekTransform(
  side: "left" | "right",
  depth: number,
  direction: PeopleDuoPeekDirection = "down"
): string {
  const { x, y, rot } = peopleDuoPeekOffsetPct(side, depth, direction);
  return `translate(-50%, -50%) translate(${x}%, ${y}%) rotate(${rot}deg) scale(0.955)`;
}

/** Lower-third pivot so upward peeks fan from a bottom-ish anchor. */
export function peopleDuoPeekTransformOrigin(
  direction: PeopleDuoPeekDirection
): string {
  return direction === "up" ? "50% 88%" : "50% 50%";
}

/**
 * Unit-frame corner max Y after peek transform (center origin, scale ignored).
 * Positive clearance vs front bottom (0.5) means rear bottom stays above front.
 */
export function peopleDuoPeekBottomClearance(
  side: "left" | "right",
  depth: number,
  direction: PeopleDuoPeekDirection
): number {
  const { x, y, rot } = peopleDuoPeekOffsetPct(side, depth, direction);
  const rad = (rot * Math.PI) / 180;
  const tx = x / 100;
  const ty = y / 100;
  const corners: Array<[number, number]> = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ];
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const xr = cx * Math.cos(rad) - cy * Math.sin(rad);
    const yr = cx * Math.sin(rad) + cy * Math.cos(rad);
    maxY = Math.max(maxY, yr + ty);
  }
  return 0.5 - maxY;
}

/**
 * Rear peeks for the ACTIVE candidate only.
 * Matches Profile Other-profile assignment: 2 → right only; 3 → left + right.
 */
export function peoplePhotoStackPeeks(
  photoCount: number,
  showStack: boolean
): PeoplePhotoStackPeek[] {
  if (!showStack || photoCount <= 1) return [];
  if (photoCount === 2) {
    return [{ side: "right", depth: 0, zIndex: 0 }];
  }
  return [
    { side: "left", depth: 0, zIndex: 0 },
    { side: "right", depth: 1, zIndex: 1 },
  ];
}

export function prefersPeopleMotionReduce(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Visible framed neighbor edge ≈ outer − gap − stackPadX. */
export function peopleDuoNeighborFacePeekPx(outerNeighborPeekPx: number): number {
  return Math.max(
    0,
    outerNeighborPeekPx -
      PEOPLE_DISCOVER_GAP_PX -
      PEOPLE_DISCOVER_STACK_PAD_X
  );
}

export type PeopleDiscoverCardMetrics = {
  slideW: number;
  slideH: number;
  frameW: number;
  frameH: number;
  aspect: number;
  stackPadX: number;
  stackPadY: number;
  /** Extra top pad inside media for upward peeks (Mine). */
  stackPadYTop: number;
  neighborPeekPx: number;
  neighborFacePeekPx: number;
  /** Portrait + chrome height before surplus pads. */
  contentH: number;
  /** Bounded surplus above the composition (Mine). */
  padTop: number;
  /** Bounded surplus below the composition (Mine). */
  padBottom: number;
  /** Host height still unused after bounded pads (static estimate). */
  unusedHostH: number;
};

export type PeopleDuoCardMetrics = PeopleDiscoverCardMetrics;

function distributeMineSurplus(surplus: number): {
  padTop: number;
  padBottom: number;
} {
  if (surplus <= 0) return { padTop: 0, padBottom: 0 };
  let padTop = Math.round(surplus * PEOPLE_MINE_SURPLUS_TOP_RATIO);
  padTop = Math.min(PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX, Math.max(0, padTop));
  let padBottom = surplus - padTop;
  padBottom = Math.min(
    PEOPLE_MINE_SURPLUS_PAD_BOTTOM_MAX_PX,
    Math.max(0, padBottom)
  );
  // If top took less than ratio because of rounding and bottom hit cap early,
  // give leftover back to top up to its cap.
  const used = padTop + padBottom;
  if (used < surplus && padTop < PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX) {
    padTop = Math.min(
      PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX,
      padTop + (surplus - used)
    );
  }
  return { padTop, padBottom };
}

export function computePeopleDiscoverCardMetrics(input: {
  hostW: number;
  hostH: number;
  reserveInFlowChrome?: boolean;
  /**
   * Mine: distribute bounded surplus around the card.
   * Discover/Plans: leave legacy width-first + items-start behavior.
   */
  distributeVerticalSurplus?: boolean;
  /** Asymmetric top stack pad for upward peeks. */
  upwardPeekPad?: boolean;
}): PeopleDiscoverCardMetrics {
  const { hostW, hostH } = input;
  const reserveChrome = input.reserveInFlowChrome !== false;
  const distributeSurplus = input.distributeVerticalSurplus === true;
  const upwardPeekPad = input.upwardPeekPad === true;
  const stackPadX = PEOPLE_DISCOVER_STACK_PAD_X;
  const stackPadY = PEOPLE_DISCOVER_STACK_PAD_Y;
  const stackPadYTop = upwardPeekPad
    ? PEOPLE_MINE_STACK_PAD_Y_TOP
    : stackPadY;
  const chromeH = reserveChrome
    ? (upwardPeekPad
        ? PEOPLE_MINE_SOURCE_CHROME_H_PX
        : PEOPLE_DUO_SOURCE_CHROME_H_PX) + PEOPLE_DUO_NOTE_RESERVE_H_PX
    : 0;
  const empty: PeopleDiscoverCardMetrics = {
    slideW: 0,
    slideH: 0,
    frameW: 0,
    frameH: 0,
    aspect: PEOPLE_CANDIDATE_MEDIA_ASPECT,
    stackPadX,
    stackPadY,
    stackPadYTop,
    neighborPeekPx: 0,
    neighborFacePeekPx: 0,
    contentH: 0,
    padTop: 0,
    padBottom: 0,
    unusedHostH: 0,
  };
  if (hostW <= 0 || hostH <= 0) return empty;

  const outerPeek = peopleDuoOuterNeighborBudgetPx();
  let slideW = Math.min(hostW - 2 * outerPeek, PEOPLE_DISCOVER_MAX_SLIDE_W);
  slideW = Math.max(
    slideW,
    Math.min(PEOPLE_DISCOVER_MIN_FRAME_W + 2 * stackPadX, hostW)
  );

  let aspect = PEOPLE_CANDIDATE_MEDIA_ASPECT;
  let frameW = Math.max(0, slideW - 2 * stackPadX);
  let frameH = frameW / aspect;
  const mediaPadY = stackPadYTop + stackPadY;
  let mediaH = frameH + mediaPadY;
  let contentH = mediaH + chromeH;

  const maxSlideH = Math.max(0, hostH);
  if (contentH > maxSlideH && maxSlideH > 0) {
    const mediaBudget = Math.max(0, maxSlideH - chromeH);
    frameH = Math.max(0, mediaBudget - mediaPadY);
    frameW = frameH * aspect;
    slideW = frameW + 2 * stackPadX;

    const minSlideW = Math.min(
      PEOPLE_DISCOVER_MIN_FRAME_W + 2 * stackPadX,
      hostW - 2 * Math.min(outerPeek, 12)
    );
    if (slideW < minSlideW && frameH > 0) {
      aspect = PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN;
      frameW =
        Math.min(hostW - 2 * outerPeek, PEOPLE_DISCOVER_MAX_SLIDE_W) -
        2 * stackPadX;
      frameW = Math.max(frameW, PEOPLE_DISCOVER_MIN_FRAME_W);
      frameH = frameW / aspect;
      if (frameH + mediaPadY > mediaBudget) {
        frameH = Math.max(0, mediaBudget - mediaPadY);
        frameW = frameH * aspect;
      }
      slideW = frameW + 2 * stackPadX;
    }

    mediaH = frameH + mediaPadY;
    contentH = Math.min(maxSlideH, mediaH + chromeH);
  }

  const surplus = Math.max(0, hostH - contentH);
  const { padTop, padBottom } = distributeSurplus
    ? distributeMineSurplus(surplus)
    : { padTop: 0, padBottom: 0 };
  const slideH = contentH + padTop + padBottom;
  const unusedHostH = Math.max(0, hostH - slideH);

  const neighborPeekPx = Math.max(0, (hostW - slideW) / 2);
  const neighborFacePeekPx = peopleDuoNeighborFacePeekPx(neighborPeekPx);

  return {
    slideW: Math.round(slideW * 10) / 10,
    slideH: Math.round(slideH * 10) / 10,
    frameW: Math.round(frameW * 10) / 10,
    frameH: Math.round(frameH * 10) / 10,
    aspect: Math.round(aspect * 1000) / 1000,
    stackPadX,
    stackPadY,
    stackPadYTop,
    neighborPeekPx: Math.round(neighborPeekPx * 10) / 10,
    neighborFacePeekPx: Math.round(neighborFacePeekPx * 10) / 10,
    contentH: Math.round(contentH * 10) / 10,
    padTop,
    padBottom,
    unusedHostH: Math.round(unusedHostH * 10) / 10,
  };
}

export const computePeopleDuoCardMetrics = computePeopleDiscoverCardMetrics;

export function isPeopleDiscoverMetricsReady(
  m: Pick<PeopleDiscoverCardMetrics, "slideW" | "slideH">
): boolean {
  return m.slideW > 0 && m.slideH > 0;
}

export const isPeopleDuoMetricsReady = isPeopleDiscoverMetricsReady;
