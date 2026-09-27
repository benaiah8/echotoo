import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "./storage/utils/capacitorDetection";

/**
 * Closed-keyboard Finalize footer seat. Same values MetadataRow used to apply
 * as its own padding-bottom (Android nav breathing room / iOS home indicator).
 */
function closedFinalizeFooterPadCss(): string {
  if (isNativeApp() && isAndroid()) {
    return "max(22px, calc(var(--safe-area-bottom-layout, 0px) + 14px))";
  }
  if (isIOS()) {
    return "max(14px, min(30px, calc(var(--safe-area-bottom-layout, 0px) - 6px)))";
  }
  return "16px";
}

/**
 * Keyboard-open lift from the published `--create-keyboard-inset`.
 * Matches DM/invite: Android inset + 0.375rem; iOS subtracts capped safe-area
 * so body-resize + home indicator are not double-counted.
 * When the hook reports ~0 (WebView already resized), this collapses to the gap
 * only and max() with the closed seat keeps the footer on the safe area.
 */
function keyboardOpenFinalizeFooterPadCss(): string {
  if (isIOS()) {
    return "max(0.375rem, calc(var(--create-keyboard-inset, 0px) - min(24px, var(--safe-area-bottom-layout, 0px)) + 0.875rem))";
  }
  return "calc(var(--create-keyboard-inset, 0px) + 0.375rem)";
}

/** Single footer padding-bottom: closed safe-area seat vs keyboard inset, never both stacked. */
export function finalizeComposerFooterPadCss(): string {
  return `max(${closedFinalizeFooterPadCss()}, ${keyboardOpenFinalizeFooterPadCss()})`;
}
