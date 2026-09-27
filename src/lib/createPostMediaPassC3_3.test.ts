import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAndroidImmersiveOnFullscreenEnter,
  getAndroidImmersiveSession,
  restoreAndroidSystemBarsAfterVideoFullscreen,
  setCreateFinalizeVideoFullscreenExitHandler,
  shouldAttemptAndroidImmersiveSystemBars,
  shouldExitFullscreenOnSwipeDown,
  shouldIgnoreSwipeDownExitForControlTarget,
  syncFullscreenChangeState,
  tryExitCreateFinalizeVideoFullscreen,
  VIDEO_FULLSCREEN_CONTROLS_TOP_CSS,
  VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS,
  VIDEO_FULLSCREEN_SWIPE_DOWN_THRESHOLD_PX,
} from "./createFinalizeVideoFullscreen";
import { resolveCreateFlowBackAction } from "./createFlowExitHistoryEngagement";
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

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const baseBack = {
  skipPopstate: false,
  metadataRemoveConfirmOpen: false,
  placeToEventConfirmOpen: false,
  eventToPlaceConfirmOpen: false,
  finalizeSheetOpen: false,
  leaveDialogOpen: false,
  mediaPickerOpen: false,
  shouldConfirmLeave: true,
  source: "android" as const,
  historyStateHasMarker: true,
};

describe("PASS C3.3 — Android immersive fullscreen + swipe-down exit", () => {
  afterEach(() => {
    restoreAndroidSystemBarsAfterVideoFullscreen();
    setCreateFinalizeVideoFullscreenExitHandler(null);
  });

  it("A: Android fullscreen attempts immersive system-bar presentation", () => {
    expect(
      shouldAttemptAndroidImmersiveSystemBars({
        platform: "android",
        native: true,
      }),
    ).toBe(true);
    expect(
      shouldAttemptAndroidImmersiveSystemBars({
        platform: "web",
        native: false,
      }),
    ).toBe(false);

    const session = applyAndroidImmersiveOnFullscreenEnter({
      platform: "android",
      native: true,
    });
    expect(session.applied).toBe(true);
    expect(session.mode).toBe("fullscreen-navigationUI-hide");
    expect(getAndroidImmersiveSession()?.applied).toBe(true);

    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(fs).toContain("navigationUI");
    expect(fs).toContain('"hide"');
    expect(player).toContain("requestCreateFinalizeVideoFullscreen");
    // Create path stays on Fullscreen API navigationUI — not StatusBar calls.
    // Published immersive fullscreen owns @capacitor/status-bar separately.
    expect(fs).not.toMatch(/from\s+["']@capacitor\/status-bar["']/);
    expect(fs).not.toContain("enterPublishedImmersiveStatusBar");
    expect(fs).not.toContain("StatusBar.hide");
    expect(fs).not.toContain("StatusBar.show");
    expect(read("package.json")).toContain("@capacitor/status-bar");
  });

  it("B: system bars restore after normal fullscreen exit", () => {
    applyAndroidImmersiveOnFullscreenEnter({
      platform: "android",
      native: true,
    });
    expect(getAndroidImmersiveSession()?.applied).toBe(true);
    restoreAndroidSystemBarsAfterVideoFullscreen();
    expect(getAndroidImmersiveSession()).toBeNull();

    const sync = syncFullscreenChangeState({
      container: null,
      wasFullscreen: true,
    });
    expect(sync.exited).toBe(true);
    expect(sync.isFullscreen).toBe(false);
  });

  it("C: system bars restore after swipe-down exit", () => {
    applyAndroidImmersiveOnFullscreenEnter({
      platform: "android",
      native: true,
    });
    expect(shouldExitFullscreenOnSwipeDown(10, 110)).toBe(true);
    restoreAndroidSystemBarsAfterVideoFullscreen();
    expect(getAndroidImmersiveSession()).toBeNull();

    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("shouldLockFullscreenDismiss");
    expect(player).toContain("exitCreateFinalizeVideoFullscreen");
  });

  it("D: system bars restore on component cleanup", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("restoreAndroidSystemBarsAfterVideoFullscreen");
    expect(player).toMatch(
      /return \(\) => \{[\s\S]*restoreAndroidSystemBarsAfterVideoFullscreen/,
    );
    expect(player).toContain("exitCreateFinalizeVideoFullscreen");
  });

  it("E: fullscreen controls respect safe-area top", () => {
    expect(VIDEO_FULLSCREEN_CONTROLS_TOP_CSS).toContain(
      "safe-area-inset-top",
    );
    expect(VIDEO_FULLSCREEN_CONTROLS_TOP_CSS).toContain("max(");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("VIDEO_FULLSCREEN_CONTROLS_TOP_CSS");
    expect(player).not.toMatch(
      /isFullscreen[\s\S]{0,80}top:\s*["']8px["']/,
    );
  });

  it("F: scrubber respects safe-area bottom", () => {
    expect(VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS).toContain(
      "safe-area-inset-bottom",
    );
    expect(VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS).toContain("max(");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS");
  });

  it("G: downward swipe beyond release threshold commits dismiss", () => {
    expect(VIDEO_FULLSCREEN_SWIPE_DOWN_THRESHOLD_PX).toBe(100);
    expect(shouldExitFullscreenOnSwipeDown(0, 100)).toBe(true);
    expect(shouldExitFullscreenOnSwipeDown(20, 110)).toBe(true);
    expect(shouldExitFullscreenOnSwipeDown(0, 80)).toBe(false);
  });

  it("H: small vertical movement does not exit", () => {
    expect(shouldExitFullscreenOnSwipeDown(0, 20)).toBe(false);
    expect(shouldExitFullscreenOnSwipeDown(5, 40)).toBe(false);
  });

  it("I: upward swipe does not exit", () => {
    expect(shouldExitFullscreenOnSwipeDown(0, -90)).toBe(false);
    expect(shouldExitFullscreenOnSwipeDown(10, -100)).toBe(false);
  });

  it("J: horizontal swipe does not exit", () => {
    expect(shouldExitFullscreenOnSwipeDown(100, 30)).toBe(false);
    expect(shouldExitFullscreenOnSwipeDown(-120, 50)).toBe(false);
    expect(classifyHeroPointerGesture(40, 5)).toBe("slide");
  });

  it("G2: C3.4A player never exits fullscreen during pointermove", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("shouldLockFullscreenDismiss");
    expect(player).toContain("shouldCommitFullscreenDismissOnRelease");
    expect(player).toContain("exitCreateFinalizeVideoFullscreen");
    const moveFn = player.slice(
      player.indexOf("const classifyPendingMove"),
      player.indexOf("const attachDocPointerListeners"),
    );
    expect(moveFn).not.toContain("exitCreateFinalizeVideoFullscreen");
    expect(moveFn).not.toContain("exitFullscreen");
  });

  it("K: scrubber interaction does not exit", () => {
    const scrub = {
      closest: (sel: string) =>
        sel === "[data-video-control]" ? scrub : null,
    };
    expect(
      shouldIgnoreSwipeDownExitForControlTarget(
        scrub as unknown as EventTarget,
      ),
    ).toBe(true);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("data-video-control");
    expect(player).toContain("shouldIgnoreSwipeDownExitForControlTarget");
  });

  it("L: mute/fullscreen controls do not trigger swipe exit", () => {
    const btn = {
      closest: (sel: string) =>
        sel === "[data-video-control]" ? btn : null,
    };
    expect(
      shouldIgnoreSwipeDownExitForControlTarget(btn as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldIgnoreSwipeDownExitForControlTarget({} as EventTarget),
    ).toBe(false);
  });

  it("M: single tap play/pause unchanged", () => {
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

  it("N: double-tap ±3 sec unchanged", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "left",
        lastTap: { time: 1000, zone: "left" },
        now: 1200,
      }),
    ).toEqual({ action: "seek", direction: "back" });
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "right",
        lastTap: { time: 1000, zone: "right" },
        now: 1200,
      }),
    ).toEqual({ action: "seek", direction: "forward" });
    expect(computeDoubleTapSeekTime("back", 10, 30)).toBe(7);
    expect(computeDoubleTapSeekTime("forward", 10, 30)).toBe(13);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("O: hold 2x unchanged", () => {
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: true,
        zone: "left",
        lastTap: null,
        now: 1000,
      }),
    ).toEqual({ action: "end-hold" });
  });

  it("P: Android Back exits fullscreen before Leave Create", () => {
    const plan = resolveCreateFlowBackAction({
      ...baseBack,
      videoFullscreenOpen: true,
    });
    expect(plan).toEqual({
      kind: "exit-video-fullscreen",
      restoreMarker: true,
    });
    expect(plan.kind).not.toBe("request-leave");

    const planLeave = resolveCreateFlowBackAction({
      ...baseBack,
      videoFullscreenOpen: false,
    });
    expect(planLeave.kind).toBe("request-leave");

    const guard = read("src/hooks/useCreateFlowExitHistoryGuard.ts");
    expect(guard).toContain("isCreateFinalizeVideoFullscreenOpen");
    expect(guard).toContain("tryExitCreateFinalizeVideoFullscreen");
    expect(guard).toContain("exit-video-fullscreen");
  });

  it("Q: desktop Escape works via Fullscreen API sync", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("fullscreenchange");
    expect(player).toContain("syncFullscreenChangeState");
  });

  it("R: normal non-fullscreen Create layout unchanged", () => {
    expect(VIDEO_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    expect(MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS");
    expect(player).toMatch(
      /isFullscreen\s*\?\s*VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS\s*:\s*CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS/,
    );
  });

  it("S: no Bunny activity", () => {
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(fs.toLowerCase()).not.toContain("bunny");
    expect(player.toLowerCase()).not.toContain("bunny");
  });

  it("tryExitCreateFinalizeVideoFullscreen invokes registered handler", async () => {
    const exit = vi.fn(async () => {
      restoreAndroidSystemBarsAfterVideoFullscreen();
      setCreateFinalizeVideoFullscreenExitHandler(null);
    });
    setCreateFinalizeVideoFullscreenExitHandler(exit);
    applyAndroidImmersiveOnFullscreenEnter({
      platform: "android",
      native: true,
    });
    const handled = await tryExitCreateFinalizeVideoFullscreen();
    expect(handled).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("web/iOS uses safe-area fallback when not native Android", () => {
    const session = applyAndroidImmersiveOnFullscreenEnter({
      platform: "ios",
      native: true,
    });
    expect(session.applied).toBe(false);
    expect(session.mode).toBe("safe-area-fallback");
  });
});
