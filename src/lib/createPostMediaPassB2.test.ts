import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATE_FINALIZE_DOCK_BOTTOM_CSS,
  CREATE_FINALIZE_DOCK_STACK_ORDER,
} from "./createFinalizeMediaDockLayout";
import {
  COMPOSE_IMAGE_HERO_FRAME,
  COMPOSER_CONTENT_WIDTH_EXPR,
  EXPANDED_MEDIA_TRAY_MAX_HEIGHT,
  MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR,
  MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR,
  VIDEO_HERO_MAX_HEIGHT_EXPR,
  classifyFinalizeVideoAspect,
  computeMixedMediaHeroHeightAtWidth,
  resolveFinalizeComposeHeroFrame,
  resolveFinalizeMixedMediaHeroFrame,
} from "./createFinalizeVideoHeroFrame";
import {
  finalizeHeroIndexToImageIndex,
  finalizeHeroMediaOffset,
  isFinalizeVideoHeroIndex,
} from "./createFinalizeHeroMedia";

const CONTAINER_W = 608;

describe("PASS B2 — image-only draft", () => {
  it("A/N: existing 4/5 frame unchanged", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: false,
      activeVideoHero: false,
    });
    expect(frame.aspectRatio).toBe(COMPOSE_IMAGE_HERO_FRAME.aspectRatio);
    expect(frame.maxHeight).toBe(COMPOSE_IMAGE_HERO_FRAME.maxHeight);
    expect(frame.minHeight).toBeUndefined();
  });
});

describe("PASS B2 — mixed square-minimum policy", () => {
  it("B: landscape video-only uses square minimum", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: true,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    expect(frame.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(frame.minHeight).toBe(COMPOSER_CONTENT_WIDTH_EXPR);
    const h = computeMixedMediaHeroHeightAtWidth(1920, 1080, CONTAINER_W, 900);
    expect(h).toBe(CONTAINER_W);
  });

  it("C: landscape video + images still use mixed square minimum", () => {
    const videoFrame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: true,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    const imageFrame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
    });
    expect(videoFrame.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(imageFrame.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(imageFrame.aspectRatio).not.toBe(COMPOSE_IMAGE_HERO_FRAME.aspectRatio);
  });

  it("D: square video fills square frame", () => {
    const frame = resolveFinalizeMixedMediaHeroFrame(1000, 1000);
    expect(frame.aspectRatio).toBe("1000/1000");
    expect(classifyFinalizeVideoAspect(1000, 1000)).toBe("square");
    const h = computeMixedMediaHeroHeightAtWidth(1000, 1000, CONTAINER_W, 900);
    expect(h).toBe(CONTAINER_W);
  });

  it("E: portrait video may exceed square minimum", () => {
    const h = computeMixedMediaHeroHeightAtWidth(1080, 1920, CONTAINER_W, 2000);
    expect(h).toBeGreaterThan(CONTAINER_W);
    expect(h).toBeCloseTo((CONTAINER_W * 1920) / 1080, 0);
  });

  it("F: portrait video respects safe max cap", () => {
    const natural = computeMixedMediaHeroHeightAtWidth(
      1080,
      1920,
      CONTAINER_W,
      2000,
    );
    expect(natural).toBeGreaterThan(CONTAINER_W);
    const capped = computeMixedMediaHeroHeightAtWidth(1080, 1920, CONTAINER_W, 900);
    expect(capped).toBe(900);
  });
});

describe("PASS B2 — active image in mixed draft", () => {
  it("G: does NOT use legacy image-only 4/5 policy", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
      videoWidth: 1080,
      videoHeight: 1920,
    });
    expect(frame.aspectRatio).not.toBe("4/5");
    expect(frame.maxHeight).not.toBe("50vh");
  });

  it("H: active image uses shared video-derived frame (C3.2)", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
      videoWidth: 1080,
      videoHeight: 1920,
    });
    expect(frame.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(frame.aspectRatio).toBe("1080/1920");
  });
});

describe("PASS B2 — shared frame system across swaps", () => {
  it("I/J: video and image active states share identical mixed frame", () => {
    const video = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: true,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    const image = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    expect(video).toEqual(image);
    expect(video.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(video.maxHeight).toBe(MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR);
    expect(video.maxHeight).toBe(VIDEO_HERO_MAX_HEIGHT_EXPR);
  });
});

describe("PASS B2 — dock and hero mapping unchanged", () => {
  it("K: dock stack order keeps bar bottom-anchored", () => {
    expect(CREATE_FINALIZE_DOCK_STACK_ORDER).toEqual(["strip", "bar"]);
    expect(CREATE_FINALIZE_DOCK_BOTTOM_CSS).toBe("0.5rem");
  });

  it("L: expanded tray height is independent of hero frame exports", () => {
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).toContain("rem");
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).not.toContain("dvh");
  });

  it("M: hero index / thumb offset mapping unchanged", () => {
    expect(isFinalizeVideoHeroIndex(0, true)).toBe(true);
    expect(finalizeHeroMediaOffset(true)).toBe(1);
    expect(finalizeHeroIndexToImageIndex(1, true)).toBe(0);
  });

  it("dock and strip files not modified for B2 frame work", () => {
    const dock = readFileSync(
      join(process.cwd(), "src/components/create/CreateFinalizeHeroImageDock.tsx"),
      "utf8",
    );
    expect(dock).toContain("data-media-dock-stack");
    expect(dock).not.toContain("resolveFinalizeMixedMediaHeroFrame");
  });
});

describe("PASS B2 — intrinsic image dimension handling", () => {
  it("documents square fallback until video dimensions exist", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
    });
    // No video width/height yet — shared mixed frame uses 1:1 square fallback.
    expect(frame.aspectRatio).toBe("1/1");
  });
});

describe("PASS B2 — hero height transition preserved", () => {
  it("PostDetailBody keeps restrained max-height transition on compose shell", () => {
    const body = readFileSync(
      join(process.cwd(), "src/components/detail/PostDetailBody.tsx"),
      "utf8",
    );
    expect(body).toContain("max-height 200ms ease");
    expect(body).not.toContain("spring");
  });
});
