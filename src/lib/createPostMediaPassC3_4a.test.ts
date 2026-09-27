import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VIDEO_FULLSCREEN_DISMISS_COMMIT_PX,
  VIDEO_FULLSCREEN_DISMISS_EASING,
  VIDEO_FULLSCREEN_DISMISS_LOCK_PX,
  VIDEO_FULLSCREEN_DISMISS_PROGRESS_RANGE_PX,
  VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS,
  computeFullscreenDismissVisual,
  shouldCommitFullscreenDismissOnRelease,
  shouldIgnoreSwipeDownExitForControlTarget,
  shouldLockFullscreenDismiss,
} from "./createFinalizeVideoFullscreen";
import {
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SEEK_DELTA_SEC,
  classifyHeroPointerGesture,
  computeDoubleTapSeekTime,
  resolveVideoPointerUp,
} from "./createFinalizeVideoGestures";
import {
  MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR,
  VIDEO_HERO_MAX_HEIGHT_EXPR,
} from "./createFinalizeVideoHeroFrame";
import { lightboxSwipeBackdropRgba } from "./lightboxSwipeDim";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS C3.4A — smooth fullscreen dismiss", () => {
  it("A: vertical-down >12px locks dismiss", () => {
    expect(VIDEO_FULLSCREEN_DISMISS_LOCK_PX).toBe(12);
    expect(shouldLockFullscreenDismiss(0, 13)).toBe(true);
    expect(shouldLockFullscreenDismiss(5, 20)).toBe(true);
    expect(shouldLockFullscreenDismiss(0, 12)).toBe(false);
  });

  it("B: horizontal movement does not lock dismiss", () => {
    expect(shouldLockFullscreenDismiss(40, 10)).toBe(false);
    expect(shouldLockFullscreenDismiss(30, 25)).toBe(false);
    expect(classifyHeroPointerGesture(40, 5)).toBe("slide");
  });

  it("C: upward movement does not dismiss", () => {
    expect(shouldLockFullscreenDismiss(0, -20)).toBe(false);
    expect(shouldCommitFullscreenDismissOnRelease(-120)).toBe(false);
  });

  it("D: media follows finger during drag", () => {
    const v = computeFullscreenDismissVisual(90);
    expect(v.translateY).toBe(90);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("applyFullscreenDismissVisual");
    expect(player).toContain("data-finalize-video-dismiss-surface");
  });

  it("E: scale decreases progressively", () => {
    const a = computeFullscreenDismissVisual(0);
    const b = computeFullscreenDismissVisual(110);
    const c = computeFullscreenDismissVisual(220);
    expect(a.scale).toBe(1);
    expect(b.scale).toBeLessThan(a.scale);
    expect(c.scale).toBe(0.8);
    expect(c.scale).toBeLessThanOrEqual(b.scale);
  });

  it("F: backdrop fades progressively", () => {
    const a = computeFullscreenDismissVisual(0).backdrop;
    const b = computeFullscreenDismissVisual(100).backdrop;
    expect(a).toBe(lightboxSwipeBackdropRgba(0));
    expect(b).toBe(lightboxSwipeBackdropRgba(100));
    expect(a).not.toBe(b);
    const o0 = computeFullscreenDismissVisual(0).opacity;
    const o1 = computeFullscreenDismissVisual(110).opacity;
    expect(o1).toBeLessThan(o0);
  });

  it("G: no exitFullscreen during pointermove", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    const moveFn = player.slice(
      player.indexOf("const classifyPendingMove"),
      player.indexOf("const attachDocPointerListeners"),
    );
    expect(moveFn.length).toBeGreaterThan(100);
    expect(moveFn).not.toContain("exitCreateFinalizeVideoFullscreen");
    expect(moveFn).not.toContain("exitFullscreen");
    expect(moveFn).toContain("applyFullscreenDismissVisual");
    expect(fs).toContain("Must NOT be used to exit during pointermove");
  });

  it("H: release <100px springs back", () => {
    expect(VIDEO_FULLSCREEN_DISMISS_COMMIT_PX).toBe(100);
    expect(shouldCommitFullscreenDismissOnRelease(99)).toBe(false);
    expect(shouldCommitFullscreenDismissOnRelease(50)).toBe(false);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("animateFullscreenDismissSnapBack");
  });

  it("I: spring-back uses ~320ms easing", () => {
    expect(VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS).toBe(320);
    expect(VIDEO_FULLSCREEN_DISMISS_EASING).toBe(
      "cubic-bezier(0.22, 1, 0.32, 1)",
    );
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(fs).toContain("animateFullscreenDismissSnapBack");
    expect(fs).toContain("VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS");
  });

  it("J: release >=100px commits", () => {
    expect(shouldCommitFullscreenDismissOnRelease(100)).toBe(true);
    expect(shouldCommitFullscreenDismissOnRelease(140)).toBe(true);
  });

  it("K: committed release exits immediately (no commit animation)", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(player).not.toContain("animateFullscreenDismissCommit");
    expect(fs).not.toContain("animateFullscreenDismissCommit");
    expect(player).toMatch(
      /shouldCommitFullscreenDismissOnRelease\(dy\)[\s\S]{0,400}exitCreateFinalizeVideoFullscreen/,
    );
    expect(VIDEO_FULLSCREEN_DISMISS_PROGRESS_RANGE_PX).toBe(220);
  });

  it("L: controls do not start dismiss", () => {
    const btn = {
      closest: (sel: string) =>
        sel === "[data-video-control]" ? btn : null,
    };
    expect(
      shouldIgnoreSwipeDownExitForControlTarget(btn as unknown as EventTarget),
    ).toBe(true);
  });

  it("M: scrubber unaffected", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain('aria-label="Video progress"');
    expect(player).toContain("data-video-control");
    expect(player).toContain("shouldIgnoreSwipeDownExitForControlTarget");
  });

  it("N: tap play/pause unchanged", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "center",
        lastTap: null,
        now: 1000,
      }),
    ).toEqual({ action: "playpause" });
  });

  it("O: double tap ±3 unchanged", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "left",
        lastTap: { time: 1000, zone: "left" },
        now: 1200,
      }),
    ).toEqual({ action: "seek", direction: "back" });
    expect(computeDoubleTapSeekTime("forward", 10, 30)).toBe(13);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("P: hold 2x unchanged", () => {
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: true,
        zone: "right",
        lastTap: null,
        now: 1000,
      }),
    ).toEqual({ action: "end-hold" });
  });

  it("Q: fullscreen button still exits directly", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("toggleFullscreen");
    expect(player).toMatch(
      /isCreateFinalizeVideoFullscreenElement\(root\)[\s\S]{0,200}exitCreateFinalizeVideoFullscreen/,
    );
  });

  it("R: Android Back still exits directly", () => {
    const guard = read("src/hooks/useCreateFlowExitHistoryGuard.ts");
    expect(guard).toContain("tryExitCreateFinalizeVideoFullscreen");
    expect(guard).toContain("exit-video-fullscreen");
    expect(guard).not.toContain("animateFullscreenDismissSnapBack");
  });

  it("S: cleanup clears transform state", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("clearFullscreenDismissVisual");
    expect(player).toContain("clearDismissMotion");
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(fs).toContain("clearFullscreenDismissVisual");
  });

  it("T: normal Create layout unchanged", () => {
    expect(VIDEO_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    expect(MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS");
  });
});
