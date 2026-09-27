import type { CSSProperties } from "react";
import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

/** Shared squircle hero — height follows aspect ratio of current column width. */
export const PROFILE_HERO_ASPECT_HEIGHT = 1.04;

/**
 * Compact initial scale vs expanded card width (~75%).
 * Applied via discrete clamp endpoints (CSS cannot multiply nested min()).
 */
export const PROFILE_HERO_COMPACT_SCALE = 0.75;

/** Expanded (full) hero width. */
export const PROFILE_HERO_EXPANDED_WIDTH =
  "clamp(13.5rem, min(80vw, 40dvh), 19rem)";

/** Compact initial width ≈ 75% of expanded clamp. */
export const PROFILE_HERO_COMPACT_WIDTH =
  "clamp(10.125rem, min(60vw, 30dvh), 14.25rem)";

export function profileHeroColumnWidth(expanded: boolean): string {
  return expanded ? PROFILE_HERO_EXPANDED_WIDTH : PROFILE_HERO_COMPACT_WIDTH;
}

export const PROFILE_HERO_SIZE_STYLE: CSSProperties = {
  width: PROFILE_HERO_EXPANDED_WIDTH,
  aspectRatio: `1 / ${PROFILE_HERO_ASPECT_HEIGHT}`,
};

export const PROFILE_HERO_WRAPPER_CLASS =
  "relative mx-auto min-w-0 max-w-full overflow-visible";

/**
 * Breathing room under ProfileTopBar so the hanging member badge
 * clears the search chrome (Own + Other).
 */
export const PROFILE_HERO_TOP_PAD_CLASS = "pt-4";

/** Compact → expanded size reveal (width drives height via aspect). */
export const PROFILE_HERO_EXPAND_MS = 260;

export const PROFILE_HERO_EXPAND_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Full photo aspect for both compact and expanded (no vertical crop). */
export function profileHeroClipAspectRatio(_expanded?: boolean): string {
  void _expanded;
  return `1 / ${PROFILE_HERO_ASPECT_HEIGHT}`;
}

/** Padding-bottom % of current column width — always full composition height. */
export function profileHeroClipPaddingBottomPercent(
  _expanded?: boolean,
): number {
  void _expanded;
  return PROFILE_HERO_ASPECT_HEIGHT * 100;
}

export const PROFILE_HERO_SQUIRCLE_RADIUS = "rounded-[1.65rem]";
export const PROFILE_HERO_REAR_SQUIRCLE_RADIUS = "rounded-[1.5rem]";

/**
 * Horizontal inset expansion for stack peeks/fan.
 * Negative clip-path inset keeps the vertical frame full while
 * allowing lateral rear cards to paint outside the hero width box.
 */
export const PROFILE_HERO_STACK_CLIP_INSET_X_PERCENT = 14;

/** Squircle round used with clip-path (matches PROFILE_HERO_SQUIRCLE_RADIUS). */
export const PROFILE_HERO_CLIP_PATH_RADIUS = "1.65rem";

/**
 * Full-height frame via clip-path; horizontal peeks stay visible.
 * Prefer this over `overflow-hidden`, which also clips X transforms.
 */
export function profileHeroStackClipPath(): string {
  const x = PROFILE_HERO_STACK_CLIP_INSET_X_PERCENT;
  return `inset(0 -${x}% 0 -${x}% round ${PROFILE_HERO_CLIP_PATH_RADIUS})`;
}

/** In-flow reserve below hero card for Echo protrusion (half diameter + gap). */
export const PROFILE_HERO_ECHO_CLEARANCE_CLASS =
  "min-h-[clamp(1.375rem,4.5vw,1.75rem)]";

/** Tiny in-flow reserve so Echo-hugging nav hit areas do not steal identity taps. */
export const PROFILE_HERO_NAV_OVERHANG_CLASS = "h-3";

/** Visible previous/next nav controls when cycle has 2+ items. */
export function shouldShowProfileHeroCycleNav(cycleItemCount: number): boolean {
  return cycleItemCount >= 2;
}

/** Own Profile hero includes an Add slot while under the 3-photo max. */
export function ownProfileHeroShowsAddSlot(photoCount: number): boolean {
  return Math.max(0, photoCount) < PROFILE_PHOTOS_MAX;
}

/**
 * After a successful Own Profile hero add, show the first newly added photo
 * (former empty-slot index) rather than jumping to primary or remounting.
 */
export function deriveOwnProfileHeroCycleIndexAfterAdd(
  previousPhotoCount: number,
  nextPhotoCount: number,
): number {
  const prev = Math.max(0, previousPhotoCount);
  const next = Math.max(0, nextPhotoCount);
  if (next <= 0) return 0;
  if (next <= prev) return Math.min(prev, next - 1);
  return Math.min(prev, next - 1);
}

/** Wrap previous index within cycle length. */
export function deriveProfileHeroPrevIndex(
  currentIndex: number,
  cycleItemCount: number,
): number {
  if (cycleItemCount <= 0) return 0;
  const safe = Math.min(Math.max(0, currentIndex), cycleItemCount - 1);
  return (safe - 1 + cycleItemCount) % cycleItemCount;
}

/** Wrap next index within cycle length. */
export function deriveProfileHeroNextIndex(
  currentIndex: number,
  cycleItemCount: number,
): number {
  if (cycleItemCount <= 0) return 0;
  const safe = Math.min(Math.max(0, currentIndex), cycleItemCount - 1);
  return (safe + 1) % cycleItemCount;
}

/**
 * Front tap: expand first; only cycle once already expanded.
 * 1-item decks never cycle (caller still gates canCycle).
 */
export function profileHeroFrontTapAction(
  heroExpanded: boolean,
): "expand" | "cycle" {
  return heroExpanded ? "cycle" : "expand";
}

/* -------------------------------------------------------------------------- */
/* Card-slot stack (Profile-local; do not import People helpers)                */
/* -------------------------------------------------------------------------- */

export type ProfileHeroStackRole = "front" | "left" | "right";

export type ProfileHeroStackMotion = "settled" | "promoting" | "demoting";

export type ProfileHeroPose = {
  xPct: number;
  yPct: number;
  rotDeg: number;
  scale: number;
  opacity: number;
};

/** Shared origin so CSS transform interpolation stays predictable. */
export const PROFILE_HERO_CARD_TRANSFORM_ORIGIN = "50% 50%";

/**
 * Compact initial fan — same geometry as expanded so expand is a size
 * transition with a continuous stack (rear peeks visible from the start).
 */
export const PROFILE_HERO_STACK_POSE_COLLAPSED: Record<
  ProfileHeroStackRole,
  ProfileHeroPose
> = {
  front: { xPct: 0, yPct: 0, rotDeg: 0, scale: 1, opacity: 1 },
  right: { xPct: 10, yPct: -2, rotDeg: 5, scale: 0.95, opacity: 0.72 },
  left: { xPct: -10, yPct: -2, rotDeg: -5, scale: 0.95, opacity: 0.72 },
};

/** Expanded fan — approved geometry; do not retune without design review. */
export const PROFILE_HERO_STACK_POSE_EXPANDED: Record<
  ProfileHeroStackRole,
  ProfileHeroPose
> = {
  front: { xPct: 0, yPct: 0, rotDeg: 0, scale: 1, opacity: 1 },
  right: { xPct: 10, yPct: -2, rotDeg: 5, scale: 0.95, opacity: 0.72 },
  left: { xPct: -10, yPct: -2, rotDeg: -5, scale: 0.95, opacity: 0.72 },
};

/** Compact front: clean edge. */
export const PROFILE_HERO_CARD_BORDER_COLLAPSED =
  "border border-[var(--border)]/55";

/** Expanded card separation — dark: soft light edge; light: soft dark edge. */
export const PROFILE_HERO_CARD_BORDER_EXPANDED =
  "border app-dark:border-white/15 app-light:border-black/10";

/** Compact front shadow. */
export const PROFILE_HERO_CARD_SHADOW_COLLAPSED_FRONT =
  "shadow-[0_10px_28px_rgba(0,0,0,0.24)]";

/** Compact rear — same soft depth as expanded so the fan reads clearly. */
export const PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR =
  "shadow-[0_6px_14px_rgba(0,0,0,0.2)]";

/** Expanded soft depth — front slightly stronger than rear. */
export const PROFILE_HERO_CARD_SHADOW_EXPANDED_FRONT =
  "shadow-[0_8px_20px_rgba(0,0,0,0.28)]";

export const PROFILE_HERO_CARD_SHADOW_EXPANDED_REAR =
  "shadow-[0_6px_14px_rgba(0,0,0,0.2)]";

export function profileHeroCardBorderClass(expanded: boolean): string {
  return expanded
    ? PROFILE_HERO_CARD_BORDER_EXPANDED
    : PROFILE_HERO_CARD_BORDER_COLLAPSED;
}

export function profileHeroCardShadowClass(
  role: ProfileHeroStackRole,
  expanded: boolean,
): string {
  if (!expanded) {
    return role === "front"
      ? PROFILE_HERO_CARD_SHADOW_COLLAPSED_FRONT
      : PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR;
  }
  return role === "front"
    ? PROFILE_HERO_CARD_SHADOW_EXPANDED_FRONT
    : PROFILE_HERO_CARD_SHADOW_EXPANDED_REAR;
}

/** Settled z-order: left under right under front. */
export const PROFILE_HERO_Z_SETTLED: Record<ProfileHeroStackRole, number> = {
  left: 1,
  right: 2,
  front: 5,
};

/** Transition z: promoting passes above demoting front. */
export const PROFILE_HERO_Z_PROMOTING = 8;
export const PROFILE_HERO_Z_DEMOTING = 7;

export const PROFILE_HERO_CARD_EXCHANGE_MS = 280;
export const PROFILE_HERO_CARD_EXCHANGE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export type ProfileHeroStackAssignment = {
  itemIndex: number;
  role: ProfileHeroStackRole;
};

/**
 * Settled role map for front index `i`:
 * front=i, right=(i+1)%n, left=(i+2)%n (when present).
 * 1 → front only; 2 → front + right; 3 → front + left + right.
 */
export function profileHeroStackAssignments(
  itemCount: number,
  frontIndex: number,
): ProfileHeroStackAssignment[] {
  if (itemCount <= 0) return [];
  const i = ((frontIndex % itemCount) + itemCount) % itemCount;
  const out: ProfileHeroStackAssignment[] = [{ itemIndex: i, role: "front" }];
  if (itemCount >= 2) {
    out.push({ itemIndex: (i + 1) % itemCount, role: "right" });
  }
  if (itemCount >= 3) {
    out.push({ itemIndex: (i + 2) % itemCount, role: "left" });
  }
  return out;
}

export function profileHeroPoseForRole(
  role: ProfileHeroStackRole,
  expanded: boolean,
): ProfileHeroPose {
  return expanded
    ? PROFILE_HERO_STACK_POSE_EXPANDED[role]
    : PROFILE_HERO_STACK_POSE_COLLAPSED[role];
}

export function profileHeroCardTransform(
  role: ProfileHeroStackRole,
  expanded: boolean,
): string {
  const p = profileHeroPoseForRole(role, expanded);
  return `translate(-50%, -50%) translate(${p.xPct}%, ${p.yPct}%) rotate(${p.rotDeg}deg) scale(${p.scale})`;
}

export function profileHeroCardOpacity(
  role: ProfileHeroStackRole,
  expanded: boolean,
): number {
  return profileHeroPoseForRole(role, expanded).opacity;
}

export function profileHeroCardZIndex(
  role: ProfileHeroStackRole,
  motion: ProfileHeroStackMotion = "settled",
): number {
  if (motion === "promoting") return PROFILE_HERO_Z_PROMOTING;
  if (motion === "demoting") return PROFILE_HERO_Z_DEMOTING;
  return PROFILE_HERO_Z_SETTLED[role];
}

/**
 * Legacy peek helper — maps to collapsed left/right poses (depth unused).
 * Prefer {@link profileHeroCardTransform}.
 */
export function profileHeroPeekTransform(
  side: "left" | "right",
  _depth: number = 0,
): string {
  void _depth;
  return profileHeroCardTransform(side, false);
}
