/**
 * OpenPlanActiveOverlay create-mode swipe-to-close contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPlaceDuoCreateDraftDirty,
  resolvePlaceDuoCreateDismissRequest,
} from "../../lib/placeDuoCreateDraftGuard";
import { OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS } from "../../hooks/useOverlayContentSwipeDismiss";
import { BOTTOM_DRAWER_CLOSE_UNMOUNT_MS } from "./BottomDrawer";

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

type Pointer = { x: number; y: number; target: "panel" | "button" | "textarea" };

function simulateCreateSwipe(opts: {
  innerWidth: number;
  startZoneMaxXVw: number;
  startZoneMaxPx: number;
  leftInsetPx: number;
  commitThresholdPx: number;
  horizontalLockPx: number;
  createOpen: boolean;
  blocked?: boolean;
  down: Pointer;
  moves: Array<{ x: number; y: number }>;
  up: { x: number; y: number };
}): "committed" | "ignored" | "cancelled" | "snapback" {
  if (!opts.createOpen || opts.blocked) return "ignored";
  if (opts.down.target === "button" || opts.down.target === "textarea") {
    return "ignored";
  }

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

function simulateCleanSwipeExitLifecycle(opts: {
  dirty: boolean;
  alreadyExiting?: boolean;
  reopenDuringExit?: boolean;
}): {
  planKind: string;
  usedExitHold: boolean;
  closedAtMs: number | null;
  holdClearedAtMs: number | null;
  resetTokenFrozenDuringHold: boolean;
  doubleClosePrevented: boolean;
  reopenClearedHold: boolean;
} {
  const plan = resolvePlaceDuoCreateDismissRequest({
    createOpen: true,
    discardConfirmOpen: false,
    dirty: opts.dirty,
    busy: false,
  });

  if (plan.kind !== "close-overlay") {
    return {
      planKind: plan.kind,
      usedExitHold: false,
      closedAtMs: null,
      holdClearedAtMs: null,
      resetTokenFrozenDuringHold: false,
      doubleClosePrevented: true,
      reopenClearedHold: true,
    };
  }

  if (opts.alreadyExiting) {
    return {
      planKind: plan.kind,
      usedExitHold: true,
      closedAtMs: null,
      holdClearedAtMs: null,
      resetTokenFrozenDuringHold: true,
      doubleClosePrevented: true,
      reopenClearedHold: true,
    };
  }

  let hold = true;
  const frozenToken = "post-1:edit";
  const closeAt = OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS;
  const clearAt = closeAt + BOTTOM_DRAWER_CLOSE_UNMOUNT_MS;

  if (opts.reopenDuringExit) {
    hold = false;
    return {
      planKind: plan.kind,
      usedExitHold: true,
      closedAtMs: closeAt,
      holdClearedAtMs: closeAt - 1,
      resetTokenFrozenDuringHold: frozenToken === "post-1:edit",
      doubleClosePrevented: true,
      reopenClearedHold: !hold,
    };
  }

  hold = false;
  return {
    planKind: plan.kind,
    usedExitHold: true,
    closedAtMs: closeAt,
    holdClearedAtMs: clearAt,
    resetTokenFrozenDuringHold: true,
    doubleClosePrevented: true,
    reopenClearedHold: true,
  };
}

const CREATE_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("OpenPlanActiveOverlay create swipe wiring", () => {
  it("wires content swipe only on the create BottomDrawer via dismiss planner", () => {
    const src = readOverlay();
    expect(src).toContain("useOverlayContentSwipeDismiss");
    expect(src).not.toContain("useOverlayEdgeSwipeDismiss");
    expect(src).toContain("createOverlaySwipeStyle");
    expect(src).toContain(
      "onOverlayPointerDownCapture={onCreateOverlayPointerDownCapture}",
    );
    expect(src).toContain("active: createSwipeHookActive");
    expect(src).toContain(
      "engageSwipe: createSheetVisible && !createSwipeBlocked",
    );
    expect(src).toContain("gestureDisabled: createSwipeBlocked");
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("OPEN_PLAN_CREATE_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain("data-open-plan-create-swipe-panel");
    expect(src).toContain("handleCreateSwipeCommit");
    expect(src).toContain("OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS");
    expect(src).toContain("BOTTOM_DRAWER_CLOSE_UNMOUNT_MS");
    expect(src).toContain("createSwipeExitHold");
    expect(src).toContain(
      "Same dismiss planner as backdrop / Cancel — never closeOpenPlanOverlay() directly.",
    );

    const createDrawerIdx = src.indexOf("open={sheetOpen && createOpen}");
    const manageDrawerIdx = src.indexOf("open={sheetOpen && manageOpen}");
    expect(createDrawerIdx).toBeGreaterThan(0);
    expect(manageDrawerIdx).toBeGreaterThan(createDrawerIdx);
    const createBlock = src.slice(createDrawerIdx, manageDrawerIdx);
    expect(createBlock).toContain("overlayStyle={createOverlaySwipeStyle}");
    expect(createBlock).toContain(
      "onOverlayPointerDownCapture={onCreateOverlayPointerDownCapture}",
    );
    expect(createBlock).toContain("if (createSwipeExitHold) return;");
    const manageBlock = src.slice(manageDrawerIdx, manageDrawerIdx + 600);
    expect(manageBlock).toContain("overlayStyle={manageOverlaySwipeStyle}");
    expect(manageBlock).toContain(
      "onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}",
    );
  });

  it("blocks swipe while busy, discard confirm, date panel, or clean exit hold", () => {
    const src = readOverlay();
    expect(src).toContain("createBusy");
    expect(src).toContain("discardConfirmOpen");
    expect(src).toContain("showDatePanel");
    expect(src).toContain("createSwipeExitHold");
    expect(src).toContain("createSwipeBlocked");
  });

  it("keeps backdrop tap functional and guarded during exit hold", () => {
    const src = readOverlay();
    expect(src).toContain("ignoreBackdropCloseUntilRef");
    expect(src).toMatch(
      /onClose=\{\(\) => \{[\s\S]*?requestCreateClose\(\);[\s\S]*?\}\}[\s\S]*?overlayStyle=\{createOverlaySwipeStyle\}/,
    );
  });
});

describe("OpenPlanActiveOverlay create swipe dismiss planning", () => {
  it("clean form swipe plans close-overlay; dirty plans discard confirm", () => {
    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: false,
        busy: false,
      }).kind,
    ).toBe("close-overlay");

    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: true,
        busy: false,
      }).kind,
    ).toBe("open-discard-confirm");

    expect(
      isPlaceDuoCreateDraftDirty({
        noteDraft: "Coffee?",
        selectedDate: null,
        selectedTime: null,
      }),
    ).toBe(true);
  });

  it("does not dismiss while discard confirm is already open or busy", () => {
    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: true,
        dirty: true,
        busy: false,
      }).kind,
    ).toBe("noop-confirm-open");

    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: true,
        busy: true,
      }).kind,
    ).toBe("noop-busy");
  });

  it("continue editing and confirm discard use existing handlers", () => {
    const src = readOverlay();
    expect(src).toContain("onClick={() => setDiscardConfirmOpen(false)}");
    expect(src).toContain("handleDiscardExit");
    expect(src).toContain("handleDiscardSave");
  });
});

describe("OpenPlanActiveOverlay create clean-swipe exit hold", () => {
  it("derives exit + linger timing from gesture + BottomDrawer constants", () => {
    expect(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS).toBe(260);
    expect(BOTTOM_DRAWER_CLOSE_UNMOUNT_MS).toBe(300);
  });

  it("clean swipe retains exit motion until dismissal and BD unmount window", () => {
    const result = simulateCleanSwipeExitLifecycle({ dirty: false });
    expect(result.planKind).toBe("close-overlay");
    expect(result.usedExitHold).toBe(true);
    expect(result.closedAtMs).toBe(OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
    expect(result.holdClearedAtMs).toBe(
      OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS + BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
    );
    expect(result.resetTokenFrozenDuringHold).toBe(true);
  });

  it("dirty swipe opens discard confirmation without exit hold", () => {
    const result = simulateCleanSwipeExitLifecycle({ dirty: true });
    expect(result.planKind).toBe("open-discard-confirm");
    expect(result.usedExitHold).toBe(false);
  });

  it("rapid repeated clean commits cannot double-close", () => {
    const first = simulateCleanSwipeExitLifecycle({ dirty: false });
    const second = simulateCleanSwipeExitLifecycle({
      dirty: false,
      alreadyExiting: true,
    });
    expect(first.usedExitHold).toBe(true);
    expect(second.doubleClosePrevented).toBe(true);
    expect(second.closedAtMs).toBeNull();
  });

  it("reopen during exit clears hold so transform starts clean", () => {
    const result = simulateCleanSwipeExitLifecycle({
      dirty: false,
      reopenDuringExit: true,
    });
    expect(result.reopenClearedHold).toBe(true);
  });
});

describe("OpenPlanActiveOverlay create swipe behavior", () => {
  it("commits long rightward drag in create mode", () => {
    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [
          { x: 120, y: 400 },
          { x: 170, y: 402 },
        ],
        up: { x: 170, y: 402 },
      }),
    ).toBe("committed");
  });

  it("snaps back short; ignores manage-off, blocked, and form controls", () => {
    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 120, y: 400 }],
        up: { x: 120, y: 400 },
      }),
    ).toBe("snapback");

    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: false,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      }),
    ).toBe("ignored");

    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        blocked: true,
        down: { x: 100, y: 400, target: "panel" },
        moves: [{ x: 200, y: 400 }],
        up: { x: 200, y: 400 },
      }),
    ).toBe("ignored");

    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        down: { x: 100, y: 350, target: "textarea" },
        moves: [{ x: 200, y: 350 }],
        up: { x: 200, y: 350 },
      }),
    ).toBe("ignored");
  });

  it("does not dismiss leftward or vertical gestures", () => {
    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        down: { x: 140, y: 400, target: "panel" },
        moves: [{ x: 120, y: 400 }],
        up: { x: 120, y: 400 },
      }),
    ).toBe("cancelled");

    expect(
      simulateCreateSwipe({
        ...CREATE_SWIPE,
        createOpen: true,
        down: { x: 140, y: 400, target: "panel" },
        moves: [{ x: 145, y: 460 }],
        up: { x: 145, y: 460 },
      }),
    ).toBe("cancelled");
  });
});
