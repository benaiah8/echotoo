/**
 * Pass 2E — progressive image URL readiness for Feed → Detail instant paint.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROGRESSIVE_IMAGE_READINESS_CACHE_MAX,
  __progressiveImageReadinessCacheSizeForTests,
  __resetProgressiveImageReadinessCacheForTests,
  forgetProgressiveImageUrlReady,
  isProgressiveImageUrlReady,
  rememberProgressiveImageUrlReady,
} from "./progressiveImageReadinessCache";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PASS 2E — readiness cache", () => {
  beforeEach(() => {
    __resetProgressiveImageReadinessCacheForTests();
  });

  it("1: first mount has no readiness until remember", () => {
    expect(isProgressiveImageUrlReady("https://cdn.example/a.jpg?w=800")).toBe(
      false,
    );
  });

  it("2: successful load records URL readiness", () => {
    rememberProgressiveImageUrlReady("https://cdn.example/a.jpg?w=800");
    expect(isProgressiveImageUrlReady("https://cdn.example/a.jpg?w=800")).toBe(
      true,
    );
  });

  it("3: second mount with identical URL starts ready", () => {
    const url = "https://cdn.example/feed-detail.jpg?w=800";
    rememberProgressiveImageUrlReady(url);
    expect(isProgressiveImageUrlReady(url)).toBe(true);
  });

  it("4: different URL is not incorrectly marked ready", () => {
    rememberProgressiveImageUrlReady("https://cdn.example/a.jpg?w=800");
    expect(isProgressiveImageUrlReady("https://cdn.example/b.jpg?w=800")).toBe(
      false,
    );
  });

  it("5: low/high-quality variants are distinguished", () => {
    const low = "https://cdn.example/x.jpg?q_auto:low&w_50";
    const high = "https://cdn.example/x.jpg?w=800";
    rememberProgressiveImageUrlReady(low);
    expect(isProgressiveImageUrlReady(low)).toBe(true);
    expect(isProgressiveImageUrlReady(high)).toBe(false);
    rememberProgressiveImageUrlReady(high);
    expect(isProgressiveImageUrlReady(high)).toBe(true);
  });

  it("6: failed image is not cached as successful (forget / never remember)", () => {
    const url = "https://cdn.example/fail.jpg";
    rememberProgressiveImageUrlReady(url);
    forgetProgressiveImageUrlReady(url);
    expect(isProgressiveImageUrlReady(url)).toBe(false);
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("Do not cache failures");
    expect(src).toContain("forgetProgressiveImageUrlReady(optimizedUrl)");
  });

  it("7: URL changes do not display stale image (effect resets from readiness)", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("URL / variant change");
    expect(src).toContain("setHighQualityLoaded(highReady)");
    expect(src).toContain("setLowQualityLoaded(lowReady)");
    expect(src).toContain("[optimizedUrl, lowQualityUrl, priority]");
  });

  it("8: unmount during loading remains safe (cancelled flag)", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("let cancelled = false");
    expect(src).toContain("if (cancelled) return");
    expect(src).toContain("img.onload = null");
  });

  it("9: cache remains bounded", () => {
    for (let i = 0; i < PROGRESSIVE_IMAGE_READINESS_CACHE_MAX + 40; i++) {
      rememberProgressiveImageUrlReady(`https://cdn.example/img-${i}.jpg`);
    }
    expect(__progressiveImageReadinessCacheSizeForTests()).toBe(
      PROGRESSIVE_IMAGE_READINESS_CACHE_MAX,
    );
    expect(
      isProgressiveImageUrlReady(
        `https://cdn.example/img-${PROGRESSIVE_IMAGE_READINESS_CACHE_MAX + 39}.jpg`,
      ),
    ).toBe(true);
    expect(isProgressiveImageUrlReady("https://cdn.example/img-0.jpg")).toBe(
      false,
    );
  });

  it("10: cold Detail loading still works (no readiness → progressive path)", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("animate-pulse");
    expect(src).toContain("!lowQualityLoaded");
    expect(isProgressiveImageUrlReady("https://cdn.example/cold.jpg")).toBe(
      false,
    );
  });

  it("11: Feed/Detail same URL benefits from reuse (wiring)", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("isProgressiveImageUrlReady(optimizedUrl)");
    expect(src).toContain("rememberProgressiveImageUrlReady");
    expect(src).toContain("data-progressive-ready");
    const feed = read("src/components/PublishedMediaSurface.tsx");
    const detail = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(feed).toContain("viewportWidth={800}");
    expect(detail).toContain("viewportWidth={800}");
  });

  it("12: no additional network/preload introduced by code", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).not.toContain("new Image().src = src");
    expect(src).not.toContain("fetch(");
    expect(src).toContain("progressiveImageReadinessCache");
    // Still a single Image() probe per stage, same as before.
    expect(src).toContain("const img = new Image()");
  });
});

describe("PASS 2E — preserve prior media passes", () => {
  it("13: Feed/Detail/fullscreen wiring untouched by this pass", () => {
    expect(
      read("src/components/detail/PublishedMediaCarousel.tsx"),
    ).toContain('policy: "stable-list"');
    expect(
      read("src/components/PublishedMediaFullscreenViewer.tsx"),
    ).toContain("FullscreenThumbStrip");
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      'policy: "stable-list"',
    );
    expect(
      read("src/components/detail/PublishedVideoPlayer.tsx"),
    ).toContain("PublishedVideoPlayer");
  });
});
