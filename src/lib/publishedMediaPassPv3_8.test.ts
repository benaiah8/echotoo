/**
 * PASS PV3.8 — published full-surface video gestures + multi-image cover.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VIDEO_DOUBLE_TAP_WINDOW_MS,
  VIDEO_LONG_PRESS_MS,
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SEEK_DELTA_SEC,
  VIDEO_SLIDE_GESTURE_THRESHOLD_PX,
  computeDoubleTapSeekTime,
  resolveVideoPointerUp,
} from "./createFinalizeVideoGestures";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8 — published video gestures", () => {
  it("A–G: surface controller + control exclusion", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("usePublishedVideoSurfaceGestures");
    expect(player).toContain("data-published-video-gesture-surface");
    expect(hook).not.toContain("isDoubleTap");
    expect(hook).toContain("Reveal-first");
    expect(hook).toContain("[data-video-control]");
    expect(hook).toContain("data-video-scrubber");
    expect(player).toContain("data-video-control");
  });

  it("H–O: single vs double tap + ± ±3s clamp", () => {
    expect(VIDEO_DOUBLE_TAP_WINDOW_MS).toBe(300);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
    expect(computeDoubleTapSeekTime("back", 1, 20)).toBe(0);
    expect(computeDoubleTapSeekTime("forward", 19, 20)).toBe(20);
    expect(computeDoubleTapSeekTime("back", 10, 20)).toBe(7);
    expect(computeDoubleTapSeekTime("forward", 10, 20)).toBe(13);

    const first = resolveVideoPointerUp({
      kind: "undecided",
      holdActive: false,
      zone: "left",
      lastTap: null,
      now: 1000,
    });
    expect(first.action).toBe("playpause");

    const second = resolveVideoPointerUp({
      kind: "undecided",
      holdActive: false,
      zone: "left",
      lastTap: { time: 1000, zone: "left" },
      now: 1200,
    });
    expect(second).toEqual({ action: "seek", direction: "back" });

    const right = resolveVideoPointerUp({
      kind: "undecided",
      holdActive: false,
      zone: "right",
      lastTap: { time: 1000, zone: "right" },
      now: 1200,
    });
    expect(right).toEqual({ action: "seek", direction: "forward" });

    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    // PV3.8.7: published no longer imports double-tap helpers; Create still does.
    expect(hook).not.toContain("VIDEO_DOUBLE_TAP_WINDOW_MS");
    expect(hook).not.toContain("computeDoubleTapSeekTime");
    expect(hook).toContain("Reveal-first");
  });

  it("P–X: long press 2x + cancel cleanup + swipe cancel", () => {
    expect(VIDEO_LONG_PRESS_MS).toBe(450);
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    expect(VIDEO_SLIDE_GESTURE_THRESHOLD_PX).toBe(10);
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("VIDEO_PLAYBACK_RATE_FAST");
    expect(hook).toContain("resetPlaybackRate");
    expect(hook).toContain("finishGestureAsCancel");
    expect(hook).toContain('kind === "slide"');
    expect(hook).toContain('kind === "other"');
    expect(hook).toContain("pointercancel");
    const holdEnd = resolveVideoPointerUp({
      kind: "undecided",
      holdActive: true,
      zone: "left",
      lastTap: null,
      now: 2000,
    });
    expect(holdEnd.action).toBe("end-hold");
    const swipe = resolveVideoPointerUp({
      kind: "slide",
      holdActive: false,
      zone: "center",
      lastTap: null,
      now: 2000,
    });
    expect(swipe.action).toBe("none");
  });

  it("Y–AC: swipe/detail/ios scoped CSS", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("PUBLISHED_MEDIA_SWIPE_NO_SELECTOR");
    expect(surface).not.toMatch(
      /PUBLISHED_MEDIA_SWIPE_NO_SELECTOR[\s\S]{0,80}published-video-gesture/,
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("-webkit-touch-callout:none");
    expect(player).toContain("playsInline");
    expect(player).toContain("touch-manipulation");
  });

  it("AD–AH: manual ownership + pause suppression + sound untouched", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("onRequestActivePlayback");
    expect(surface).toContain("onManualPause");
    expect(surface).toContain("manualForceKey");
    expect(surface).toContain("userPausedKey");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toMatch(
      /onSurfacePointerDown[\s\S]{0,200}setPublishedVideoSoundPreferenceMuted/,
    );
  });
});

describe("PASS PV3.8 — image cover policy", () => {
  it("AI–AR: single natural; multi/mixed cover; video contain; fullscreen contain; median kept", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const legacy = read("src/components/MediaCarousel.tsx");
    const fullscreen = read(
      "src/components/PublishedMediaFullscreenViewer.tsx",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const frame = read(
      "src/lib/publishedMedia/resolvePublishedMultiMediaFrame.ts",
    );

    expect(surface).toContain('layout={singleImage ? "natural" : "fill"}');
    expect(surface).toContain('fit={singleImage ? "contain" : "cover"}');
    expect(carousel).toContain('fit={naturalHeight ? "contain" : "cover"}');
    expect(legacy).toContain("multiSlideFrame");
    expect(legacy).toMatch(/multiSlideFrame[\s\S]{0,80}\? \"cover\"/);
    expect(legacy).toContain("singleImageNatural = slideCount === 1");
    expect(fullscreen).toContain("object-contain");
    expect(player).toMatch(/object-contain/);
    expect(frame).toContain("medianNumber");
    expect(frame).toContain("findPrimaryPublishedVideoAspectRatio");
  });

  it("AS–AX: prior passes + Create gestures unchanged", () => {
    expect(
      read("src/lib/publishedMedia/publishedProcessingListRevalidator.ts"),
    ).toContain("pausePublishedProcessingListPolling");
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(
      read("src/lib/publishedMedia/resolvePublishedMultiMediaFrame.ts"),
    ).toContain("PUBLISHED_MULTI_PROVISIONAL_ASPECT");
    expect(
      read("src/components/create/CreateFinalizeVideoPlayer.tsx"),
    ).toContain("resolveVideoPointerUp");
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });
});
