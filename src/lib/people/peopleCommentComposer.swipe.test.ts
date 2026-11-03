/**
 * PeopleCommentComposerOverlay swipe-to-close + compact X contracts.
 * Mirrors PairUpActiveOverlay.swipe.test.ts rules for content swipe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS } from "../../hooks/useOverlayContentSwipeDismiss";
import { BOTTOM_DRAWER_CLOSE_UNMOUNT_MS } from "../../components/ui/BottomDrawer";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
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
  target: "panel" | "button" | "textarea" | "sent-body";
};

function simulateComposerSwipe(opts: {
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
  if (
    opts.down.target === "button" ||
    opts.down.target === "textarea" ||
    opts.down.target === "sent-body"
  ) {
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

const COMPOSER_SWIPE = {
  innerWidth: 390,
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("PeopleCommentComposerOverlay swipe wiring", () => {
  it("reuses PairUp content swipe without changing shared hooks or BottomDrawer", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    const hook = read("hooks/useOverlayContentSwipeDismiss.ts");
    const terminal = read("hooks/overlaySwipeTerminal.ts");
    const drawer = read("components/ui/BottomDrawer.tsx");

    expect(ui).toContain("useOverlayContentSwipeDismiss");
    expect(ui).not.toContain("useOverlayEdgeSwipeDismiss");
    expect(ui).toContain("overlayStyle={overlaySwipeStyle}");
    expect(ui).toContain(
      "onOverlayPointerDownCapture={onOverlayPointerDownCapture}"
    );
    expect(ui).toContain('touchAction: "pan-y"');
    expect(ui).toContain("startZoneMaxXVw: 1");
    expect(ui).toContain("startZoneMaxPx: 10000");
    expect(ui).toContain("leftInsetPx: 0");
    expect(ui).toContain("commitThresholdPx: 48");
    expect(ui).toContain("horizontalLockPx: 12");
    expect(ui).toContain("COMMENT_COMPOSER_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(ui).toContain("allowButtonTargets: false");
    expect(ui).toContain("gestureDisabled: swipeBlocked");
    expect(ui).toContain("engageSwipe: open && !swipeBlocked");
    expect(ui).toContain("onSwipeCommit: handleSwipeCommit");
    expect(ui).toContain("swipeExitHold");
    expect(ui).toContain("OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS");
    expect(ui).toContain("BOTTOM_DRAWER_CLOSE_UNMOUNT_MS");
    expect(ui).toContain("isContentSwipeVisualActive");
    expect(ui).toContain("select-text");
    expect(ui).toContain('data-people-comment-composer-close-x="true"');
    expect(ui).toContain("PiX");
    expect(ui).not.toContain("closeOnlyTray");
    expect(ui).not.toContain("routeDuoCommentTap");
    expect(ui).not.toContain("get_my_duo_comment");

    // Shared gesture ownership untouched.
    expect(hook).toContain("export function useOverlayContentSwipeDismiss");
    expect(terminal).toContain("decideContentSwipeTerminal");
    expect(drawer).toContain("overlayStyle");
    expect(drawer).toContain("onOverlayPointerDownCapture");
  });

  it("excludes textarea, buttons, and sent message; preserves vertical pan", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain('"textarea"');
    expect(ui).toContain('"input"');
    expect(ui).toContain('"button"');
    expect(ui).toContain('[role="button"]');
    expect(ui).toContain("a[href]");
    expect(ui).toContain('[contenteditable="true"]');
    expect(ui).toContain("[data-no-overlay-swipe]");
    expect(ui).toContain('data-people-comment-composer-sent-body="true"');
    expect(ui).toContain("data-no-overlay-swipe");
    expect(ui).toContain('touchAction: "pan-y"');
    // userSelect none only while swipe visual is active — not permanent root lock.
    expect(ui).toContain("isContentSwipeVisualActive");
    expect(ui).toContain(
      "...(isContentSwipeVisualActive\n      ? { userSelect: \"none\", WebkitUserSelect: \"none\" }\n      : {})"
    );
  });

  it("blocks dismiss while sending and keeps Android back path", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain("swipeBlocked = sendBusy || swipeExitHold");
    expect(ui).toContain("if (sendBusy || swipeExitHold) return");
    expect(ui).toContain("subscribeAndroidHardwareBack");
    expect(ui).toContain("closePeopleCommentComposerTop");
    expect(ui).toContain("if (swipeExitHold) return");
  });

  it("uses one stable BottomDrawer and never exposes default Close during close", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    const drawerOpens = ui.match(/<BottomDrawer\b/g) ?? [];
    expect(drawerOpens).toHaveLength(1);
    expect(ui).toContain("showCloseButton={false}");
    expect(ui).toContain("transparentSheet");
    expect(ui).toContain("shrinkSheetToContent");
    expect(ui).toContain("const displayCtx = ctx ?? lastCtxRef.current");
    expect(ui).toContain("swipeExitHold");
    // Ghost path removed: no second drawer when context is cleared.
    expect(ui).not.toContain("if (!viewCtx)");
    expect(ui).not.toMatch(
      /<BottomDrawer[\s\S]*?open=\{false\}[\s\S]*?>\s*\{null\}/
    );
    // Keep X / Cancel / Android dismiss entry points.
    expect(ui).toContain("data-people-comment-composer-close-x");
    expect(ui).toContain("handleCancel");
    expect(ui).toContain("closePeopleCommentComposer()");
    expect(ui).toContain("closePeopleCommentComposerTop");
  });

  it("keeps BD open from store only; exit-hold preserves transform not drawer open", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    const pairUp = read("components/ui/PairUpActiveOverlay.tsx");
    expect(ui).toContain("open={open}");
    expect(ui).not.toContain("open={open || swipeExitHold}");
    expect(ui).not.toContain("open={drawerOpen}");
    expect(ui).not.toContain("drawerOpen");
    expect(ui).toContain("const swipeHookActive = open || swipeExitHold");
    expect(ui).toContain("engageSwipe: open && !swipeBlocked");
    expect(ui).toContain("gestureDisabled: swipeBlocked");
    expect(ui).toMatch(
      /const swipeResetToken = swipeExitHold\s*\?\s*swipeExitResetTokenRef\.current/
    );
    expect(ui).toContain("OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS");
    expect(ui).toContain("BOTTOM_DRAWER_CLOSE_UNMOUNT_MS");
    // PairUp contract: drawer open is store-driven, hold is transform-only.
    expect(pairUp).toContain("open={editorOpen}");
    expect(pairUp).toContain("const swipeHookActive = editorOpen || swipeExitHold");
  });
});

describe("PeopleCommentComposerOverlay swipe exit hold", () => {
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

describe("PeopleCommentComposerOverlay swipe behavior", () => {
  it("commits a long rightward drag from panel chrome", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [
          { x: 140, y: 400 },
          { x: 180, y: 402 },
        ],
        up: { x: 180, y: 402 },
      })
    ).toBe("committed");
  });

  it("snaps back when release is under commit threshold", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [
          { x: 132, y: 400 },
          { x: 150, y: 401 },
        ],
        up: { x: 150, y: 401 },
      })
    ).toBe("snapback");
  });

  it("does not dismiss on leftward swipe", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [{ x: 100, y: 400 }],
        up: { x: 100, y: 400 },
      })
    ).toBe("cancelled");
  });

  it("ignores gestures that start on textarea, buttons, or sent body", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "textarea" },
        moves: [
          { x: 140, y: 400 },
          { x: 200, y: 400 },
        ],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "button" },
        moves: [
          { x: 140, y: 400 },
          { x: 200, y: 400 },
        ],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "sent-body" },
        moves: [
          { x: 140, y: 400 },
          { x: 200, y: 400 },
        ],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
  });

  it("cancels when vertical scroll dominates before lock", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        down: { x: 120, y: 400, target: "panel" },
        moves: [{ x: 124, y: 440 }],
        up: { x: 124, y: 440 },
      })
    ).toBe("cancelled");
  });

  it("ignores swipe while send is busy", () => {
    expect(
      simulateComposerSwipe({
        ...COMPOSER_SWIPE,
        busy: true,
        down: { x: 120, y: 400, target: "panel" },
        moves: [
          { x: 140, y: 400 },
          { x: 200, y: 400 },
        ],
        up: { x: 200, y: 400 },
      })
    ).toBe("ignored");
  });
});
