/**
 * Shared overlay-swipe terminal decisions.
 * Interruptions (pointercancel, lost pointer, touchcancel) never commit.
 * A second call after the terminal is claimed is ignored.
 */

export type OverlaySwipeTerminalKind = "up" | "interrupt";

export type ContentSwipeTerminalAction = "ignore" | "clear" | "snap" | "commit";

export function writeOverlayTranslateRef(
  ref: { current: number },
  next: number,
): void {
  ref.current = next;
}

export function decideContentSwipeTerminal(input: {
  alreadyClaimed: boolean;
  alreadyCommitted: boolean;
  mode: "undecided" | "horizontal" | "cancelled";
  kind: OverlaySwipeTerminalKind;
  releaseDx: number;
  commitThresholdPx: number;
  visualActive: boolean;
}): ContentSwipeTerminalAction {
  if (input.alreadyClaimed || input.alreadyCommitted) return "ignore";
  const displaced = input.visualActive || input.releaseDx > 0;
  if (input.kind === "interrupt" || input.mode !== "horizontal") {
    return displaced ? "snap" : "clear";
  }
  if (input.releaseDx >= input.commitThresholdPx) return "commit";
  return displaced ? "snap" : "clear";
}

export function decideEdgeSwipeTerminal(input: {
  kind: OverlaySwipeTerminalKind;
  mode: "undecided" | "horizontal" | "cancelled";
  translateX: number;
  commitThresholdPx: number;
  commitRatio: number;
}): "snap" | "commit" {
  if (input.kind === "interrupt" || input.mode !== "horizontal") return "snap";
  const threshold = input.commitThresholdPx * input.commitRatio;
  if (input.translateX >= threshold) return "commit";
  return "snap";
}
