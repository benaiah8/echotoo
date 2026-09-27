/**
 * People primary Duo/Groups — Feed social-pill construction inside an
 * outline-only pill frame. Selection lives on the inner button only.
 */

import {
  SOCIAL_PILL_RADIUS,
  socialPillActiveGlowClassName,
  socialPillExtrusionClassName,
  socialPillFaceClassName,
  socialPillHitClassName,
  socialPillStackClassName,
  type SocialPillTone,
} from "../../lib/socialActionUi";

/** Shared simple pill cradle (Duo === Groups). */
export const PEOPLE_PRIMARY_HOUSING_RADIUS_DUO = "rounded-full";
export const PEOPLE_PRIMARY_HOUSING_RADIUS_GROUPS = "rounded-full";

/** @deprecated Prefer PEOPLE_PRIMARY_HOUSING_RADIUS_DUO */
export const PEOPLE_PRIMARY_HOUSING_RADIUS =
  PEOPLE_PRIMARY_HOUSING_RADIUS_DUO;

/**
 * Fixed Duo/Groups face box — sync with PEOPLE_END_FACE_W_CSS (4.375rem).
 * Static Tailwind strings (JIT); do not interpolate.
 */
const PEOPLE_PRIMARY_FACE_W_CLASS =
  "w-[4.375rem] min-w-[4.375rem] max-w-[4.375rem] shrink-0 !px-3";

/** Hit wrapper — Duo === Groups; state does not resize. */
export function peopleNavPrimaryHitClassName(className = ""): string {
  return socialPillHitClassName(
    [
      "people-nav-primary-hit",
      "box-border h-9 w-[calc(4.375rem+5px)] min-w-[calc(4.375rem+5px)] max-w-[calc(4.375rem+5px)]",
      className,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function peopleNavPrimaryStackClassName(): string {
  return socialPillStackClassName();
}

/** Exact Feed extrusion (active = green; passive = muted yellow family). */
export function peopleNavPrimaryExtrusionClassName(active: boolean): string {
  const tone: SocialPillTone = active ? "active" : "inactive";
  return socialPillExtrusionClassName(tone);
}

/** Exact Feed active glow (paint-only; no People-specific glow system). */
export function peopleNavPrimaryActiveGlowClassName(): string {
  return socialPillActiveGlowClassName();
}

/**
 * Outer housing — outline-only pill frame (state-invariant).
 * No fill — active Duo/Groups buttons carry emphasis.
 */
export function peopleNavPrimaryHousingClassName(
  _side: "left" | "right" = "left"
): string {
  void _side;
  return [
    "people-nav-primary-housing inline-flex shrink-0 items-center justify-center",
    "overflow-visible",
    PEOPLE_PRIMARY_HOUSING_RADIUS_DUO,
    "box-border",
    /* pad 3×2 — sync with PEOPLE_END_HOUSING_PAD_* */
    "px-[3px] py-0.5",
    "bg-transparent",
    /* Light: subtle dark outline · Dark: lighter cool outline on black */
    "border border-[rgba(11,11,12,0.22)]",
    "app-dark:border-[rgba(255,255,255,0.42)]",
  ].join(" ");
}

/**
 * Exact Feed face colors + press; People adds fixed Groups-based width.
 * Passive: brand 68% into --text. Active: full --brand + green extrusion.
 */
export function peopleNavPrimaryFaceClassName(active: boolean): string {
  const tone: SocialPillTone = active ? "active" : "inactive";
  return [
    "people-nav-primary-face",
    socialPillFaceClassName({
      tone,
      size: "feed",
      className: PEOPLE_PRIMARY_FACE_W_CLASS,
    }),
  ].join(" ");
}

/** Exported for tests — documents Feed radius reused by the inner face. */
export function peopleNavPrimaryFaceRadiusToken(): string {
  return SOCIAL_PILL_RADIUS;
}
