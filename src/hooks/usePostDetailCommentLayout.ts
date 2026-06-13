import type { CSSProperties } from "react";
import { isAndroid } from "../lib/storage/utils/capacitorDetection";

/**
 * Matches {@link KEYBOARD_LIFT_SCROLL_THRESHOLD_PX} in FloatingCommentInput — keyboard "open"
 * for layout that mirrors the modal composer (pill uses 0 safe bottom when open).
 */
export const POST_DETAIL_MODAL_KEYBOARD_SCROLL_THRESHOLD_PX = 48;

/** Modal gradient band base (see FloatingCommentInput modal branch). */
const MODAL_COMPOSER_GRADIENT_BASE_PX = 88;
/** Space between gradient top and pill row bottom offset — keep in sync with composer `bottom` calc. */
export const MODAL_COMPOSER_PILL_BOTTOM_GAP_PX = 14;
const MODAL_COMPOSER_PILL_OFFSET_PX = MODAL_COMPOSER_PILL_BOTTOM_GAP_PX;
/** Approx. pill row + image preview headroom (scroll only; avoids clipping last comment). */
const MODAL_COMPOSER_PILL_STACK_RESERVE_PX = 72;
const MODAL_COMPOSER_SCROLL_BREATHING_PX = 12;

/** Fallback reserve when scroll-root padding-bottom is not yet computed (matches closed-state base). */
export const MODAL_COMPOSER_SCROLL_RESERVE_FALLBACK_PX =
  MODAL_COMPOSER_GRADIENT_BASE_PX +
  MODAL_COMPOSER_PILL_OFFSET_PX +
  MODAL_COMPOSER_PILL_STACK_RESERVE_PX +
  MODAL_COMPOSER_SCROLL_BREATHING_PX;

/**
 * Bottom padding for `[data-post-detail-modal-scroll]` so in-flow comments clear the
 * docked composer + keyboard lift + safe area (chat-like: scroll layer is sibling to composer).
 *
 * @param keyboardInsetPx — raw inset from {@link useCreateKeyboardInset}; rounded and compared
 *   to {@link POST_DETAIL_MODAL_KEYBOARD_SCROLL_THRESHOLD_PX} for keyboard-open vs closed.
 */
export function getPostDetailModalCommentScrollPaddingBottom(
  keyboardInsetPx: number
): NonNullable<CSSProperties["paddingBottom"]> {
  const kbRounded = Math.max(0, Math.round(keyboardInsetPx));
  const kbOpen = kbRounded >= POST_DETAIL_MODAL_KEYBOARD_SCROLL_THRESHOLD_PX;
  const base = MODAL_COMPOSER_SCROLL_RESERVE_FALLBACK_PX;

  /** Android WebView resize: reserve composer band only — do not add keyboardInsetPx. */
  if (isAndroid()) {
    if (kbOpen) {
      return `${base}px`;
    }
    return `calc(${base}px + env(safe-area-inset-bottom, 0px))`;
  }

  if (kbOpen) {
    return `calc(${base}px + ${kbRounded}px)`;
  }
  return `calc(${base}px + env(safe-area-inset-bottom, 0px) + ${kbRounded}px)`;
}
