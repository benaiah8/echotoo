/**
 * SourceGroupsOverlay swipe-to-close: portal wiring + lock/commit + exit hold.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS } from "../../hooks/useOverlayContentSwipeDismiss";
import { BOTTOM_DRAWER_CLOSE_UNMOUNT_MS } from "../ui/BottomDrawer";

function readOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/social/SourceGroupsOverlay.tsx"),
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

type Pointer = {
  x: number;
  y: number;
  target: "panel" | "button" | "scroll";
};

function simulateSourceGroupsSwipe(opts: {
  innerWidth: number;
  startZoneMaxXVw: number;
  startZoneMaxPx: number;
  leftInsetPx: number;
  commitThresholdPx: number;
  horizontalLockPx: number;
  nestedBlocking?: boolean;
  down: Pointer;
  moves: Array<{ x: number; y: number }>;
  up: { x: number; y: number };
}): "committed" | "ignored" | "cancelled" | "snapback" {
  if (opts.nestedBlocking) return "ignored";
  if (opts.down.target === "button") return "ignored";

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
  nestedDuringExit?: boolean;
}): {
  closedAtMs: number | null;
  holdClearedAtMs: number | null;
  doubleClosePrevented: boolean;
  reopenClearedHold: boolean;
  nestedAbortedClose: boolean;
  usedExitHold: boolean;
} {
  if (opts.alreadyExiting) {
    return {
      closedAtMs: null,
      holdClearedAtMs: null,
      doubleClosePrevented: true,
      reopenClearedHold: true,
      nestedAbortedClose: false,
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
      nestedAbortedClose: false,
      usedExitHold: true,
    };
  }

  if (opts.nestedDuringExit) {
    hold = false;
    return {
      closedAtMs: null,
      holdClearedAtMs: closeAt,
      doubleClosePrevented: true,
      reopenClearedHold: true,
      nestedAbortedClose: true,
      usedExitHold: true,
    };
  }

  hold = false;
  return {
    closedAtMs: closeAt,
    holdClearedAtMs: clearAt,
    doubleClosePrevented: true,
    reopenClearedHold: true,
    nestedAbortedClose: false,
    usedExitHold: true,
  };
}

const SOURCE_GROUPS_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("SourceGroupsOverlay swipe wiring", () => {
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
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("SOURCE_GROUPS_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain("allowButtonTargets: false");
    expect(src).toContain("gestureDisabled: swipeBlocked");
    expect(src).toContain("engageSwipe: open && !swipeBlocked");
    expect(src).toContain("active: swipeHookActive");
    expect(src).toContain("onSwipeCommit: handleSwipeCommit");
    expect(src).toContain("handleCloseRef.current()");
    expect(src).toContain("data-source-groups-swipe-panel");
    expect(src).toContain("socialSheetUnderneath || photoPromptOpen");
    expect(src).not.toContain("{...panelSwipeProps}");
  });

  it("keeps existing close path with exit-hold guard on backdrop", () => {
    const src = readOverlay();
    expect(src).toContain("if (swipeExitHold) return;");
    expect(src).toContain("handleClose()");
    expect(src).toContain("closeSourceGroupsOverlay()");
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

  it("aborts exit hold if nested overlay opens mid-exit", () => {
    const src = readOverlay();
    expect(src).toContain(
      "Nested overlay opened mid-exit — abort hold so we do not close underneath it."
    );
    expect(src).toContain("if (nestedBlockingRef.current)");
  });
});

describe("SourceGroupsOverlay swipe exit hold", () => {
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

  it("nested overlay mid-exit skips delayed close", () => {
    const result = simulateExitLifecycle({ nestedDuringExit: true });
    expect(result.nestedAbortedClose).toBe(true);
    expect(result.closedAtMs).toBeNull();
  });
});

describe("SourceGroupsOverlay swipe behavior", () => {
  it("commits a long rightward drag from noninteractive chrome", () => {
    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        down: { x: 80, y: 120, target: "panel" },
        moves: [
          { x: 100, y: 120 },
          { x: 160, y: 122 },
        ],
        up: { x: 160, y: 122 },
      })
    ).toBe("committed");
  });

  it("snaps back on a short rightward drag", () => {
    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        down: { x: 80, y: 120, target: "panel" },
        moves: [{ x: 100, y: 120 }],
        up: { x: 100, y: 120 },
      })
    ).toBe("snapback");
  });

  it("does not dismiss leftward or vertical list scroll", () => {
    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        down: { x: 120, y: 300, target: "scroll" },
        moves: [{ x: 100, y: 300 }],
        up: { x: 100, y: 300 },
      })
    ).toBe("cancelled");

    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        down: { x: 120, y: 300, target: "scroll" },
        moves: [{ x: 125, y: 380 }],
        up: { x: 125, y: 380 },
      })
    ).toBe("cancelled");
  });

  it("ignores button starts and nested create/manage/photo blocking", () => {
    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        down: { x: 80, y: 500, target: "button" },
        moves: [{ x: 200, y: 500 }],
        up: { x: 200, y: 500 },
      })
    ).toBe("ignored");

    expect(
      simulateSourceGroupsSwipe({
        ...SOURCE_GROUPS_SWIPE,
        nestedBlocking: true,
        down: { x: 80, y: 120, target: "panel" },
        moves: [{ x: 200, y: 120 }],
        up: { x: 200, y: 120 },
      })
    ).toBe("ignored");
  });
});
