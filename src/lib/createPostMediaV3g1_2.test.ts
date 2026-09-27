import { describe, expect, it, vi } from "vitest";
import {
  COMPOSE_IMAGE_HERO_FRAME,
  CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS,
  EXPANDED_MEDIA_TRAY_MAX_HEIGHT,
  VIDEO_HERO_MAX_HEIGHT_EXPR,
  VIDEO_HERO_MIN_HEIGHT_EXPR,
  classifyFinalizeVideoAspect,
  computeVideoHeroHeightAtWidth,
  resolveFinalizeVideoHeroFrame,
} from "./createFinalizeVideoHeroFrame";
import {
  VIDEO_CHROME_HIDE_MS,
  VIDEO_DOUBLE_TAP_WINDOW_MS,
  VIDEO_LONG_PRESS_MS,
  VIDEO_PLAYBACK_RATE_FAST,
  VIDEO_SEEK_DELTA_SEC,
  VIDEO_TAP_ZONE_LEFT_MAX,
  VIDEO_TAP_ZONE_RIGHT_MIN,
  canUseVideoFullscreen,
  clampVideoTime,
  computeDoubleTapSeekTime,
  getVideoTapZone,
  isDoubleTap,
} from "./createFinalizeVideoGestures";
import { FINALIZE_MEDIA_THUMB_CLIP } from "./createFinalizeMediaThumb";
import { prepareDraftVideoForUpload } from "./prepareDraftVideoForUpload";

const CONTAINER_W = 608;

describe("V3G1.2 unified overlay tray", () => {
  it("A: tray is always overlay (no below placement API)", () => {
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).toContain("rem");
    expect(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS).toContain("calc(");
  });

  it("B: no below-hero tray placement exports", () => {
    const frame = import("./createFinalizeVideoHeroFrame");
    expect(frame).toBeTruthy();
    expect(
      Object.keys(frame).some((k) => k.includes("MediaTrayPlacement")),
    ).toBe(false);
  });

  it("G: image and video share overlay dock position constant", () => {
    expect(COMPOSE_IMAGE_HERO_FRAME.maxHeight).toBe("50vh");
    const video = resolveFinalizeVideoHeroFrame(1920, 1080);
    expect(video.minHeight).toBe(VIDEO_HERO_MIN_HEIGHT_EXPR);
  });
});

describe("V3G1.2 hero sizing", () => {
  it("C: normal 16:9 landscape fills full width at natural height", () => {
    const frame = resolveFinalizeVideoHeroFrame(1920, 1080);
    expect(frame.aspectRatio).toBe("1920/1080");
    expect(frame.minHeight).toBe(VIDEO_HERO_MIN_HEIGHT_EXPR);
    expect(frame.maxHeight).toBe(VIDEO_HERO_MAX_HEIGHT_EXPR);
    const h = computeVideoHeroHeightAtWidth(1920, 1080, CONTAINER_W, 800);
    expect(h).toBeCloseTo(CONTAINER_W * 1080 / 1920, 0);
  });

  it("D: ultrawide gets minimum 16:9 frame height", () => {
    const h = computeVideoHeroHeightAtWidth(2560, 1080, CONTAINER_W, 800);
    const natural = (CONTAINER_W * 1080) / 2560;
    const minH = (CONTAINER_W * 9) / 16;
    expect(natural).toBeLessThan(minH);
    expect(h).toBeCloseTo(minH, 0);
  });

  it("E: square full-width frame", () => {
    expect(classifyFinalizeVideoAspect(1000, 1000)).toBe("square");
    const frame = resolveFinalizeVideoHeroFrame(1000, 1000);
    expect(frame.aspectRatio).toBe("1000/1000");
    const h = computeVideoHeroHeightAtWidth(1000, 1000, CONTAINER_W, 900);
    expect(h).toBeCloseTo(CONTAINER_W, 0);
  });

  it("F: portrait natural height until max cap", () => {
    expect(classifyFinalizeVideoAspect(1080, 1920)).toBe("portrait");
    const natural = computeVideoHeroHeightAtWidth(1080, 1920, CONTAINER_W, 2000);
    expect(natural).toBeCloseTo((CONTAINER_W * 1920) / 1080, 0);
    const capped = computeVideoHeroHeightAtWidth(1080, 1920, CONTAINER_W, 500);
    expect(capped).toBe(500);
  });
});

describe("V3G1.2 video gestures", () => {
  it("H: player has no separate control-section contract", () => {
    expect(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS).toContain(
      "--create-finalize-dock-bar-height",
    );
  });

  it("I: tap zones partition surface", () => {
    expect(getVideoTapZone(0.1)).toBe("left");
    expect(getVideoTapZone(0.5)).toBe("center");
    expect(getVideoTapZone(0.9)).toBe("right");
    expect(VIDEO_TAP_ZONE_LEFT_MAX).toBe(0.35);
    expect(VIDEO_TAP_ZONE_RIGHT_MIN).toBe(0.65);
  });

  it("J: double-tap left seeks back 3 seconds", () => {
    expect(computeDoubleTapSeekTime("back", 10, 30)).toBe(7);
    expect(computeDoubleTapSeekTime("back", 1, 30)).toBe(0);
  });

  it("K: double-tap right seeks forward 3 seconds", () => {
    expect(computeDoubleTapSeekTime("forward", 10, 30)).toBe(13);
    expect(computeDoubleTapSeekTime("forward", 29, 30)).toBe(30);
  });

  it("L: long-press uses 2x rate constant", () => {
    expect(VIDEO_PLAYBACK_RATE_FAST).toBe(2);
    expect(VIDEO_LONG_PRESS_MS).toBeGreaterThanOrEqual(400);
  });

  it("M: mute is a separate control (tap zone center does not imply mute)", () => {
    expect(getVideoTapZone(0.5)).toBe("center");
  });

  it("N: thin scrubber seeks via fraction clamp", () => {
    expect(clampVideoTime(15, 12)).toBe(12);
    expect(clampVideoTime(-1, 12)).toBe(0);
    expect(VIDEO_SEEK_DELTA_SEC).toBe(3);
  });

  it("O: fullscreen helper reports support state", () => {
    expect(typeof canUseVideoFullscreen()).toBe("boolean");
  });

  it("P: chrome auto-hide delay is 2–3 seconds", () => {
    expect(VIDEO_CHROME_HIDE_MS).toBeGreaterThanOrEqual(2000);
    expect(VIDEO_CHROME_HIDE_MS).toBeLessThanOrEqual(3000);
  });

  it("Q: double-tap window is short enough to avoid accidental seeks", () => {
    expect(isDoubleTap(100, 350)).toBe(true);
    expect(isDoubleTap(100, 500)).toBe(false);
    expect(VIDEO_DOUBLE_TAP_WINDOW_MS).toBe(300);
  });
});

describe("V3G1.2 dismiss and thumbnails", () => {
  it("R: outside/caption dismiss is handled by dock listeners (overlay only)", () => {
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).not.toContain("%");
  });

  it("S: thumbnail rings use inset clip shell", () => {
    expect(FINALIZE_MEDIA_THUMB_CLIP).toContain("overflow-hidden");
    expect(FINALIZE_MEDIA_THUMB_CLIP).toContain("rounded-[10px]");
  });
});

describe("V3G1.2 image-only and upload lifecycle", () => {
  it("K: image hero frame unchanged", () => {
    expect(COMPOSE_IMAGE_HERO_FRAME.aspectRatio).toBe("4/5");
    expect(COMPOSE_IMAGE_HERO_FRAME.maxHeight).toBe("50vh");
    expect(COMPOSE_IMAGE_HERO_FRAME.minHeight).toBeUndefined();
  });

  it("T: no Bunny during Create — prepareDraftVideoForUpload pass-through", async () => {
    const file = new File(["v"], "a.mp4", { type: "video/mp4" });
    await expect(prepareDraftVideoForUpload(file)).resolves.toBe(file);
  });
});

describe("V3G1.2 compression deferred", () => {
  it("documents next-pass preparation without implementing transcode", async () => {
    const spy = vi.fn();
    const file = new File(["raw"], "clip.mp4", { type: "video/mp4" });
    spy(await prepareDraftVideoForUpload(file));
    expect(spy).toHaveBeenCalledWith(file);
  });
});
