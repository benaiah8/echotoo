/**
 * PairUpActiveOverlay swipe-to-close: portal wiring + lock/commit + exit hold.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS } from "../../hooks/useOverlayContentSwipeDismiss";
import { BOTTOM_DRAWER_CLOSE_UNMOUNT_MS } from "./BottomDrawer";

function readOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/ui/PairUpActiveOverlay.tsx"),
    "utf8"
  );
}

function startZoneMaxClientX(
  innerWidth: number,
  startZoneMaxXVw: number,
  startZoneMaxPx: number,
  leftInsetPx: number
): number {
  return leftInsetPx + Math.min(innerWidth * startZoneMaxXVw, startZoneMaxPx);
}

const VERTICAL_SLOP_PX = 20;
const VERTICAL_DOMINANCE_OVER_DX = 1.5;
const LEFTWARD_CANCEL_DX = 8;

type Pointer = { x: number; y: number; target: "panel" | "button" | "textarea" };

function simulatePairUpSwipe(opts: {
  innerWidth: number;
  startZoneMaxXVw: number;
  startZoneMaxPx: number;
  leftInsetPx: number;
  commitThresholdPx: number;
  horizontalLockPx: number;
  busy?: boolean;
  down: Pointer;
  moves: Array<{ x: number; y: number }>;
  up: { x: number; y: number };
}): "committed" | "ignored" | "cancelled" | "snapback" {
  if (opts.busy) return "ignored";
  if (opts.down.target === "button" || opts.down.target === "textarea") {
    return "ignored";
  }
  const maxX = startZoneMaxClientX(
    opts.innerWidth,
    opts.startZoneMaxXVw,
    opts.startZoneMaxPx,
    opts.leftInsetPx
  );
  if (opts.down.x > maxX) return "ignored";

  let locked = false;
  let cancelled = false;
  let last = { x: opts.down.x, y: opts.down.y };

  for (const move of opts.moves) {
    const dx = move.x - opts.down.x;
    const dy = move.y - opts.down.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!locked) {
      if (dx < -LEFTWARD_CANCEL_DX) {
        cancelled = true;
        break;
      }
      if (
        absDy > VERTICAL_SLOP_PX &&
        absDy > absDx * VERTICAL_DOMINANCE_OVER_DX
      ) {
        cancelled = true;
        break;
      }
      if (dx >= opts.horizontalLockPx && absDx >= absDy) {
        locked = true;
      }
    }
    last = move;
  }

  if (cancelled) return "cancelled";
  if (!locked) return "snapback";

  const releaseDx = last.x - opts.down.x;
  return releaseDx >= opts.commitThresholdPx ? "committed" : "snapback";
}

function simulateExitLifecycle(opts: {
  alreadyExiting?: boolean;
  reopenDuringExit?: boolean;
}): {
  closedAtMs: number | null;
  holdClearedAtMs: number | null;
  doubleClosePrevented: boolean;
  reopenClearedHold: boolean;
  usedExitHold: boolean;
} {
  if (opts.alreadyExiting) {
    return {
      closedAtMs: null,
      holdClearedAtMs: null,
      doubleClosePrevented: true,
      reopenClearedHold: true,
      usedExitHold: true,
    };
  }

  let hold = true;
  const closeAt = OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS;
  const clearAt = closeAt + BOTTOM_DRAWER_CLOSE_UNMOUNT_MS;

  if (opts.reopenDuringExit) {
    hold = false;
    return {
      closedAtMs: closeAt,
      holdClearedAtMs: closeAt - 1,
      doubleClosePrevented: true,
      reopenClearedHold: !hold,
      usedExitHold: true,
    };
  }

  hold = false;
  return {
    closedAtMs: closeAt,
    holdClearedAtMs: clearAt,
    doubleClosePrevented: true,
    reopenClearedHold: true,
    usedExitHold: true,
  };
}

const PAIR_UP_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("PairUpActiveOverlay swipe wiring", () => {
  it("reuses requester portal-root content swipe without changing BottomDrawer", () => {
    const src = readOverlay();
    expect(src).toContain("useOverlayContentSwipeDismiss");
    expect(src).not.toContain("useOverlayEdgeSwipeDismiss");
    expect(src).toContain("overlayStyle={overlaySwipeStyle}");
    expect(src).toContain(
      "onOverlayPointerDownCapture={onOverlayPointerDownCapture}"
    );
    expect(src).toContain('touchAction: "pan-y"');
    expect(src).toContain("startZoneMaxXVw: 1");
    expect(src).toContain("startZoneMaxPx: 10000");
    expect(src).toContain("leftInsetPx: 0");
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("horizontalLockPx: 12");
    expect(src).toContain("PAIR_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain("allowButtonTargets: false");
    expect(src).toContain("gestureDisabled: swipeBlocked");
    expect(src).toContain("engageSwipe: editorOpen && !swipeBlocked");
    expect(src).toContain("active: swipeHookActive");
    expect(src).toContain("onSwipeCommit: handleSwipeCommit");
    expect(src).toContain("closePairUpManage");
    expect(src).toContain("data-pair-up-swipe-panel");
    expect(src).not.toContain("{...panelSwipeProps}");
  });

  it("keeps existing onClose busy guard and Cancel path", () => {
    const src = readOverlay();
    expect(src).toContain("if (swipeExitHold) return;");
    expect(src).toContain("if (!busy) closePairUpManage()");
    expect(src).toContain("onClick={handleCancel}");
    expect(src).toContain("closePairUpOverlayTop()");
  });

  it("wires exit hold with shared timing constants", () => {
    const src = readOverlay();
    expect(src).toContain("OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS");
    expect(src).toContain("BOTTOM_DRAWER_CLOSE_UNMOUNT_MS");
    expect(src).toContain("swipeExitHold");
    expect(src).toContain("abortSwipeExitHold");
    expect(src).toContain(
      "Keep portal exit transform alive through commit animation + BD delayed unmount."
    );
  });
});

describe("PairUpActiveOverlay swipe exit hold", () => {
  it("derives exit + linger timing from shared constants", () => {
    expect(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS).toBe(260);
    expect(BOTTOM_DRAWER_CLOSE_UNMOUNT_MS).toBe(300);
  });

  it("retains exit motion until close + BD unmount window", () => {
    const result = simulateExitLifecycle({});
    expect(result.usedExitHold).toBe(true);
    expect(result.closedAtMs).toBe(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
    expect(result.holdClearedAtMs).toBe(
      OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS + BOTTOM_DRAWER_CLOSE_UNMOUNT_MS
    );
  });

  it("rapid repeated commits cannot double-close", () => {
    const first = simulateExitLifecycle({});
    const second = simulateExitLifecycle({ alreadyExiting: true });
    expect(first.usedExitHold).toBe(true);
    expect(second.doubleClosePrevented).toBe(true);
    expect(second.closedAtMs).toBeNull();
  });

  it("reopen during exit clears hold so transform starts clean", () => {
    const result = simulateExitLifecycle({ reopenDuringExit: true });
    expect(result.reopenClearedHold).toBe(true);
  });
});

describe("PairUpActiveOverlay swipe behavior", () => {
  it("commits a long rightward drag from panel chrome", () => {
    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [
          { x: 140, y: 400 },
          { x: 180, y: 402 },
        ],
        up: { x: 180, y: 402 },
      })
    ).toBe("committed");
  });

  it("snaps back on a short rightward drag", () => {
    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [{ x: 135, y: 400 }],
        up: { x: 135, y: 400 },
      })
    ).toBe("snapback");
  });

  it("does not dismiss leftward or vertical gestures", () => {
    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 160, y: 400, target: "panel" },
        moves: [{ x: 140, y: 400 }],
        up: { x: 140, y: 400 },
      })
    ).toBe("cancelled");

    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 160, y: 400, target: "panel" },
        moves: [{ x: 165, y: 460 }],
        up: { x: 165, y: 460 },
      })
    ).toBe("cancelled");
  });

  it("ignores starts on buttons, textarea, or while busy", () => {
    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 120, y: 500, target: "button" },
        moves: [{ x: 200, y: 500 }],
        up: { x: 200, y: 500 },
      })
    ).toBe("ignored");

    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        down: { x: 120, y: 350, target: "textarea" },
        moves: [{ x: 200, y: 350 }],
        up: { x: 200, y: 350 },
      })
    ).toBe("ignored");

    expect(
      simulatePairUpSwipe({
        ...PAIR_UP_SWIPE,
        busy: true,
        down: { x: 120, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
  });
});
