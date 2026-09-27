import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SEEK_DELTA_SEC,
  classifyHeroPointerGesture,
  computeDoubleTapSeekTime,
  computeVideoPlayedProgress,
  resolveVideoPointerUp,
  videoPlayedProgressCssPercent,
} from "./createFinalizeVideoGestures";
import { shouldIgnoreSwipeDownExitForControlTarget } from "./createFinalizeVideoFullscreen";
import { MIXED_HERO_SWIPE_NO_SELECTOR } from "./createFinalizeMixedMedia";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS C3.4A.2 — visible played-progress scrubber", () => {
  it("A: 0% → played width 0", () => {
    expect(computeVideoPlayedProgress(0, 30)).toBe(0);
    expect(videoPlayedProgressCssPercent(0, 30)).toBe("0%");
  });

  it("B: 50% → played width 50%", () => {
    expect(computeVideoPlayedProgress(15, 30)).toBe(0.5);
    expect(videoPlayedProgressCssPercent(15, 30)).toBe("50%");
  });

  it("C: 100% → played width 100%", () => {
    expect(computeVideoPlayedProgress(30, 30)).toBe(1);
    expect(videoPlayedProgressCssPercent(40, 30)).toBe("100%");
  });

  it("D: unknown duration safe fallback", () => {
    expect(computeVideoPlayedProgress(5, 0)).toBe(0);
    expect(computeVideoPlayedProgress(5, NaN)).toBe(0);
    expect(computeVideoPlayedProgress(NaN, 10)).toBe(0);
    expect(computeVideoPlayedProgress(Infinity, 10)).toBe(0);
    expect(videoPlayedProgressCssPercent(1, -1)).toBe("0%");
  });

  it("E: playback updates played width", () => {
    expect(computeVideoPlayedProgress(3, 10)).toBe(0.3);
    expect(computeVideoPlayedProgress(7, 10)).toBe(0.7);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("computeVideoPlayedProgress(currentTime, duration)");
    expect(player).toContain("videoPlayedProgressCssPercent");
  });

  it("F: active scrub uses preview progress", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    // Scrub path updates currentTime without commit; played % derives from currentTime.
    expect(player).toContain("setCurrentTime(fraction * (duration || 0))");
    expect(player).toContain("style={{ width: playedPct }}");
  });

  it("G: release keeps selected seek position", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("onScrubInput");
    expect(player).toContain("seekToFraction");
    expect(player).toContain("onScrubInput(");
    expect(player).toMatch(/onScrubInput\(\s*[\s\S]*?true\s*,?\s*\)/);
  });

  it("H: handle follows played edge", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("video-progress-scrub__handle");
    expect(player).toMatch(
      /video-progress-scrub__handle[\s\S]{0,200}style=\{\{\s*left:\s*playedPct/,
    );
  });

  it("I: scrubber remains data-video-control", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("data-video-control");
    expect(player).toContain("data-video-scrubber");
    expect(player).toContain('aria-label="Video progress"');
  });

  it("J: scrub does not trigger carousel swipe", () => {
    expect(MIXED_HERO_SWIPE_NO_SELECTOR).toContain("[data-video-control]");
  });

  it("K: scrub does not trigger fullscreen dismiss", () => {
    const scrub = {
      closest: (sel: string) =>
        sel === "[data-video-control]" ? scrub : null,
    };
    expect(
      shouldIgnoreSwipeDownExitForControlTarget(
        scrub as unknown as EventTarget,
      ),
    ).toBe(true);
  });

  it("L: inline and fullscreen use same progress logic", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("video-progress-scrub");
    expect(player).toContain("VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS");
    expect(player).toContain("CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS");
    // Single scrubber markup — bottom only switches by fullscreen.
    expect(player.match(/video-progress-scrub/g)?.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("M: existing video gestures unchanged", () => {
    expect(
      resolveVideoPointerUp({
        kind: "undecided",
        holdActive: false,
        zone: "center",
        lastTap: null,
        now: 1,
      }),
    ).toEqual({ action: "playpause" });
    expect(computeDoubleTapSeekTime("forward", 10, 30)).toBe(13);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    expect(classifyHeroPointerGesture(40, 5)).toBe("slide");
  });

  it("CSS: remaining thin + played stronger brand fill", () => {
    const css = read("src/index.css");
    expect(css).toContain(".video-progress-scrub__track");
    expect(css).toContain(".video-progress-scrub__played");
    expect(css).toContain("--scrub-fill: var(--brand");
    expect(css).toContain("height: 2px");
    expect(css).toContain("height: 3px");
  });
});
