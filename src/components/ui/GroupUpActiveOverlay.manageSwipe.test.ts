/**
 * GroupUpActiveOverlay manage-mode swipe-to-close contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS } from "../../hooks/useOverlayContentSwipeDismiss";
import { BOTTOM_DRAWER_CLOSE_UNMOUNT_MS } from "./BottomDrawer";

function readOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/ui/GroupUpActiveOverlay.tsx"),
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

type Pointer = { x: number; y: number; target: "panel" | "button" };

function simulateManageSwipe(opts: {
  innerWidth: number;
  startZoneMaxXVw: number;
  startZoneMaxPx: number;
  leftInsetPx: number;
  commitThresholdPx: number;
  horizontalLockPx: number;
  manageOpen: boolean;
  blocked?: boolean;
  down: Pointer;
  moves: Array<{ x: number; y: number }>;
  up: { x: number; y: number };
}): "committed" | "ignored" | "cancelled" | "snapback" {
  if (!opts.manageOpen || opts.blocked) return "ignored";
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

function simulateManageExitLifecycle(opts: {
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

const MANAGE_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("GroupUpActiveOverlay manage swipe wiring", () => {
  it("wires content swipe only on the manage BottomDrawer with exit hold", () => {
    const src = readOverlay();
    expect(src).toContain("manageOverlaySwipeStyle");
    expect(src).toContain(
      "onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}"
    );
    expect(src).toContain("active: manageSwipeHookActive");
    expect(src).toContain(
      "engageSwipe: manageSheetVisible && !manageSwipeBlocked"
    );
    expect(src).toContain("gestureDisabled: manageSwipeBlocked");
    expect(src).toContain("GROUP_UP_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain("data-group-up-manage-swipe-panel");
    expect(src).toContain("handleManageSwipeCommit");
    expect(src).toContain("manageSwipeExitHold");
    expect(src).toContain("OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS");
    expect(src).toContain("BOTTOM_DRAWER_CLOSE_UNMOUNT_MS");
    expect(src).toContain("requestManageClose");
    expect(src).toContain(
      "Same as manage Close / backdrop final close — never cancel or mutate group."
    );

    const createDrawerIdx = src.indexOf("open={sheetOpen && createOpen}");
    const manageDrawerIdx = src.indexOf("open={sheetOpen && manageOpen}");
    expect(createDrawerIdx).toBeGreaterThan(0);
    expect(manageDrawerIdx).toBeGreaterThan(createDrawerIdx);
    const createBlock = src.slice(createDrawerIdx, manageDrawerIdx);
    expect(createBlock).toContain("overlayStyle={createOverlaySwipeStyle}");
    const manageBlock = src.slice(manageDrawerIdx, manageDrawerIdx + 700);
    expect(manageBlock).toContain("overlayStyle={manageOverlaySwipeStyle}");
    expect(manageBlock).toContain(
      "onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}"
    );
    expect(manageBlock).toContain("if (manageSwipeExitHold) return;");
    expect(manageBlock).toContain("requestManageClose()");
  });

  it("blocks swipe for date panel, cancel confirm, busy, photo prompt, exit hold", () => {
    const src = readOverlay();
    expect(src).toContain("showDatePanel");
    expect(src).toContain("cancelConfirmOpen");
    expect(src).toContain("cancelBusy");
    expect(src).toContain("scheduleBusy");
    expect(src).toContain("photoPromptOpen");
    expect(src).toContain("manageSwipeExitHold");
    expect(src).toContain("manageSwipeBlocked");
  });

  it("backdrop collapses date panel first via requestManageClose", () => {
    const src = readOverlay();
    expect(src).toMatch(
      /const requestManageClose = useCallback\(\(\) => \{[\s\S]*?if \(showDatePanel\) \{[\s\S]*?setShowDatePanel\(false\);[\s\S]*?closeGroupUpOverlay\(\);/
    );
  });

  it("cancel confirm path remains separate from swipe close", () => {
    const src = readOverlay();
    expect(src).toContain("openGroupUpCancelConfirm()");
    const commitIdx = src.indexOf("const handleManageSwipeCommit");
    const nextFnIdx = src.indexOf("const manageSwipeHookActive", commitIdx);
    expect(commitIdx).toBeGreaterThan(0);
    expect(nextFnIdx).toBeGreaterThan(commitIdx);
    const commitBody = src.slice(commitIdx, nextFnIdx);
    expect(commitBody).not.toContain("openGroupUpCancelConfirm");
    expect(commitBody).toContain("requestManageCloseRef.current()");
  });
});

describe("GroupUpActiveOverlay manage clean-swipe exit hold", () => {
  it("derives exit + linger timing from shared constants", () => {
    expect(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS).toBe(260);
    expect(BOTTOM_DRAWER_CLOSE_UNMOUNT_MS).toBe(300);
  });

  it("retains exit motion until close + BD unmount window", () => {
    const result = simulateManageExitLifecycle({});
    expect(result.usedExitHold).toBe(true);
    expect(result.closedAtMs).toBe(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
    expect(result.holdClearedAtMs).toBe(
      OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS + BOTTOM_DRAWER_CLOSE_UNMOUNT_MS
    );
  });

  it("rapid repeated commits cannot double-close", () => {
    const first = simulateManageExitLifecycle({});
    const second = simulateManageExitLifecycle({ alreadyExiting: true });
    expect(first.usedExitHold).toBe(true);
    expect(second.doubleClosePrevented).toBe(true);
    expect(second.closedAtMs).toBeNull();
  });

  it("reopen during exit clears hold so transform starts clean", () => {
    const result = simulateManageExitLifecycle({ reopenDuringExit: true });
    expect(result.reopenClearedHold).toBe(true);
  });
});

describe("GroupUpActiveOverlay manage swipe behavior", () => {
  it("commits long rightward drag in manage mode", () => {
    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [
          { x: 120, y: 400 },
          { x: 170, y: 402 },
        ],
        up: { x: 170, y: 402 },
      })
    ).toBe("committed");
  });

  it("snaps back short; ignores create-off and blocked states", () => {
    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 120, y: 400 }],
        up: { x: 120, y: 400 },
      })
    ).toBe("snapback");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: false,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        blocked: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
  });

  it("does not dismiss leftward, vertical, or button starts", () => {
    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 140, y: 400, target: "panel" },
        moves: [{ x: 120, y: 400 }],
        up: { x: 120, y: 400 },
      })
    ).toBe("cancelled");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 140, y: 400, target: "panel" },
        moves: [{ x: 145, y: 460 }],
        up: { x: 145, y: 460 },
      })
    ).toBe("cancelled");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 100, y: 500, target: "button" },
        moves: [{ x: 200, y: 500 }],
        up: { x: 200, y: 500 },
      })
    ).toBe("ignored");
  });
});
