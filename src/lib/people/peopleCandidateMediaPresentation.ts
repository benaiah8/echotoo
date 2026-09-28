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
 * Deepest rear (~-14% of frame) needs headroom so peeks stay inside the media box.
 */
export const PEOPLE_MINE_STACK_PAD_Y_TOP = 52;
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
/**
 * Discover Duo note reserve (label + 2-line clamp + padding).
 * Mine uses {@link PEOPLE_MINE_NOTE_RESERVE_H_PX} instead.
 */
export const PEOPLE_DUO_NOTE_RESERVE_H_PX = 40;

/**
 * Mine opportunity note typography — keep in sync with
 * PeopleCanonicalCandidatePresentation / MineOpportunityNote.
 * 12.5px / leading-snug (1.375).
 */
export const PEOPLE_MINE_NOTE_FONT_PX = 12.5;
export const PEOPLE_MINE_NOTE_LINE_HEIGHT = 1.375;
export const PEOPLE_MINE_NOTE_COLLAPSED_LINES = 3;
/** Collapsed text block height for three complete lines. */
export const PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX = Math.ceil(
  PEOPLE_MINE_NOTE_FONT_PX *
    PEOPLE_MINE_NOTE_LINE_HEIGHT *
    PEOPLE_MINE_NOTE_COLLAPSED_LINES
);
/** pt-2.5 / pb-0.5 / h-px divider / mt-2 on text — match slide chrome. */
export const PEOPLE_MINE_NOTE_PAD_TOP_PX = 10;
export const PEOPLE_MINE_NOTE_PAD_BOTTOM_PX = 2;
export const PEOPLE_MINE_NOTE_DIVIDER_H_PX = 1;
export const PEOPLE_MINE_NOTE_TEXT_MARGIN_TOP_PX = 8;
/**
 * Mine collapsed note reserve: padding + divider + margin + 3-line text.
 * Must fit three complete lines; 40px is insufficient.
 */
export const PEOPLE_MINE_NOTE_RESERVE_H_PX =
  PEOPLE_MINE_NOTE_PAD_TOP_PX +
  PEOPLE_MINE_NOTE_DIVIDER_H_PX +
  PEOPLE_MINE_NOTE_TEXT_MARGIN_TOP_PX +
  PEOPLE_MINE_NOTE_TEXT_3LINE_H_PX +
  PEOPLE_MINE_NOTE_PAD_BOTTOM_PX;
/**
 * Expanded note text max (scrollable). ~8 lines — stays below Connect when
 * expansion consumes slide padBottom / unused host first.
 */
export const PEOPLE_MINE_NOTE_EXPANDED_LINES = 8;
export const PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX = Math.ceil(
  PEOPLE_MINE_NOTE_FONT_PX *
    PEOPLE_MINE_NOTE_LINE_HEIGHT *
    PEOPLE_MINE_NOTE_EXPANDED_LINES
);
/** Full expanded note shell max (chrome + scrollable text). */
export const PEOPLE_MINE_NOTE_EXPANDED_MAX_H_PX =
  PEOPLE_MINE_NOTE_PAD_TOP_PX +
  PEOPLE_MINE_NOTE_DIVIDER_H_PX +
  PEOPLE_MINE_NOTE_TEXT_MARGIN_TOP_PX +
  PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX +
  PEOPLE_MINE_NOTE_PAD_BOTTOM_PX;

/**
 * Mine source region (top-right caption + date).
 * Stable reserve — text length must not shift portrait baselines.
 */
export const PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX = 8;
/** Space below source block before portrait stack pad. */
export const PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX = 8;
/** Compact date pill height. */
export const PEOPLE_MINE_SOURCE_DATE_PILL_H_PX = 28;
/**
 * Caption 3-line budget using Mine's live `leading-tight` (~1.25).
 * Optical pad (2px) lives on the absolute caption surface, not here.
 */
export const PEOPLE_MINE_SOURCE_CAPTION_3LINE_H_PX = Math.ceil(13 * 1.25 * 3);
/**
 * Historical Back-row reclaim (shell top pad). Kept for shell identity —
 * NOT included in the in-flow source reserve (Back is outside the slide).
 * Must equal `PEOPLE_SHELL_MINE_TOP_RECLAIM_PX`.
 */
export const PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX = 48;
/**
 * In-flow Mine source reserve: caption + date + gaps only (no Back double-count).
 * Absolute caption overlays this slot; portrait clears the live envelope.
 */
export const PEOPLE_MINE_SOURCE_CHROME_H_PX =
  PEOPLE_MINE_SOURCE_CAPTION_3LINE_H_PX +
  PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX +
  PEOPLE_MINE_SOURCE_DATE_PILL_H_PX +
  PEOPLE_MINE_SOURCE_TO_STACK_GAP_PX;

/** @deprecated Surface pad removed from Mine source layout. */
export const PEOPLE_MINE_SOURCE_SURFACE_PAD_PX = 0;
/** @deprecated Prefer PEOPLE_MINE_SOURCE_DATE_PILL_H_PX. */
export const PEOPLE_MINE_SOURCE_DATE_LINE_H_PX = PEOPLE_MINE_SOURCE_DATE_PILL_H_PX;

/**
 * @deprecated Legacy Discover no-op caps for {@link distributeMineSurplus}.
 * Plans uses {@link peoplePlansDistributeContentBlockSurplus}; Mine uses
 * {@link peopleMineDistributeHostSurplus}.
 */
export const PEOPLE_MINE_SURPLUS_PAD_TOP_MAX_PX = 0;
export const PEOPLE_MINE_SURPLUS_PAD_BOTTOM_MAX_PX = 0;
/** @deprecated Discover/legacy only. */
export const PEOPLE_MINE_SURPLUS_TOP_RATIO = 0;

/**
 * After aspect-bounded portrait sizing, split leftover carousel-host height
 * ~50/50 above/below the portrait+note block (caption/Connect stay fixed).
 *
 *   extraTop = floor(unused / 2)
 *   extraBottom = unused − extraTop
 */
export function peopleMineDistributeHostSurplus(surplus: number): {
  padTop: number;
  padBottom: number;
} {
  if (!(surplus > 0)) return { padTop: 0, padBottom: 0 };
  const padTop = Math.floor(surplus / 2);
  return { padTop, padBottom: surplus - padTop };
}

/**
 * Plans: split leftover host height ~50/50 around the FULL content block
 * (portrait + schedule + caption + note + bio + privacy) — not portrait alone.
 *
 *   surplus = max(0, round(hostH − contentH))
 *   extraTop = floor(surplus / 2)
 *   extraBottom = surplus − extraTop
 *
 * Odd pixels go to extraBottom. Short hosts (surplus ≤ 0) → 0/0.
 * Same arithmetic as Mine surplus split; different semantic target.
 */
export function peoplePlansDistributeContentBlockSurplus(surplus: number): {
  padTop: number;
  padBottom: number;
} {
  return peopleMineDistributeHostSurplus(surplus);
}

/**
 * Fixed breathing gap below the live caption/date envelope (before portrait).
 * Applied as padding on the source reserve (not a separate spacer).
 * Does not move caption/date.
 */
export const PEOPLE_MINE_TOP_GAP_PX = 28;
/**
 * @deprecated Prefer {@link PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX} in peopleShellLayout
 * (single note→Connect gap owned by the shell content bottom reservation).
 */
export const PEOPLE_MINE_BOTTOM_GAP_PX = 22;
/** @deprecated Prefer PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX / shell reservation. */
export const PEOPLE_MINE_BELOW_CAROUSEL_GAP_PX = PEOPLE_MINE_BOTTOM_GAP_PX;

/**
 * Plans (`open_plans`) in-slide chrome below the portrait.
 * Collapsed budget must match actual clamps: schedule + caption(2) + note(3)
 * + bio(2) + privacy(2) + gaps/pads. Expanded note reclaims surplus/unused —
 * not this reserve.
 */
export const PEOPLE_PLANS_SCHEDULE_PILL_H_PX = 18;
export const PEOPLE_PLANS_CAPTION_2LINE_H_PX = Math.ceil(13 * 1.375 * 2);
/** Collapsed bio slot — matches `line-clamp-2` on the Plans slide. */
export const PEOPLE_PLANS_BIO_2LINE_H_PX = Math.ceil(12.5 * 1.375 * 2);
/**
 * @deprecated Prefer {@link PEOPLE_PLANS_BIO_2LINE_H_PX} (authoritative collapsed budget).
 * Kept as the 1-line measure for any legacy imports.
 */
export const PEOPLE_PLANS_BIO_LINE_H_PX = Math.ceil(12.5 * 1.375);
/** Plans note shell = Mine shared 3-line expandable reserve. */
export const PEOPLE_PLANS_NOTE_RESERVE_H_PX = PEOPLE_MINE_NOTE_RESERVE_H_PX;
/** @deprecated Prefer PEOPLE_PLANS_NOTE_RESERVE_H_PX (3-line shell). */
export const PEOPLE_PLANS_NOTE_2LINE_H_PX = Math.ceil(12.5 * 1.375 * 2);
/** Privacy may wrap to 2 lines on narrow hosts; copy aims for 1–2. */
export const PEOPLE_PLANS_PRIVACY_2LINE_H_PX = Math.ceil(11 * 1.375 * 2);
/** @deprecated Prefer PEOPLE_PLANS_PRIVACY_2LINE_H_PX. */
export const PEOPLE_PLANS_PRIVACY_1LINE_H_PX = Math.ceil(11 * 1.375);
export const PEOPLE_PLANS_CHROME_GAP_PX = 4;
export const PEOPLE_PLANS_CHROME_PAD_TOP_PX = 8;
export const PEOPLE_PLANS_CHROME_PAD_BOTTOM_PX = 14;
/**
 * Fixed Plans below-portrait collapsed reserve:
 * padTop + schedule + caption(2) + note(3-line shell) + bio(2) + privacy(2)
 * + gaps + padBottom.
 */
export const PEOPLE_PLANS_CHROME_H_PX =
  PEOPLE_PLANS_CHROME_PAD_TOP_PX +
  PEOPLE_PLANS_SCHEDULE_PILL_H_PX +
  PEOPLE_PLANS_CHROME_GAP_PX +
  PEOPLE_PLANS_CAPTION_2LINE_H_PX +
  PEOPLE_PLANS_CHROME_GAP_PX +
  PEOPLE_PLANS_NOTE_RESERVE_H_PX +
  PEOPLE_PLANS_CHROME_GAP_PX +
  PEOPLE_PLANS_BIO_2LINE_H_PX +
  PEOPLE_PLANS_CHROME_GAP_PX +
  PEOPLE_PLANS_PRIVACY_2LINE_H_PX +
  PEOPLE_PLANS_CHROME_PAD_BOTTOM_PX;

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
export type PeopleDuoPresentationVariant = "mine" | "discover" | "plans";
/** Chrome / reserve profile for Duo metrics (Mine vs Plans vs Discover). */
export type PeopleDuoChromeProfile = "mine" | "discover" | "plans";

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

/* -------------------------------------------------------------------------- */
/* Mine portrait stack poses (card-slot cycle)                                  */
/* -------------------------------------------------------------------------- */

export type PeopleMineStackRole = "front" | "left" | "right";

/**
 * Shared origin for all Mine card poses so CSS transform interpolation stays
 * predictable across front ↔ rear exchanges.
 */
export const PEOPLE_MINE_CARD_TRANSFORM_ORIGIN = "50% 90%";

/** Tunable Mine stack offsets — staggered TOP reveal, minimal side flare. */
export const PEOPLE_MINE_STACK_POSE = {
  front: { xPct: 0, yPct: 0, rotDeg: 0, scale: 1, opacity: 1 },
  /** Next photo — right rear, moderate lift (~-7% start; kept). */
  right: { xPct: 2.35, yPct: -7, rotDeg: 2.05, scale: 0.97, opacity: 1 },
  /**
   * Remaining photo — left rear, highest peek.
   * Tuned past -12% start so three top edges stay distinct on ~3:4 Mine frames
   * without widening horizontal flare.
   */
  left: { xPct: -2.35, yPct: -14, rotDeg: -2.05, scale: 0.97, opacity: 1 },
} as const;

/** Settled z-order: left under right under front. */
export const PEOPLE_MINE_Z_SETTLED: Record<PeopleMineStackRole, number> = {
  left: 1,
  right: 2,
  front: 5,
};

/**
 * Transition z-order: promoting card rises above demoting front so 2-photo
 * exchanges do not pop under mid-flight.
 * Not used for 3+ photo flights (destination settled order for the whole move).
 */
export const PEOPLE_MINE_Z_PROMOTING = 8;
export const PEOPLE_MINE_Z_DEMOTING = 7;

/** Unified radius so demote→settle never snaps corner size. */
export const PEOPLE_MINE_CARD_RADIUS = PEOPLE_DUO_FRONT_RADIUS;

/**
 * Fine contrasting edge: softer than prior strong white ring.
 * Dark mode → light hairline; light mode → dark hairline.
 */
export const PEOPLE_MINE_PHOTO_EDGE =
  "0 0 0 1px color-mix(in oklab, var(--text) 38%, transparent)";

/**
 * Unseen portrait edge — Echo blue → magenta → red (~2px apparent ring).
 * Applied via {@link peopleMineUnseenEdgeRingStyle} (not box-shadow; shadows
 * cannot paint multi-stop gradients).
 */
export const PEOPLE_MINE_UNSEEN_EDGE_WIDTH_PX = 2;
export const PEOPLE_MINE_UNSEEN_EDGE_GRADIENT =
  "linear-gradient(135deg, #2563EB 0%, #D946EF 50%, #EF4444 100%)";

/**
 * @deprecated Prefer {@link PEOPLE_MINE_UNSEEN_EDGE_GRADIENT} + ring style.
 * Kept as a marker string for migration-era tests / greps.
 */
export const PEOPLE_MINE_UNSEEN_PHOTO_EDGE = PEOPLE_MINE_UNSEEN_EDGE_GRADIENT;

/**
 * Static depth under each card (identical for all roles — no settle chrome snap).
 * Modestly stronger than the prior 3px/0.40 token so peek edges separate without
 * a broad glow or second outline. Ancestor Embla overflow can still clip outer
 * flare; an inner wrapper would not fix that.
 */
export const PEOPLE_MINE_DEPTH_SHADOW = "0 4px 12px rgba(0,0,0,0.55)";
export const PEOPLE_MINE_FRONT_SHADOW = `${PEOPLE_MINE_PHOTO_EDGE}, ${PEOPLE_MINE_DEPTH_SHADOW}`;
/** Unseen: depth only — colored edge comes from the gradient ring overlay. */
export const PEOPLE_MINE_UNSEEN_FRONT_SHADOW = PEOPLE_MINE_DEPTH_SHADOW;
export const PEOPLE_MINE_REAR_SHADOW = PEOPLE_MINE_FRONT_SHADOW;

/** Absolute inset ring for unseen media frames (`pointer-events: none`). */
export function peopleMineUnseenEdgeRingStyle(
  borderRadius: string = PEOPLE_MINE_CARD_RADIUS
): {
  borderRadius: string;
  padding: number;
  background: string;
  WebkitMask: string;
  WebkitMaskComposite: string;
  maskComposite: "exclude";
  pointerEvents: "none";
} {
  return {
    borderRadius,
    padding: PEOPLE_MINE_UNSEEN_EDGE_WIDTH_PX,
    background: PEOPLE_MINE_UNSEEN_EDGE_GRADIENT,
    WebkitMask:
      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    pointerEvents: "none",
  };
}

/**
 * Mine portrait OUTER width / host — retained for Plans tallFactor path + tests.
 * Mine horizontal sizing no longer uses these ratios (see fixed rails below).
 */
export const PEOPLE_MINE_PORTRAIT_TO_HOST_W = 0.76;
/** Tall-host outer portrait / host target (tallFactor → 1). Plans path only. */
export const PEOPLE_MINE_PORTRAIT_TO_HOST_W_TALL = 0.87;

/**
 * Mine-only max outer portrait width (Discover keeps {@link PEOPLE_DISCOVER_MAX_SLIDE_W}).
 */
export const PEOPLE_MINE_MAX_SLIDE_W = 440;

/**
 * @deprecated Prefer PEOPLE_MINE_PORTRAIT_TO_HOST_W (short baseline) or
 * {@link peopleMinePortraitRatio}.
 */
export const PEOPLE_MINE_FRAME_TO_HOST_W = PEOPLE_MINE_PORTRAIT_TO_HOST_W;

/**
 * @deprecated Gap reclaim removed — width is ratio × host vs edge+clearance reserve.
 */
export const PEOPLE_MINE_SIDE_GAP_RECLAIM = 0;

/**
 * Mine-only height-stress aspect (width/height), slightly squarer than 4:5.
 * Used only when 3:4 and 4:5 cannot reach the width-first target.
 * Tall screens keep 3:4. Photos stay object-cover (never stretched).
 *
 * Authoritative Mine portrait aspect envelope (width / height):
 *   {@link PEOPLE_MINE_MEDIA_ASPECT_MIN} … {@link PEOPLE_MINE_MEDIA_ASPECT_MAX}
 */
export const PEOPLE_MINE_MEDIA_ASPECT_STRESS = 0.85;
/** Tallest allowed Mine frame (3:4) — never grow taller than this. */
export const PEOPLE_MINE_MEDIA_ASPECT_MIN = PEOPLE_CANDIDATE_MEDIA_ASPECT;
/** Squarest allowed Mine frame — stress ceiling. */
export const PEOPLE_MINE_MEDIA_ASPECT_MAX = PEOPLE_MINE_MEDIA_ASPECT_STRESS;

/**
 * Clamp Mine frame height so aspect stays in [ASPECT_MIN, ASPECT_MAX].
 *   maxH = frameW / 0.75  (tallest)
 *   minH = frameW / 0.85  (shortest)
 *
 * Pass `mediaBudgetH` (max height that fits the host) so short screens never
 * grow past the budget when enforcing the square ceiling.
 */
export function peopleMineClampFrameH(
  frameW: number,
  desiredH: number,
  mediaBudgetH: number = Number.POSITIVE_INFINITY
): { frameW: number; frameH: number; aspect: number } {
  if (!(frameW > 0)) {
    return { frameW: 0, frameH: Math.max(0, desiredH), aspect: PEOPLE_MINE_MEDIA_ASPECT_MIN };
  }
  const maxH = frameW / PEOPLE_MINE_MEDIA_ASPECT_MIN;
  const minH = frameW / PEOPLE_MINE_MEDIA_ASPECT_MAX;
  let frameH = Math.min(maxH, Math.max(0, desiredH));
  // Never taller than budget.
  if (Number.isFinite(mediaBudgetH) && mediaBudgetH >= 0) {
    frameH = Math.min(frameH, mediaBudgetH);
  }
  // If still squarer than MAX (H too small), prefer grow H within budget;
  // otherwise shrink W to hold MAX aspect.
  if (frameH + 0.5 < minH) {
    if (Number.isFinite(mediaBudgetH) && mediaBudgetH + 0.5 >= minH) {
      frameH = minH;
    } else {
      const h = Math.max(0, Number.isFinite(mediaBudgetH) ? mediaBudgetH : minH);
      frameH = h;
      frameW = h * PEOPLE_MINE_MEDIA_ASPECT_MAX;
    }
  }
  const aspect =
    frameH > 0 ? frameW / frameH : PEOPLE_MINE_MEDIA_ASPECT_MIN;
  return { frameW, frameH, aspect };
}

/**
 * Host aspect (hostH/hostW) band for Plans tall enrichment (and legacy helpers).
 * Mine horizontal sizing does NOT use tallFactor.
 */
export const PEOPLE_MINE_TALL_ASPECT_START = 1.85;
export const PEOPLE_MINE_TALL_ASPECT_SPAN = 0.45;

/**
 * Fixed Mine side composition (universal — not tallFactor / % driven):
 *   sideAlloc = visualSlot + gap  (= 40 + 14 = 54)
 *   portraitOuterW = hostW − 2×sideAlloc  (clamped to max / min)
 *
 * Visual face is a real card rectangle (not a thin pill strip).
 * Hit rail is separate and must not overlap the portrait.
 * CSS visible width is rotation-compensated so actual AABB gap ≈ gap token.
 */
/** Full visual card face width (px). */
export const PEOPLE_MINE_EDGE_FIXED_CARD_W_PX = 60;
/**
 * Edge height tracks portrait outer height:
 *   clamp(round(portraitOuterH × ratio), min, max)
 */
export const PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO = 0.58;
export const PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX = 210;
export const PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX = 280;
/** @deprecated Prefer {@link peopleMineEdgeCardHPx}. Floor of adaptive height. */
export const PEOPLE_MINE_EDGE_FIXED_CARD_H_PX =
  PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX;
/**
 * Side-slot budget for the card (before rotation inward).
 * With {@link PEOPLE_MINE_EDGE_FIXED_GAP_PX} sums to sideAlloc (portrait-safe).
 */
export const PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX = 40;
/** Target actual visual gap (AABB) from card → portrait outer. */
export const PEOPLE_MINE_EDGE_FIXED_GAP_PX = 14;
export const PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX =
  PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX + PEOPLE_MINE_EDGE_FIXED_GAP_PX;
/**
 * Plans fixed side-rail budget — same pixel family as Mine (visual + gap).
 * Portrait width = hostW − 2×side; no tallFactor.
 */
export const PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX =
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX;
/**
 * Interactive hit/layout width. ≥48px; may include off-screen bezel reach.
 * Must not extend past sideAlloc into the portrait.
 */
export const PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX = 48;
/** Card-like radius — not pill/capsule. Matches ~rem of compact Echo cards. */
export const PEOPLE_MINE_EDGE_FIXED_RADIUS_PX = 12;

/** Adaptive Mine edge-card height from portrait outer height. */
export function peopleMineEdgeCardHPx(portraitOuterH: number): number {
  if (!(portraitOuterH > 0)) return PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX;
  return Math.min(
    PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX,
    Math.max(
      PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX,
      Math.round(portraitOuterH * PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO)
    )
  );
}

/**
 * CSS `--mine-edge-visible` so rotated AABB inward ≈ visual slot (40),
 * keeping actual portrait gap ≈ {@link PEOPLE_MINE_EDGE_FIXED_GAP_PX} (14).
 * Resting on-screen face ≈ 40 − rotationInwardExtra (still a clear card body).
 */
export function peopleMineEdgeFixedCssVisiblePx(
  cardH: number = PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX
): number {
  const extra = mineEdgeRotationInwardExtraPx(
    cardH,
    PEOPLE_MINE_EDGE_FIXED_CARD_W_PX,
    PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG
  );
  return Math.max(
    0,
    Math.round(PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX - extra)
  );
}

/** Actual portrait↔card AABB gap after rest rotation (≈ GAP when CSS visible is compensated). */
export function peopleMineEdgeFixedActualGapPx(
  cardH: number = PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX
): number {
  const cssVisible = peopleMineEdgeFixedCssVisiblePx(cardH);
  const extra = mineEdgeRotationInwardExtraPx(
    cardH,
    PEOPLE_MINE_EDGE_FIXED_CARD_W_PX,
    PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG
  );
  return PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX - (cssVisible + extra);
}

/**
 * Edge-card layout / rest pose — Plans / legacy Mine path still use 104.
 * Mine fixed-rails path uses {@link PEOPLE_MINE_EDGE_FIXED_CARD_W_PX}.
 */
export const PEOPLE_MINE_EDGE_CARD_LAYOUT_W_PX = 104;
/** Matches CSS `min(46vh, 246px)` cap used by edge cards. */
export const PEOPLE_MINE_EDGE_CARD_H_CAP_PX = 246;
export const PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG = 5;

/**
 * Target visual gap (front-frame AABB ↔ rotated edge AABB) at tallFactor 0.
 * Tall hosts lerp toward {@link PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_PX}.
 * Plans / legacy only — Mine fixed rails use {@link PEOPLE_MINE_EDGE_FIXED_GAP_PX}.
 */
export const PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX = 22;
/** Tall-host visual AABB clearance target (tallFactor → 1). */
export const PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_PX = 14;
/**
 * Soft floor when gutter cannot hold the ideal visual gap (short baseline).
 * Tall soft floor lerps toward {@link PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_MIN_PX}.
 */
export const PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_MIN_PX = 20;
export const PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_MIN_PX = 12;

/** Short-host CSS edge-strip minimum (tallFactor → 0). Legacy / Plans. */
export const PEOPLE_MINE_EDGE_VISIBLE_MIN_PX = 28;
/** Tall-host CSS edge-strip minimum (tallFactor → 1). Hit target stays 104. */
export const PEOPLE_MINE_EDGE_VISIBLE_MIN_TALL_PX = 22;
export const PEOPLE_MINE_EDGE_VISIBLE_MAX_PX = 44;
/** Floor when gutter is tight — never force above visual clearance. */
export const PEOPLE_MINE_EDGE_VISIBLE_FLOOR_PX = 22;

/**
 * @deprecated Prefer PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX + rotation helper.
 * Kept as the derived CSS-strip gap (portrait-outer ↔ unrotated strip) for
 * older call sites: visual + rotExtra − stackPadX ≈ 22.
 */
export const PEOPLE_MINE_EDGE_CLEARANCE_PX = 22;

/**
 * @deprecated Preferred edge is derived from ratio gutter − rot − visual.
 * Ratio no longer drives exposure; kept for source compatibility.
 */
export const PEOPLE_MINE_EDGE_HOST_RATIO = 0.09;

function peopleMineClamp01(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t;
}

function peopleMineLerp(a: number, b: number, t: number): number {
  return a + (b - a) * peopleMineClamp01(t);
}

/**
 * Mine tallness 0…1 from carousel host aspect (hostH/hostW).
 * Short/compact → ~0; S24-Ultra-class tall → ~1. No device branching.
 */
export function peopleMineTallFactor(hostW: number, hostH: number): number {
  if (!(hostW > 0) || !(hostH > 0)) return 0;
  return peopleMineClamp01(
    (hostH / hostW - PEOPLE_MINE_TALL_ASPECT_START) /
      PEOPLE_MINE_TALL_ASPECT_SPAN
  );
}

/** Outer portrait / host ratio for a tallFactor. */
export function peopleMinePortraitRatio(tallFactor: number): number {
  return peopleMineLerp(
    PEOPLE_MINE_PORTRAIT_TO_HOST_W,
    PEOPLE_MINE_PORTRAIT_TO_HOST_W_TALL,
    tallFactor
  );
}

/** Authoritative visual AABB clearance for a tallFactor (integer px). */
export function peopleMineVisualClearancePx(tallFactor: number): number {
  return Math.round(
    peopleMineLerp(
      PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX,
      PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_PX,
      tallFactor
    )
  );
}

/** Soft clearance floor (overlap guard) for a tallFactor (integer px). */
export function peopleMineVisualClearanceMinPx(tallFactor: number): number {
  return Math.round(
    peopleMineLerp(
      PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_MIN_PX,
      PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_TALL_MIN_PX,
      tallFactor
    )
  );
}

/** CSS edge-strip minimum for a tallFactor (integer px; hit target stays 104). */
export function peopleMineEdgeVisibleMinPx(tallFactor: number): number {
  return Math.round(
    peopleMineLerp(
      PEOPLE_MINE_EDGE_VISIBLE_MIN_PX,
      PEOPLE_MINE_EDGE_VISIBLE_MIN_TALL_PX,
      tallFactor
    )
  );
}

/**
 * Inward AABB growth past the unrotated inner strip edge when the card
 * rotates about its outer vertical edge (transform-origin left/right center).
 *
 * visualInward ≈ cssVisible − W(1−cosθ) + (H/2)|sinθ|
 * → extra beyond cssVisible = −W(1−cosθ) + (H/2)|sinθ|
 */
export function mineEdgeRotationInwardExtraPx(
  cardH: number = PEOPLE_MINE_EDGE_CARD_H_CAP_PX,
  cardW: number = PEOPLE_MINE_EDGE_CARD_LAYOUT_W_PX,
  rotDeg: number = PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG
): number {
  if (!(cardW > 0) || !(cardH > 0)) return 0;
  const th = (Math.abs(rotDeg) * Math.PI) / 180;
  return -cardW * (1 - Math.cos(th)) + (cardH / 2) * Math.sin(th);
}

/**
 * Width-first front frame — Plans / legacy tallFactor path.
 * Omit hostH (or pass ≤0) for short-baseline geometry (tallFactor 0).
 */
export function peopleMineWidthFirstFrameW(
  hostW: number,
  hostH: number = 0
): number {
  if (!(hostW > 0)) return 0;
  const padX = PEOPLE_DISCOVER_STACK_PAD_X;
  const maxFrame = PEOPLE_MINE_MAX_SLIDE_W - 2 * padX;
  const ratio = peopleMinePortraitRatio(peopleMineTallFactor(hostW, hostH));
  return Math.min(Math.max(0, hostW * ratio - 2 * padX), maxFrame);
}

/**
 * Ideal CSS edge-strip width — Plans / legacy tallFactor path.
 */
export function peopleMinePreferredEdgeVisiblePx(
  hostW: number,
  hostH: number = 0
): number {
  const tall = peopleMineTallFactor(hostW, hostH);
  const edgeMin = peopleMineEdgeVisibleMinPx(tall);
  if (!(hostW > 0)) return edgeMin;
  const clearance = peopleMineVisualClearancePx(tall);
  const frameW = peopleMineWidthFirstFrameW(hostW, hostH);
  const gutter = Math.max(0, (hostW - frameW) / 2);
  const ideal = Math.round(
    gutter - mineEdgeRotationInwardExtraPx() - clearance
  );
  return Math.min(
    PEOPLE_MINE_EDGE_VISIBLE_MAX_PX,
    Math.max(edgeMin, ideal)
  );
}

/**
 * Plans full-width target front-frame width — FIXED side rails (no tallFactor).
 *
 *   portraitOuterW = min(hostW − 2×PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX, maxSlideW)
 *   frameW = portraitOuterW − 2×stackPadX
 *
 * hostH is ignored for width (height stress ladder may shrink later).
 * Mine keeps {@link peopleMineTargetFrameW} on its own token path.
 */
export function peoplePlansTargetFrameW(
  hostW: number,
  hostH: number = 0
): number {
  void hostH;
  if (!(hostW > 0)) return 0;
  const padX = PEOPLE_DISCOVER_STACK_PAD_X;
  const maxOuter = PEOPLE_MINE_MAX_SLIDE_W;
  const minOuter = PEOPLE_DISCOVER_MIN_FRAME_W + 2 * padX;
  const side = PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX;
  let portraitOuterW = hostW - 2 * side;
  portraitOuterW = Math.min(portraitOuterW, maxOuter);
  portraitOuterW = Math.max(portraitOuterW, Math.min(minOuter, hostW));
  const frameW = Math.max(0, portraitOuterW - 2 * padX);
  const maxFrame = maxOuter - 2 * padX;
  return Math.min(Math.max(frameW, 0), maxFrame);
}

/**
 * Mine full-width target front-frame width — FIXED side rails.
 *
 *   portraitOuterW = min(hostW − 2×(visual+gap), maxSlideW)
 *   frameW = portraitOuterW − 2×stackPadX
 *
 * No tallFactor / percentage ratio. Height stress may shrink below this later.
 */
export function peopleMineTargetFrameW(
  hostW: number,
  hostH: number = 0
): number {
  void hostH; // height used only by the stress ladder in metrics, not width.
  if (!(hostW > 0)) return 0;
  const padX = PEOPLE_DISCOVER_STACK_PAD_X;
  const maxOuter = PEOPLE_MINE_MAX_SLIDE_W;
  const minOuter = PEOPLE_DISCOVER_MIN_FRAME_W + 2 * padX;
  const side = PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX;
  let portraitOuterW = hostW - 2 * side;
  portraitOuterW = Math.min(portraitOuterW, maxOuter);
  portraitOuterW = Math.max(portraitOuterW, Math.min(minOuter, hostW));
  const frameW = Math.max(0, portraitOuterW - 2 * padX);
  const maxFrame = maxOuter - 2 * padX;
  return Math.min(Math.max(frameW, 0), maxFrame);
}

export type PeopleMineStackAssignment = {
  photoIndex: number;
  role: PeopleMineStackRole;
};

/**
 * Settled role map for front index `i`:
 * front=i, right=(i+1)%n, left=(i+2)%n (when present).
 */
export function peopleMineStackAssignments(
  photoCount: number,
  frontIndex: number
): PeopleMineStackAssignment[] {
  if (photoCount <= 0) return [];
  const i =
    ((frontIndex % photoCount) + photoCount) % photoCount;
  const out: PeopleMineStackAssignment[] = [{ photoIndex: i, role: "front" }];
  if (photoCount >= 2) {
    out.push({ photoIndex: (i + 1) % photoCount, role: "right" });
  }
  if (photoCount >= 3) {
    out.push({ photoIndex: (i + 2) % photoCount, role: "left" });
  }
  return out;
}

export function peopleMineCardTransform(role: PeopleMineStackRole): string {
  const p = PEOPLE_MINE_STACK_POSE[role];
  return `translate(-50%, -50%) translate(${p.xPct}%, ${p.yPct}%) rotate(${p.rotDeg}deg) scale(${p.scale})`;
}

export function peopleMineCardOpacity(_role: PeopleMineStackRole): number {
  // Opaque for all roles — opacity snaps at demotion end caused a visible hitch.
  return 1;
}

/**
 * Stack z for a card.
 * - 3+ photos: always destination settled order (front > right > left) for the
 *   whole flight so demoting A does not sit above C then snap under at settle.
 * - 2 photos: elevating promoting/demoting avoids the incoming front popping under.
 */
export function peopleMineCardZIndex(
  role: PeopleMineStackRole,
  motion: "settled" | "promoting" | "demoting" = "settled",
  photoCount = 2
): number {
  if (photoCount >= 3) {
    return PEOPLE_MINE_Z_SETTLED[role];
  }
  if (motion === "promoting") return PEOPLE_MINE_Z_PROMOTING;
  if (motion === "demoting") return PEOPLE_MINE_Z_DEMOTING;
  return PEOPLE_MINE_Z_SETTLED[role];
}

/**
 * Unit-frame bottom clearance for a Mine role (same corner math as Discover peeks).
 * Positive ⇒ rear bottom stays above front bottom at settle.
 */
export function peopleMinePoseBottomClearance(
  role: Exclude<PeopleMineStackRole, "front">
): number {
  const { xPct, yPct, rotDeg } = PEOPLE_MINE_STACK_POSE[role];
  const rad = (rotDeg * Math.PI) / 180;
  const tx = xPct / 100;
  const ty = yPct / 100;
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
 * Mounted <img> readiness: complete alone is insufficient.
 * Requires naturalWidth; decode() when supported (rejection ⇒ not ready).
 */
export function isMountedPhotoPaintReady(img: HTMLImageElement | null): boolean {
  if (!img) return false;
  if (!img.complete) return false;
  if (img.naturalWidth <= 0) return false;
  return true;
}

export async function ensureMountedPhotoDecoded(
  img: HTMLImageElement | null
): Promise<boolean> {
  if (!isMountedPhotoPaintReady(img) || !img) return false;
  if (typeof img.decode !== "function") return true;
  try {
    await img.decode();
    return isMountedPhotoPaintReady(img);
  } catch {
    return false;
  }
}

/**
 * Whether an async front-decode completion may update readiness.
 * Rejects outdated candidate/photo/current after rapid navigation.
 */
export function shouldAcceptMountedFrontDecode(args: {
  checkGeneration: number;
  currentGeneration: number;
  decodedPhotoIndex: number;
  displayedPhotoIndex: number;
  stillCurrent: boolean;
}): boolean {
  if (args.checkGeneration !== args.currentGeneration) return false;
  if (!args.stillCurrent) return false;
  return args.decodedPhotoIndex === args.displayedPhotoIndex;
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
  /** Portrait column width including stack pads (≤ slideW). */
  portraitW: number;
  /** Portrait column height including stack pads. */
  portraitH: number;
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
  /** Mine: slide spans host width; portrait stays centered/narrow. */
  fullWidthSlide: boolean;
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
   * Mine / Plans: distribute bounded surplus around the card.
   * Discover: leave legacy width-first + items-start behavior.
   */
  distributeVerticalSurplus?: boolean;
  /** Asymmetric top stack pad for upward peeks (Mine only). */
  upwardPeekPad?: boolean;
  /**
   * Mine / Plans: candidate slide = host width; portrait column stays narrower.
   * Neighbors leave the viewport by geometry (not opacity).
   */
  fullWidthSlide?: boolean;
  /**
   * Chrome reserve profile. Defaults from upwardPeekPad (mine) else discover.
   * Pass `"plans"` for open_plans (Plans chrome, not Mine 73px note).
   */
  chromeProfile?: PeopleDuoChromeProfile;
}): PeopleDiscoverCardMetrics {
  const { hostW, hostH } = input;
  const reserveChrome = input.reserveInFlowChrome !== false;
  const distributeSurplus = input.distributeVerticalSurplus === true;
  const upwardPeekPad = input.upwardPeekPad === true;
  const fullWidthSlide = input.fullWidthSlide === true;
  const chromeProfile: PeopleDuoChromeProfile =
    input.chromeProfile ?? (upwardPeekPad ? "mine" : "discover");
  const stackPadX = PEOPLE_DISCOVER_STACK_PAD_X;
  const stackPadY = PEOPLE_DISCOVER_STACK_PAD_Y;
  const stackPadYTop =
    chromeProfile === "mine" ? PEOPLE_MINE_STACK_PAD_Y_TOP : stackPadY;
  const chromeH = reserveChrome
    ? chromeProfile === "mine"
      ? PEOPLE_MINE_SOURCE_CHROME_H_PX +
        PEOPLE_MINE_TOP_GAP_PX +
        PEOPLE_MINE_NOTE_RESERVE_H_PX
      : chromeProfile === "plans"
        ? PEOPLE_PLANS_CHROME_H_PX
        : PEOPLE_DUO_SOURCE_CHROME_H_PX + PEOPLE_DUO_NOTE_RESERVE_H_PX
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
    portraitW: 0,
    portraitH: 0,
    neighborPeekPx: 0,
    neighborFacePeekPx: 0,
    contentH: 0,
    padTop: 0,
    padBottom: 0,
    unusedHostH: 0,
    fullWidthSlide,
  };
  if (hostW <= 0 || hostH <= 0) return empty;

  const outerPeek = peopleDuoOuterNeighborBudgetPx();
  let aspect = PEOPLE_CANDIDATE_MEDIA_ASPECT;
  let frameW: number;
  let portraitW: number;

  if (fullWidthSlide) {
    // Mine + Plans: fixed side rails (Plans no longer uses tallFactor width).
    frameW =
      chromeProfile === "plans"
        ? peoplePlansTargetFrameW(hostW, hostH)
        : peopleMineTargetFrameW(hostW, hostH);
    frameW = Math.max(frameW, PEOPLE_DISCOVER_MIN_FRAME_W);
    portraitW = frameW + 2 * stackPadX;
  } else {
    portraitW = Math.min(hostW - 2 * outerPeek, PEOPLE_DISCOVER_MAX_SLIDE_W);
    portraitW = Math.max(
      portraitW,
      Math.min(PEOPLE_DISCOVER_MIN_FRAME_W + 2 * stackPadX, hostW)
    );
    frameW = Math.max(0, portraitW - 2 * stackPadX);
  }

  let frameH = frameW / aspect;
  const mediaPadY = stackPadYTop + stackPadY;
  let mediaH = frameH + mediaPadY;
  let contentH = mediaH + chromeH;

  const maxSlideH = Math.max(0, hostH);
  if (contentH > maxSlideH && maxSlideH > 0) {
    const mediaBudget = Math.max(0, maxSlideH - chromeH);
    frameH = Math.max(0, mediaBudget - mediaPadY);
    frameW = frameH * aspect;
    if (fullWidthSlide) {
      // Prefer width-first target when height allows; never exceed it
      // (locks PREVIOUS/NEXT exposure + clearance).
      const targetW =
        chromeProfile === "plans"
          ? peoplePlansTargetFrameW(hostW, hostH)
          : peopleMineTargetFrameW(hostW, hostH);
      if (frameW > targetW && targetW > 0) {
        frameW = Math.max(PEOPLE_DISCOVER_MIN_FRAME_W, targetW);
        frameH = frameW / aspect;
        if (frameH + mediaPadY > mediaBudget) {
          frameH = Math.max(0, mediaBudget - mediaPadY);
          frameW = frameH * aspect;
        }
      }
      // Height still binds below target: 4:5, then modest Mine stress aspect.
      if (targetW > 0 && frameW + 0.5 < targetW) {
        const tryAspect = (nextAspect: number, prevW: number, prevH: number) => {
          aspect = nextAspect;
          let nextH = Math.max(0, mediaBudget - mediaPadY);
          let nextW = nextH * aspect;
          if (nextW > targetW) {
            nextW = Math.max(PEOPLE_DISCOVER_MIN_FRAME_W, targetW);
            nextH = nextW / aspect;
            if (nextH + mediaPadY > mediaBudget) {
              nextH = Math.max(0, mediaBudget - mediaPadY);
              nextW = nextH * aspect;
            }
          }
          if (nextW > prevW + 0.5) {
            frameW = nextW;
            frameH = nextH;
            return true;
          }
          aspect =
            prevW > 0 && prevH > 0 ? prevW / prevH : PEOPLE_CANDIDATE_MEDIA_ASPECT;
          frameW = prevW;
          frameH = prevH;
          return false;
        };
        tryAspect(PEOPLE_CANDIDATE_MEDIA_ASPECT_MIN, frameW, frameH);
        if (frameW + 0.5 < targetW) {
          tryAspect(PEOPLE_MINE_MEDIA_ASPECT_STRESS, frameW, frameH);
        }
        aspect = frameH > 0 ? frameW / frameH : aspect;
      }
      portraitW = frameW + 2 * stackPadX;
    } else {
      portraitW = frameW + 2 * stackPadX;
      const minPortraitW = Math.min(
        PEOPLE_DISCOVER_MIN_FRAME_W + 2 * stackPadX,
        hostW - 2 * Math.min(outerPeek, 12)
      );
      if (portraitW < minPortraitW && frameH > 0) {
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
        portraitW = frameW + 2 * stackPadX;
      }
    }

    mediaH = frameH + mediaPadY;
    contentH = Math.min(maxSlideH, mediaH + chromeH);
  }

  // Mine: when width-first leaves host height unused, grow frameH toward
  // fill — but never past the 3:4 tall envelope (aspect ≥ ASPECT_MIN).
  // Genuine leftover after clamp is split by peopleMineDistributeHostSurplus
  // (not stretch, not unusedHostH dump below the note).
  if (chromeProfile === "mine" && fullWidthSlide && hostH > 0) {
    const targetW = Math.max(
      peopleMineTargetFrameW(hostW, hostH),
      PEOPLE_DISCOVER_MIN_FRAME_W
    );
    const mediaBudget = Math.max(0, hostH - chromeH);
    const fillH = Math.max(0, mediaBudget - mediaPadY);
    const naturalH = targetW / PEOPLE_MINE_MEDIA_ASPECT_MIN;
    if (fillH + 0.5 >= naturalH) {
      const clamped = peopleMineClampFrameH(targetW, fillH, fillH);
      frameW = clamped.frameW;
      frameH = clamped.frameH;
      aspect = clamped.aspect;
      portraitW = frameW + 2 * stackPadX;
      mediaH = frameH + mediaPadY;
      contentH = Math.min(hostH, mediaH + chromeH);
    }
  }

  // Mine envelope safety — every path ends within [0.75, 0.85].
  if (chromeProfile === "mine" && fullWidthSlide && frameW > 0 && frameH > 0) {
    const mediaBudget = Math.max(0, hostH - chromeH);
    const budgetH = Math.max(0, mediaBudget - mediaPadY);
    const clamped = peopleMineClampFrameH(frameW, frameH, budgetH);
    if (
      Math.abs(clamped.frameH - frameH) > 0.05 ||
      Math.abs(clamped.frameW - frameW) > 0.05
    ) {
      frameW = clamped.frameW;
      frameH = clamped.frameH;
      aspect = clamped.aspect;
      portraitW = frameW + 2 * stackPadX;
      mediaH = frameH + mediaPadY;
      contentH = Math.min(hostH, mediaH + chromeH);
    }
  }

  // Vertical surplus pads — Mine and Plans each own an explicit branch.
  // Mine: ~50/50 around portrait+note (caption/Back/Connect stay fixed).
  // Plans: ~50/50 around the full portrait+chrome content block.
  // Discover (legacy): distributeMineSurplus remains a no-op (caps at 0).
  let padTop = 0;
  let padBottom = 0;
  if (distributeSurplus && chromeProfile === "mine") {
    // Round to whole px so CSS pads and returned contentH stay consistent.
    const surplus = Math.max(0, Math.round(hostH - contentH));
    const d = peopleMineDistributeHostSurplus(surplus);
    padTop = d.padTop;
    padBottom = d.padBottom;
  } else if (distributeSurplus && chromeProfile === "plans") {
    const surplus = Math.max(0, Math.round(hostH - contentH));
    const d = peoplePlansDistributeContentBlockSurplus(surplus);
    padTop = d.padTop;
    padBottom = d.padBottom;
  } else if (distributeSurplus) {
  const surplus = Math.max(0, hostH - contentH);
    const d = distributeMineSurplus(surplus);
    padTop = d.padTop;
    padBottom = d.padBottom;
  }

  const slideW = fullWidthSlide ? hostW : portraitW;
  const slideH = fullWidthSlide
    ? hostH
    : contentH + padTop + padBottom;
  const unusedHostH = Math.max(0, hostH - (contentH + padTop + padBottom));
  const portraitH = mediaH;

  const neighborPeekPx = fullWidthSlide
    ? 0
    : Math.max(0, (hostW - slideW) / 2);
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
    portraitW: Math.round(portraitW * 10) / 10,
    portraitH: Math.round(portraitH * 10) / 10,
    neighborPeekPx: Math.round(neighborPeekPx * 10) / 10,
    neighborFacePeekPx: Math.round(neighborFacePeekPx * 10) / 10,
    contentH: Math.round(contentH * 10) / 10,
    padTop,
    padBottom,
    unusedHostH: Math.round(unusedHostH * 10) / 10,
    fullWidthSlide,
  };
}

export const computePeopleDuoCardMetrics = computePeopleDiscoverCardMetrics;

export function isPeopleDiscoverMetricsReady(
  m: Pick<PeopleDiscoverCardMetrics, "slideW" | "slideH">
): boolean {
  return m.slideW > 0 && m.slideH > 0;
}

export const isPeopleDuoMetricsReady = isPeopleDiscoverMetricsReady;
