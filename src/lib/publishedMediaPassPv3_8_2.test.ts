/**
 * PASS PV3.8.2 — deterministic low-latency published video gestures.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VIDEO_DOUBLE_TAP_WINDOW_MS,
  VIDEO_LONG_PRESS_MS,
  VIDEO_SEEK_DELTA_SEC,
  VIDEO_SLIDE_GESTURE_THRESHOLD_PX,
} from "./createFinalizeVideoGestures";
import { PUBLISHED_HOLD_CANCEL_PX } from "./publishedMedia/usePublishedVideoSurfaceGestures";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.2 — immediate toggle + hold-anywhere", () => {
  it("A–D: immediate pause/play; no deferred pause timer", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("onRequestManualPause()");
    expect(hook).toContain("onRequestManualPlay()");
    expect(hook).toContain("wasPlaying");
    expect(hook).not.toContain("pendingPauseTimer");
    expect(hook).not.toMatch(
      /wasPlaying[\s\S]{0,120}setTimeout\([\s\S]{0,80}onRequestManualPause/,
    );
    expect(hook).toContain("Reveal-first");
  });

  it("E/W: media action is ref/direct — pause before React", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("Media first — keep active ownership");
    expect(player).toMatch(
      /requestManualPause[\s\S]{0,500}video\.pause\(\)/,
    );
    expect(player).toContain("video.paused || video.ended");
  });

  it("F/G: stable hit target — no chrome reveal on pointerdown; chromeInteractive", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(hook).toContain("Intentionally NO chrome reveal here");
    expect(player).toContain("chromeInteractive");
    expect(player).toContain("setChromeInteractive(false)");
    expect(player).toContain("pointer-events-none");
    expect(player).toContain("onPointerDownCapture");
    expect(hook).toContain("optsRef.current.onRevealChrome()");
  });

  it("H–J: published has no double-tap seek (PV3.8.7)", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(hook).not.toContain("wasPlayingBeforeToggle");
    expect(hook).not.toContain("armDoubleTapWindow");
    // Create helpers remain available for Create only.
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
    expect(VIDEO_DOUBLE_TAP_WINDOW_MS).toBe(300);
  });

  it("K–N: hold anywhere; 10px tolerance; Create 6px untouched", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("armHold");
    expect(hook).toContain("armHold()");
    // Hold is armed for every bare pointerdown — not gated on left/right zone.
    expect(hook).toMatch(/attachDocPointerListeners\(e\.pointerId\);\s*armHold\(\);/);
    expect(PUBLISHED_HOLD_CANCEL_PX).toBe(VIDEO_SLIDE_GESTURE_THRESHOLD_PX);
    expect(PUBLISHED_HOLD_CANCEL_PX).toBe(10);
    expect(VIDEO_LONG_PRESS_MS).toBe(450);
    expect(read("src/lib/createFinalizeVideoGestures.ts")).toContain(
      "VIDEO_LONG_PRESS_STATIONARY_PX = 6",
    );
  });

  it("O–R: swipe cancels hold; no toggle; rate restore", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain('kind === "slide"');
    expect(hook).toContain("hold-cancelled");
    expect(hook).toContain("hold-release");
    expect(hook).toContain("resetPlaybackRate");
    expect(hook).toContain("pointercancel");
  });

  it("S–V: controls excluded; warm promote; manual priority; soft pause", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(hook).toContain("control-excluded");
    expect(hook).toContain("data-video-control");
    expect(player).toContain("warm-promote");
    expect(player).toContain("autoplay-suppressed-manual");
    expect(surface).toContain("userPausedKey");
    expect(player).toContain(
      'gesturesEnabled = status === "ready" && Boolean(videoId.trim())',
    );
  });

  it("X–AA: timers cleared; capture path; playsInline", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(hook).toContain("clearLongPressTimer");
    expect(hook).toContain("onSurfacePointerDownCapture");
    expect(player).toContain("onPointerDownCapture={onSurfacePointerDownCapture}");
    expect(player).toContain("playsInline");
    expect(player).toContain("-webkit-touch-callout:none");
  });

  it("AB–AJ: one active; sound; images; Create unchanged markers", () => {
    expect(
      read("src/components/PublishedMediaSurface.tsx"),
    ).toContain("requestPublishedListVideoOwnership");
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      'fit={singleImage ? "contain" : "cover"}',
    );
    expect(
      read("src/components/create/CreateFinalizeVideoPlayer.tsx"),
    ).toContain("resolveVideoPointerUp");
    expect(
      read("src/lib/publishedMedia/publishedVideoStateLog.ts"),
    ).toContain("[echotoo video state]");
  });
});
