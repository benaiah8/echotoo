/** Pixel slop so fractional scrollTop / layout rounding does not flicker fades. */
export const PROFILE_ACTION_SHEET_SCROLL_EDGE_THRESHOLD_PX = 3;

export type ProfileActionSheetScrollEdges = {
  canScrollUp: boolean;
  canScrollDown: boolean;
};

/**
 * Derive top/bottom fade visibility for the own-profile action sheet scroller.
 */
export function deriveProfileActionSheetScrollEdges(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx: number = PROFILE_ACTION_SHEET_SCROLL_EDGE_THRESHOLD_PX,
): ProfileActionSheetScrollEdges {
  const t = Math.max(0, thresholdPx);
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  const height = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  const client = Number.isFinite(clientHeight) ? clientHeight : 0;
  const overflow = height > client + t;
  if (!overflow) {
    return { canScrollUp: false, canScrollDown: false };
  }
  return {
    canScrollUp: top > t,
    canScrollDown: top < height - client - t,
  };
}
