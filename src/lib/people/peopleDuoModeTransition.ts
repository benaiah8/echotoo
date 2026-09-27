/**
 * People primary destination (Duo / Discover / Plans / Groups) vertical
 * transition helpers. Horizontal Embla stays isolated — this only drives
 * destination-content translateY.
 */

import type { MatchDeckPairUpScope } from "../matchDeckSession";
import { prefersPeopleMotionReduce } from "./peopleCandidateMediaPresentation";

export const PEOPLE_DUO_MODE_TRANSITION_MS = 220;
export const PEOPLE_DUO_MODE_TRAVEL_PX = 36;

/**
 * Locked visual order matching bottom nav:
 * Duo → Discover → Plans → Groups.
 */
export const PEOPLE_DUO_MODE_ORDER = [
  "my_plans",
  "discover",
  "open_plans",
  "groups",
] as const;

/** @deprecated Alias — same as PEOPLE_DUO_MODE_ORDER. */
export const PEOPLE_PRIMARY_DESTINATION_ORDER = PEOPLE_DUO_MODE_ORDER;

export type PeoplePrimaryScope = (typeof PEOPLE_DUO_MODE_ORDER)[number];

export type DuoModeTransitionDirection = 1 | -1 | 0;
export type DuoModeTransitionPhase = "idle" | "out" | "in";

export function duoModeOrderIndex(scope: PeoplePrimaryScope): number {
  return (PEOPLE_DUO_MODE_ORDER as readonly string[]).indexOf(scope);
}

/**
 * Forward (1): content exits up, next enters from below.
 * Backward (-1): content exits down, previous enters from above.
 * Non-adjacent uses the same order delta (e.g. Duo→Groups = forward).
 */
export function duoModeTransitionDirection(
  from: PeoplePrimaryScope,
  to: PeoplePrimaryScope
): DuoModeTransitionDirection {
  const a = duoModeOrderIndex(from);
  const b = duoModeOrderIndex(to);
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}

export function prefersDuoModeMotionReduce(): boolean {
  return prefersPeopleMotionReduce();
}

export function duoModeEnterFromY(
  direction: DuoModeTransitionDirection,
  reduceMotion: boolean
): number {
  if (reduceMotion || direction === 0) return 0;
  return direction > 0 ? PEOPLE_DUO_MODE_TRAVEL_PX : -PEOPLE_DUO_MODE_TRAVEL_PX;
}

export function duoModeExitToY(
  direction: DuoModeTransitionDirection,
  reduceMotion: boolean
): number {
  if (reduceMotion || direction === 0) return 0;
  return direction > 0 ? -PEOPLE_DUO_MODE_TRAVEL_PX : PEOPLE_DUO_MODE_TRAVEL_PX;
}

/** Pair-up scopes only (session / deck data) — excludes Groups. */
export function isPairUpPrimaryScope(
  scope: PeoplePrimaryScope
): scope is MatchDeckPairUpScope {
  return scope === "my_plans" || scope === "discover" || scope === "open_plans";
}
