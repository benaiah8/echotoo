/**
 * Vertical swipe-only dismiss contracts for SocialActionToast.
 * UP / DOWN dismiss; horizontal does nothing. No free 2D drag.
 */

export const SOCIAL_ACTION_TOAST_VERTICAL_MIN_PX = 40;
/** Vertical must dominate horizontal: abs(dy) > abs(dx) * ratio */
export const SOCIAL_ACTION_TOAST_VERTICAL_DOMINANCE = 1.15;
export const SOCIAL_ACTION_TOAST_EXIT_MS = 200;
export const SOCIAL_ACTION_TOAST_EXIT_EASE =
  "cubic-bezier(0.22, 1, 0.36, 1)";

export type SocialActionToastVerticalDismiss = "up" | "down" | null;

/** True when the event target is an action control — do not arm toast swipe. */
export function isSocialActionToastControlTarget(
  target: EventTarget | null
): boolean {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }
  return Boolean(
    (target as Element).closest(
      "button, a, [role='button'], input, textarea, select"
    )
  );
}

/**
 * Clear vertical swipe intent only.
 * Horizontal / short / diagonal-horizontal → null (toast stays put).
 */
export function resolveSocialActionToastVerticalDismiss(
  dx: number,
  dy: number,
  minPx: number = SOCIAL_ACTION_TOAST_VERTICAL_MIN_PX,
  dominance: number = SOCIAL_ACTION_TOAST_VERTICAL_DOMINANCE
): SocialActionToastVerticalDismiss {
  const ay = Math.abs(dy);
  const ax = Math.abs(dx);
  if (ay < minPx) return null;
  if (ay <= ax * dominance) return null;
  return dy < 0 ? "up" : "down";
}

export function socialActionToastExitDurationMs(
  reducedMotion: boolean
): number {
  return reducedMotion ? 0 : SOCIAL_ACTION_TOAST_EXIT_MS;
}
