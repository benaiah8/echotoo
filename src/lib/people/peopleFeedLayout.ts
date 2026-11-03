/**
 * People vertical feed layout tokens — presentation only.
 * Mirrors Home Post row geometry without importing Home components.
 */

import {
  CANONICAL_ECHO_PRESET_VALUES,
  deterministicEchoPresetForIdentity,
} from "../echoPresetAssignment";
import {
  resolveDisplayEchoPreset,
  resolveProfileIdentityMedia,
  type DisplayEchoPresetSource,
  type ProfileIdentityMediaSource,
} from "../profileIdentityMedia";

const FEED_ECHO_HARD_FALLBACK =
  CANONICAL_ECHO_PRESET_VALUES[0] ?? "preset:echo-owl-1";

/** Home feed page column. */
export const PEOPLE_FEED_MAX_W_PX = 640;

/**
 * Home page gutter (`--gutter`, currently 14px).
 * Applied on the feed list column like HomePage max-w wrappers.
 */
export const PEOPLE_FEED_GUTTER = "var(--gutter)";

/** Home Post article py-3. */
export const PEOPLE_FEED_ROW_PAD_Y_PX = 12;

/** Space below source header before media (Home media mt-3 ≈ 12px; keep compact). */
export const PEOPLE_FEED_SOURCE_TO_MEDIA_GAP_PX = 12;

/** Space above note under media. */
export const PEOPLE_FEED_MEDIA_TO_NOTE_GAP_PX = 8;

/** Home published media max height. */
export const PEOPLE_FEED_MEDIA_MAX_H = "40vh";

/** Home PublishedMediaSurface corner radius (`rounded-2xl`). */
export const PEOPLE_FEED_MEDIA_RADIUS = "1rem";

/** Right action rail width (touch targets ≥44). */
export const PEOPLE_FEED_RAIL_W_PX = 52;

/** Space between media column and rail. */
export const PEOPLE_FEED_RAIL_GAP_PX = 8;

/**
 * Feed stack pad — single flat frame; no peek room needed.
 */
export const PEOPLE_FEED_STACK_PAD_X_PX = 0;
export const PEOPLE_FEED_STACK_PAD_Y_TOP_PX = 0;
export const PEOPLE_FEED_STACK_PAD_Y_BOTTOM_PX = 0;

/** Compact Echo shell inside media frame (vs full-bleed initials). */
export const PEOPLE_FEED_ECHO_SHELL_CLASS =
  "flex h-[42%] max-h-[7.5rem] w-[42%] max-w-[7.5rem] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/50";

/**
 * Discover unified character card — ~10% shorter than 3:4 @ 40vh photo frame.
 * Tune card + figure together via CSS vars on the feed root.
 */
export const PEOPLE_DISCOVER_CHARACTER_MAX_H = "36vh";
export const PEOPLE_DISCOVER_CHARACTER_ASPECT = "4 / 5";
export const PEOPLE_DISCOVER_CHARACTER_MIN_H = "min(220px, 52vw)";
export const PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_H = "min(11rem, 44vw)";
export const PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_W = "16rem";
export const PEOPLE_DISCOVER_CHARACTER_NAME_GAP_PX = 12;
export const PEOPLE_DISCOVER_CHARACTER_PAD_TOP_PX = 16;
export const PEOPLE_DISCOVER_CHARACTER_PAD_BOTTOM_PX = 20;

/**
 * Discover profile photos match the saved 4:5 crop.
 * Width stays within the column; height follows aspect (no 40vh crop).
 */
export const PEOPLE_DISCOVER_PHOTO_ASPECT = "4 / 5";
export const PEOPLE_DISCOVER_PHOTO_MAX_W = "26rem";

/** 1px inset ring. `--text` flips with light/dark, so one rule covers both. */
export const PEOPLE_DISCOVER_MEDIA_INSET_BORDER =
  "inset 0 0 0 1px color-mix(in oklab, var(--text) 16%, transparent)";

/**
 * Neutral Echo seed when no permitted person id (e.g. anonymous Open Plan).
 * Pass opportunity_id only — never a restricted creator id.
 */
export const PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE = "people-feed-neutral:";

/** Top category nav content height (pill row). */
export const PEOPLE_FEED_TOP_NAV_H_PX = 40;

/** Optical gap below safe-area before the category pill. */
export const PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX = 10;

/** Gap below top nav before first row. */
export const PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX = 10;

/**
 * People category pill max width — room for four icon+label segments.
 * Always clamp with available gutters (320-safe).
 */
export const PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX = 372;

/**
 * Paint-only top fade extends this far below `--safe-area-top-layout`.
 * Matches HomeTopBar browse fade band (~66px); must not cover first feed media.
 */
export const PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX = 56;

/** Fixed part of {@link peopleFeedContentTopPad} (excludes safe-area). */
export const PEOPLE_FEED_CONTENT_TOP_PAD_FIXED_PX =
  PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX +
  PEOPLE_FEED_TOP_NAV_H_PX +
  PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX;

export function parsePeopleLayoutPx(value: string): number {
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Pixel equivalent of {@link peopleFeedContentTopPad} for metrics (one safe-area). */
export function peopleFeedContentTopPadPx(safeAreaTopPx: number): number {
  const safe =
    Number.isFinite(safeAreaTopPx) && safeAreaTopPx > 0 ? safeAreaTopPx : 0;
  return PEOPLE_FEED_CONTENT_TOP_PAD_FIXED_PX + safe;
}

export function readPeopleSafeAreaTopPx(el: Element | null | undefined): number {
  if (!el || typeof getComputedStyle !== "function") return 0;
  return parsePeopleLayoutPx(
    getComputedStyle(el).getPropertyValue("--safe-area-top-layout")
  );
}

/**
 * Duo-modern: visual host includes the nav band; metrics keep the pre-frost
 * height so portrait envelope and max-scroll stay unchanged.
 */
export function peopleDuoModernMetricsHostH(
  visualHostH: number,
  topInsetPx: number
): number {
  if (!(visualHostH > 0) || !Number.isFinite(visualHostH)) return 0;
  const inset =
    Number.isFinite(topInsetPx) && topInsetPx > 0 ? topInsetPx : 0;
  return Math.max(0, visualHostH - inset);
}

/** Discover person appearance vertical pad (between people). */
export const PEOPLE_DISCOVER_PERSON_PAD_Y_PX = 20;

/** True when Discover uses the 3:4 photo frame (uploaded photos or legacy URL). */
export function discoverPersonUsesPhotoFrame(
  source: ProfileIdentityMediaSource
): boolean {
  const resolved = resolveProfileIdentityMedia(source);
  if (resolved.kind === "photos" && resolved.photos.length > 0) return true;
  if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) return true;
  return false;
}

/** @deprecated Prefer discoverPersonUsesPhotoFrame */
export function discoverPersonHasProfilePhotos(
  source: ProfileIdentityMediaSource
): boolean {
  const resolved = resolveProfileIdentityMedia(source);
  return resolved.kind === "photos" && resolved.photos.length > 0;
}

/** Echo / empty — unified character card (not 3:4 photo frame). */
export function discoverPersonUsesCharacterCard(
  source: ProfileIdentityMediaSource
): boolean {
  return !discoverPersonUsesPhotoFrame(source);
}

/** Caption clamp for feed rows (product: two lines). */
export const PEOPLE_FEED_CAPTION_CLAMP_CLASS =
  "min-h-0 overflow-hidden [overflow-wrap:anywhere] line-clamp-2";

/** Home-matching source caption classes. */
export const PEOPLE_FEED_CAPTION_TEXT_CLASS =
  "text-[13px] leading-snug text-[var(--text)]/90";

/**
 * Shared personal-note accent for Open Plans + Discover opportunity notes.
 * Soft contrasting gray surface + thin brand left edge + padding.
 * No nested outline/shadow card. Omit when empty. Duo strip stays separate.
 */
export const PEOPLE_PERSONAL_NOTE_ACCENT_CLASS = [
  "mt-2 rounded-r-md border-l-2 px-3 py-2",
  "border-[color-mix(in_oklab,var(--brand-readable)_58%,transparent)]",
  "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]",
  "app-dark:border-[color-mix(in_oklab,var(--brand)_72%,transparent)]",
  "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]",
].join(" ");

/** Shared personal-note body text (multiline + wrap). */
export const PEOPLE_PERSONAL_NOTE_TEXT_CLASS =
  "whitespace-pre-wrap break-words text-[12.5px] leading-snug text-[var(--text)]/88 [overflow-wrap:anywhere] app-dark:text-[var(--text)]/90";

/**
 * Resolve Echo for feed empty / broken media.
 * Prefers assigned/deterministic person Echo; else neutral seed (opportunity id).
 */
/** Stable neutral Echo seed for Discover character cards (per person, not opportunity). */
export function discoverNeutralEchoSeedForPerson(personKey: string): string {
  const key = typeof personKey === "string" ? personKey.trim() : "";
  return key
    ? `${PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE}${key}`
    : `${PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE}default`;
}

export function resolvePeopleFeedEchoPreset(
  source: DisplayEchoPresetSource,
  neutralSeed?: string | null
): string {
  const assigned = resolveDisplayEchoPreset(source);
  if (assigned) return assigned;
  const seed = typeof neutralSeed === "string" ? neutralSeed.trim() : "";
  const key = seed
    ? `${PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE}${seed}`
    : `${PEOPLE_FEED_NEUTRAL_ECHO_NAMESPACE}default`;
  return deterministicEchoPresetForIdentity(key) ?? FEED_ECHO_HARD_FALLBACK;
}

/**
 * CSS variables applied on the People feed scroll root / content pane.
 * Tunable without touching fetch / match logic.
 */
export function peopleFeedCssVars(): Record<string, string> {
  return {
    "--people-feed-max-w": `${PEOPLE_FEED_MAX_W_PX}px`,
    "--people-feed-gutter": PEOPLE_FEED_GUTTER,
    "--people-feed-row-pad-y": `${PEOPLE_FEED_ROW_PAD_Y_PX}px`,
    "--people-feed-source-gap": `${PEOPLE_FEED_SOURCE_TO_MEDIA_GAP_PX}px`,
    "--people-feed-note-gap": `${PEOPLE_FEED_MEDIA_TO_NOTE_GAP_PX}px`,
    "--people-feed-media-max-h": PEOPLE_FEED_MEDIA_MAX_H,
    "--people-feed-media-radius": PEOPLE_FEED_MEDIA_RADIUS,
    "--people-feed-rail-w": `${PEOPLE_FEED_RAIL_W_PX}px`,
    "--people-feed-rail-gap": `${PEOPLE_FEED_RAIL_GAP_PX}px`,
    "--people-feed-stack-pad-x": `${PEOPLE_FEED_STACK_PAD_X_PX}px`,
    "--people-feed-stack-pad-y-top": `${PEOPLE_FEED_STACK_PAD_Y_TOP_PX}px`,
    "--people-feed-stack-pad-y-bottom": `${PEOPLE_FEED_STACK_PAD_Y_BOTTOM_PX}px`,
    "--people-feed-top-nav-h": `${PEOPLE_FEED_TOP_NAV_H_PX}px`,
    "--people-feed-top-nav-safe-gap": `${PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX}px`,
    "--people-discover-person-pad-y": `${PEOPLE_DISCOVER_PERSON_PAD_Y_PX}px`,
    "--people-discover-character-max-h": PEOPLE_DISCOVER_CHARACTER_MAX_H,
    "--people-discover-character-aspect": PEOPLE_DISCOVER_CHARACTER_ASPECT,
    "--people-discover-character-min-h": PEOPLE_DISCOVER_CHARACTER_MIN_H,
    "--people-discover-character-figure-max-h":
      PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_H,
    "--people-discover-character-figure-max-w":
      PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_W,
    "--people-discover-character-name-gap": `${PEOPLE_DISCOVER_CHARACTER_NAME_GAP_PX}px`,
    "--people-discover-character-pad-t": `${PEOPLE_DISCOVER_CHARACTER_PAD_TOP_PX}px`,
    "--people-discover-character-pad-b": `${PEOPLE_DISCOVER_CHARACTER_PAD_BOTTOM_PX}px`,
    "--people-discover-photo-aspect": PEOPLE_DISCOVER_PHOTO_ASPECT,
    "--people-discover-photo-max-w": PEOPLE_DISCOVER_PHOTO_MAX_W,
    "--people-mine-portrait-w": "100%",
    "--people-mine-portrait-h": "var(--people-feed-media-max-h)",
    "--people-mine-surplus-pad-top": "0px",
  };
}

/** Bottom pad so content clears global BottomTab. */
export function peopleFeedContentBottomPad(): string {
  return "calc(64px + var(--safe-area-bottom-layout, 0px) + 12px)";
}

/**
 * Top pad: safe-area + optical gap + nav height + list gap.
 * Single use of --safe-area-top-layout (no double env() inset).
 */
export function peopleFeedContentTopPad(): string {
  return `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX}px + ${PEOPLE_FEED_TOP_NAV_H_PX}px + ${PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX}px)`;
}

/**
 * Duo-modern in-slide spacer under the category pill.
 * Same safe-area + optical gap + nav height as {@link peopleFeedContentTopPad},
 * without {@link PEOPLE_FEED_TOP_NAV_TO_LIST_GAP_PX}. Discover list spacing
 * stays on {@link peopleFeedContentTopPad}. Portrait metrics still subtract
 * {@link peopleFeedContentTopPadPx}.
 */
export function peopleDuoModernScrollTopInset(): string {
  return `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX}px + ${PEOPLE_FEED_TOP_NAV_H_PX}px)`;
}

/** Absolute top for the category nav pill. */
export function peopleFeedTopNavOffset(): string {
  return `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_FEED_TOP_NAV_SAFE_GAP_PX}px)`;
}
