/**
 * OpenPlanActiveOverlay manage-mode swipe-to-close contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/ui/OpenPlanActiveOverlay.tsx"),
    "utf8",
  );
}

function startZoneMaxClientX(
  innerWidth: number,
  startZoneMaxXVw: number,
  startZoneMaxPx: number,
  leftInsetPx: number,
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
    opts.leftInsetPx,
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

const MANAGE_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("OpenPlanActiveOverlay manage swipe wiring", () => {
  it("wires content swipe only on the manage BottomDrawer", () => {
    const src = readOverlay();
    expect(src).toContain("useOverlayContentSwipeDismiss");
    expect(src).not.toContain("useOverlayEdgeSwipeDismiss");
    expect(src).toContain("manageOverlaySwipeStyle");
    expect(src).toContain(
      "onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}",
    );
    expect(src).toContain("active: manageSheetVisible");
    expect(src).toContain(
      "engageSwipe: manageSheetVisible && !manageSwipeBlocked",
    );
    expect(src).toContain("gestureDisabled: manageSwipeBlocked");
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("OPEN_PLAN_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain("data-open-plan-manage-swipe-panel");
    expect(src).toContain("handleManageSwipeCommit");
    expect(src).toContain("closeOpenPlanOverlay()");
    const createDrawerIdx = src.indexOf("open={sheetOpen && createOpen}");
    const manageDrawerIdx = src.indexOf("open={sheetOpen && manageOpen}");
    expect(createDrawerIdx).toBeGreaterThan(0);
    expect(manageDrawerIdx).toBeGreaterThan(createDrawerIdx);
    const createBlock = src.slice(createDrawerIdx, manageDrawerIdx);
    expect(createBlock).toContain("overlayStyle={createOverlaySwipeStyle}");
    expect(createBlock).toContain(
      "onOverlayPointerDownCapture={onCreateOverlayPointerDownCapture}",
    );
    expect(src.slice(manageDrawerIdx, manageDrawerIdx + 500)).toContain(
      "overlayStyle={manageOverlaySwipeStyle}",
    );
    expect(src.slice(manageDrawerIdx, manageDrawerIdx + 500)).toContain(
      "onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}",
    );
    // Manage hook stays independent from create hook.
    expect(src).toContain("active: manageSheetVisible");
    expect(src).toContain("active: createSwipeHookActive");
  });

  it("blocks swipe for cancel confirm, busy, and create-only date panel", () => {
    const src = readOverlay();
    expect(src).toContain("cancelBusy");
    expect(src).toContain("cancelConfirmOpen");
    expect(src).toContain("showDatePanel");
    expect(src).toContain("manageSwipeBlocked");
    // Closing manage must not open cancel confirm.
    expect(src).toContain(
      "Same as manage BottomDrawer onClose / Cancel — close sheet, do not cancel plan.",
    );
  });
});

describe("OpenPlanActiveOverlay manage swipe behavior", () => {
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
      }),
    ).toBe("committed");
  });

  it("snaps back on short drag; ignores create mode and blocked states", () => {
    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 120, y: 400 }],
        up: { x: 120, y: 400 },
      }),
    ).toBe("snapback");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: false,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      }),
    ).toBe("ignored");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        blocked: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      }),
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
      }),
    ).toBe("cancelled");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 140, y: 400, target: "panel" },
        moves: [{ x: 145, y: 460 }],
        up: { x: 145, y: 460 },
      }),
    ).toBe("cancelled");

    expect(
      simulateManageSwipe({
        ...MANAGE_SWIPE,
        manageOpen: true,
        down: { x: 100, y: 500, target: "button" },
        moves: [{ x: 200, y: 500 }],
        up: { x: 200, y: 500 },
      }),
    ).toBe("ignored");
  });
});
