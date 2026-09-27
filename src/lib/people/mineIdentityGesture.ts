import { PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX } from "./peopleCandidateMediaPresentation";

/** Pure helper — Mine identity name/bio drag-vs-tap suppression. */
export function peopleIdentityMovedPastTapThreshold(
  origin: { x: number; y: number },
  x: number,
  y: number,
  thresholdPx: number = PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX
): boolean {
  return (
    Math.abs(x - origin.x) > thresholdPx || Math.abs(y - origin.y) > thresholdPx
  );
}

/**
 * Mine Embla watchDrag allow-list: fullscreen excluded; identity name/bio allowed.
 * Accepts any object with `closest` so Vitest (node) can unit-test without a DOM.
 */
export function peopleMineEmblaAllowsDragFromTarget(
  locked: boolean,
  target: EventTarget | null
): boolean {
  if (locked) return false;
  if (
    !target ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return true;
  }
  return !(target as Element).closest("[data-people-mine-fullscreen-hit]");
}
