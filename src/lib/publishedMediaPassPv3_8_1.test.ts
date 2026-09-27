/**
 * PASS PV3.8.1 — stable manual playback (superseded interaction timing by PV3.8.2).
 * Keeps ownership / muted-retry / soft-pause / warm-promote contracts green.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VIDEO_DOUBLE_TAP_WINDOW_MS,
  VIDEO_SEEK_DELTA_SEC,
} from "./createFinalizeVideoGestures";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.8.1 — sync play / ownership (PV3.8.2-compatible)", () => {
  it("A/B: paused surface tap plays sync (no delayed play timer)", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("onRequestManualPlay");
    expect(hook).toContain("onRequestManualPlay()");
    expect(hook).not.toMatch(
      /isPaused[\s\S]{0,200}setTimeout\([\s\S]{0,120}onRequestManualPlay/,
    );
    expect(hook).toContain("Reveal-first");
  });

  it("C–E: published double-tap seek removed (PV3.8.7); Create keeps ±3s helpers", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).not.toContain("doubleSeek");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(hook).toContain("onRequestManualPause");
    expect(VIDEO_DOUBLE_TAP_WINDOW_MS).toBe(300);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("F/G: chrome hit-testing suppressed during bare-surface pointer", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(hook).toContain("onSurfaceGestureStart");
    expect(hook).toContain("onSurfaceGestureEnd");
    expect(player).toContain("chromeInteractive");
    expect(player).toContain("setChromeInteractive(false)");
  });

  it("H–J: toggle uses video.paused; playPending clears; no pending-as-pause", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("video.paused || video.ended");
    expect(player).toContain("requestManualPlay");
    expect(player).toContain("requestManualPause");
    expect(player).toContain("finally {");
    expect(player).toContain("setPlayPending(false)");
    expect(player).not.toContain(
      "playing || (userWantsPlayRef.current && playPending)",
    );
  });

  it("K/L: manual muted retry once; preference untouched", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('intent === "manual"');
    expect(player).toContain("manual-muted-retry");
    expect(player).toContain("isAutoplaySoundBlockedError");
    expect(player).not.toMatch(
      /manual-muted-retry[\s\S]{0,200}setPublishedVideoSoundPreferenceMuted/,
    );
  });

  it("M/N: autoplay suppressed while manual; no duplicate play", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("autoplay-suppressed-manual");
    expect(player).toContain('playIntentRef.current === "manual"');
    expect(player).toContain("manualPlayInFlightRef");
  });

  it("O: idle tearDown suppressed during manual ownership catch-up", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("teardown-suppressed-manual-inflight");
    expect(player).toContain("manualPlayInFlightRef.current");
  });

  it("P/Q: warm tap promotes + HLS reuse", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("warm-promote");
    expect(player).toContain("hls-reuse");
    expect(player).toContain(
      "gesturesEnabled = status === \"ready\" && Boolean(videoId.trim())",
    );
  });

  it("R/S/T: soft pause retain; offscreen clears; tearDown still exists", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    // PV3.8.4: soft-pause removed — ACTIVE + USER_PAUSED keeps ownership.
    expect(surface).toContain("holdActiveWhileUserPaused");
    expect(surface).toContain("userPausedKey");
    expect(player).toContain("userPaused");
    expect(player).toContain("hls-teardown");
    expect(player).toContain("tearDownPlayback");
  });

  it("U–X: long press / swipe cancel / controls / ±3s", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(hook).toContain("VIDEO_PLAYBACK_RATE_FAST");
    expect(hook).toContain('kind === "slide"');
    expect(hook).toContain("[data-video-control]");
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("Y–AD: list/detail/fullscreen + activation architecture markers", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(player).toContain('mode === "detail"');
    expect(player).toContain("hasMedia");
    expect(player).toContain("void tryPlayIfWanted()");
    expect(player).toContain("playsInline");
  });

  it("AE–AJ: prior passes + Create + images untouched markers", () => {
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(
      read("src/lib/publishedMedia/resolvePublishedMultiMediaFrame.ts"),
    ).toContain("medianNumber");
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
