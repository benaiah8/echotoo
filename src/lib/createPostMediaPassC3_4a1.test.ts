import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VIDEO_FULLSCREEN_DISMISS_COMMIT_PX,
  VIDEO_FULLSCREEN_DISMISS_OPACITY_MIN,
  VIDEO_FULLSCREEN_DISMISS_SCALE_MIN,
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

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS C3.4A.1 — direct dismiss + stronger shrink/fade", () => {
  it("A: drag opacity decreases continuously", () => {
    const samples = [0, 40, 80, 120, 180, 220].map(
      (dy) => computeFullscreenDismissVisual(dy).opacity,
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    }
    expect(VIDEO_FULLSCREEN_DISMISS_OPACITY_MIN).toBe(0.15);
    // At progress=1: max(0.15, 1 - 0.80) = 0.20
    expect(samples[samples.length - 1]).toBeCloseTo(0.2, 5);
    expect(samples[0]).toBe(1);
  });

  it("B: drag scale decreases continuously", () => {
    const samples = [0, 40, 80, 120, 180, 220].map(
      (dy) => computeFullscreenDismissVisual(dy).scale,
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    }
  });

  it("C: min scale approximately 0.80", () => {
    expect(VIDEO_FULLSCREEN_DISMISS_SCALE_MIN).toBe(0.8);
    expect(computeFullscreenDismissVisual(220).scale).toBe(0.8);
    expect(computeFullscreenDismissVisual(110).scale).toBeCloseTo(
      1 - (110 / 220) * 0.2,
      5,
    );
  });

  it("D: translate remains 1:1 with dy", () => {
    expect(computeFullscreenDismissVisual(37).translateY).toBe(37);
    expect(computeFullscreenDismissVisual(150).translateY).toBe(150);
    expect(computeFullscreenDismissVisual(-20).translateY).toBe(0);
  });

  it("E: no exit during pointermove", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const moveFn = player.slice(
      player.indexOf("const classifyPendingMove"),
      player.indexOf("const attachDocPointerListeners"),
    );
    expect(moveFn).not.toContain("exitCreateFinalizeVideoFullscreen");
    expect(moveFn).toContain("applyFullscreenDismissVisual");
  });

  it("F: <100px release still springs back", () => {
    expect(shouldCommitFullscreenDismissOnRelease(99)).toBe(false);
    expect(VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS).toBe(320);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("animateFullscreenDismissSnapBack");
  });

  it("G: >=100px release exits immediately", () => {
    expect(VIDEO_FULLSCREEN_DISMISS_COMMIT_PX).toBe(100);
    expect(shouldCommitFullscreenDismissOnRelease(100)).toBe(true);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const release = player.slice(
      player.indexOf("const finishDismissRelease"),
      player.indexOf("const finishGestureAsUp"),
    );
    expect(release).toContain("exitCreateFinalizeVideoFullscreen");
    expect(release).not.toContain("animateFullscreenDismissCommit");
    expect(release).toContain("shouldCommitFullscreenDismissOnRelease");
    expect(release).toContain("animateFullscreenDismissSnapBack");
  });

  it("H: committed release has no ~250ms commit timer", () => {
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(fs).not.toContain("VIDEO_FULLSCREEN_DISMISS_COMMIT_MS");
    expect(fs).not.toContain("animateFullscreenDismissCommit");
    expect(player).not.toContain("animateFullscreenDismissCommit");
  });

  it("I: transform is not reset before exitFullscreen", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const release = player.slice(
      player.indexOf("const finishDismissRelease"),
      player.indexOf("const finishGestureAsUp"),
    );
    const commitIdx = release.indexOf("shouldCommitFullscreenDismissOnRelease");
    const snapIdx = release.indexOf("void animateFullscreenDismissSnapBack");
    const commitBranch = release.slice(commitIdx, snapIdx);
    expect(commitBranch).toMatch(
      /exitCreateFinalizeVideoFullscreen\(\)\.finally\(\(\)\s*=>\s*\{[\s\S]*clearDismissMotion/,
    );
    const beforeExit = commitBranch.slice(
      0,
      commitBranch.indexOf("exitCreateFinalizeVideoFullscreen"),
    );
    expect(beforeExit).not.toContain("clearDismissMotion");
    expect(beforeExit).not.toContain("clearFullscreenDismissVisual");
  });

  it("J: cleanup resets transform after fullscreen exit", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("clearFullscreenDismissVisual");
    expect(player).toContain("clearDismissMotion");
  });

  it("K: tap unchanged", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "center",
        lastTap: null,
        now: 1,
      }),
    ).toEqual({ action: "playpause" });
  });

  it("L: double tap unchanged", () => {
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
    expect(computeDoubleTapSeekTime("back", 9, 30)).toBe(6);
  });

  it("M: hold 2x unchanged", () => {
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
  });

  it("N: horizontal swipe unchanged", () => {
    expect(classifyHeroPointerGesture(40, 5)).toBe("slide");
    expect(shouldLockFullscreenDismiss(40, 10)).toBe(false);
  });

  it("O: controls unchanged", () => {
    const btn = {
      closest: (sel: string) =>
        sel === "[data-video-control]" ? btn : null,
    };
    expect(
      shouldIgnoreSwipeDownExitForControlTarget(btn as unknown as EventTarget),
    ).toBe(true);
  });
});
