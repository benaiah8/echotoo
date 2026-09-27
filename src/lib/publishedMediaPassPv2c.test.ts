/**
 * Pass 2C — Post Detail carousel initial-index sync + stable-list frame.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublishedMediaItems,
  isPublishedMediaMembershipExpansion,
  markPublishedCarouselInitialKeyApplied,
  publishedMediaMembershipSignature,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  resolvePublishedCarouselIndexAfterItemsChange,
  resolvePublishedCarouselInitialIndex,
  resolvePublishedMultiMediaFrame,
  shouldAcceptPublishedCarouselSlideChange,
} from "./publishedMedia";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function fiveImages() {
  return buildPublishedMediaItems({
    imageUrls: [1, 2, 3, 4, 5].map((n) => `https://cdn.example/${n}.jpg`),
    mediaOrder: null,
    postMedia: [],
  });
}

describe("PASS 2C — wiring", () => {
  it("Detail carousel uses stable-list + initialSlide sync", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain('policy: "stable-list"');
    expect(carousel).toContain("initialSlide={swiperInitialSlide}");
    expect(carousel).toContain("syncSwiperToInitialKey");
    expect(carousel).toContain("shouldAcceptPublishedCarouselSlideChange");
    expect(carousel).toContain("markPublishedCarouselInitialKeyApplied");
    expect(carousel).not.toContain(
      "usePublishedMultiMediaFrame(mediaItems);",
    );
  });

  it("Fullscreen viewer untouched in this pass", () => {
    // Source fingerprint: Pass 2C must not edit fullscreen file for gestures/thumbs.
    const fullscreen = read(
      "src/components/PublishedMediaFullscreenViewer.tsx",
    );
    expect(fullscreen).toContain("PublishedMediaFullscreenViewer");
    expect(fullscreen).not.toContain('policy: "stable-list"');
    expect(fullscreen).not.toContain("resolvePublishedCarouselInitialIndex");
  });

  it("Feed PublishedMediaSurface still stable-list", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain('policy: "stable-list"');
  });
});

describe("PASS 2C — initial index resolution", () => {
  const items = fiveImages();

  it("1: open Detail from image 1", () => {
    expect(resolvePublishedCarouselInitialIndex(items, items[0]!.key)).toBe(0);
  });

  it("2: open Detail from image 3", () => {
    expect(resolvePublishedCarouselInitialIndex(items, items[2]!.key)).toBe(2);
  });

  it("3: open Detail from image 5", () => {
    expect(resolvePublishedCarouselInitialIndex(items, items[4]!.key)).toBe(4);
  });

  it("4/5: missing key falls back to 0", () => {
    expect(resolvePublishedCarouselInitialIndex(items, "image:missing")).toBe(
      0,
    );
    expect(resolvePublishedCarouselInitialIndex(items, null)).toBe(0);
  });
});

describe("PASS 2C — Swiper / React index sync contract", () => {
  const items = fiveImages();
  const key5 = items[4]!.key;

  it("6: mount-time activeIndex 0 is rejected until target reached", () => {
    const reject = shouldAcceptPublishedCarouselSlideChange({
      initialMediaKey: key5,
      appliedKey: null,
      swiperActiveIndex: 0,
      targetIndex: 4,
    });
    expect(reject.accept).toBe(false);
    expect(reject.markApplied).toBe(false);
  });

  it("6b: reaching target accepts and marks applied", () => {
    const ok = shouldAcceptPublishedCarouselSlideChange({
      initialMediaKey: key5,
      appliedKey: null,
      swiperActiveIndex: 4,
      targetIndex: 4,
    });
    expect(ok.accept).toBe(true);
    expect(ok.markApplied).toBe(true);
  });

  it("6c: after applied, forward/back swipes sync freely", () => {
    const forward = shouldAcceptPublishedCarouselSlideChange({
      initialMediaKey: key5,
      appliedKey: key5,
      swiperActiveIndex: 3,
      targetIndex: 4,
    });
    expect(forward.accept).toBe(true);
    expect(forward.markApplied).toBe(false);
  });

  it("10: applied only when Swiper activeIndex matches intended slide", () => {
    expect(
      markPublishedCarouselInitialKeyApplied({
        initialMediaKey: key5,
        appliedKey: null,
        swiperActiveIndex: 0,
        items,
      }),
    ).toBeNull();
    expect(
      markPublishedCarouselInitialKeyApplied({
        initialMediaKey: key5,
        appliedKey: null,
        swiperActiveIndex: 4,
        items,
      }),
    ).toBe(key5);
  });
});

describe("PASS 2C — hydration / reorder", () => {
  const full = fiveImages();
  const key5 = full[4]!.key;
  const key3 = full[2]!.key;

  it("7: hydration preserves selected mediaKey before applied", () => {
    const thin = full.slice(0, 1);
    const next = resolvePublishedCarouselIndexAfterItemsChange({
      initialMediaKey: key5,
      appliedKey: null,
      previousKey: thin[0]!.key,
      previousIndex: 0,
      nextItems: full,
    });
    expect(next).toBe(4);
    expect(full[next]!.key).toBe(key5);
  });

  it("8: reordered membership remaps selected key", () => {
    const reordered = [full[4]!, full[0]!, full[1]!, full[2]!, full[3]!];
    const next = resolvePublishedCarouselIndexAfterItemsChange({
      initialMediaKey: undefined,
      appliedKey: null,
      previousKey: key5,
      previousIndex: 4,
      nextItems: reordered,
    });
    expect(next).toBe(0);
    expect(reordered[next]!.key).toBe(key5);
  });

  it("9: removed selected item uses valid fallback", () => {
    const without3 = full.filter((i) => i.key !== key3);
    const next = resolvePublishedCarouselIndexAfterItemsChange({
      initialMediaKey: undefined,
      appliedKey: null,
      previousKey: key3,
      previousIndex: 2,
      nextItems: without3,
    });
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(without3.length);
    expect(without3[next]).toBeTruthy();
  });
});

describe("PASS 2C — Detail frame height lock", () => {
  it("11/12: five-image frame stays fixed; late samples ignored once committed", () => {
    const items = fiveImages();
    const locked = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(locked.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);

    const late = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: items.map((item, i) => ({
        key: item.key,
        width: 1600 + i,
        height: 900,
      })),
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(late.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
  });

  it("13: mixed image/video metadata does not resize committed frame", () => {
    const items = [
      ...fiveImages().slice(0, 2),
      {
        kind: "video" as const,
        key: "video:m",
        mediaId: "m",
        videoId: "v",
        status: "ready" as const,
        posterUrl: null,
        width: 1080,
        height: 1920,
        durationSec: 5,
      },
    ];
    const first = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [],
    });
    expect(first.source).toBe("video");
    const after = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 2000, height: 1000 },
      ],
      committedAspectRatio: first.aspectRatio,
    });
    expect(after.aspectRatio).toBe(first.aspectRatio);
  });

  it("14: swipe cannot change locked ratio (committed source)", () => {
    const items = fiveImages();
    const a = resolvePublishedMultiMediaFrame({
      items,
      committedAspectRatio: 1,
    });
    const b = resolvePublishedMultiMediaFrame({
      items,
      committedAspectRatio: 1,
      imageAspectSamples: [
        { key: items[0]!.key, width: 900, height: 1600 },
      ],
    });
    expect(a.aspectRatio).toBe(b.aspectRatio);
    expect(a.source).toBe("committed");
  });

  it("15: hydration expansion preserves lock signal", () => {
    const thin = fiveImages().slice(0, 1);
    const full = fiveImages();
    expect(
      isPublishedMediaMembershipExpansion(
        publishedMediaMembershipSignature(thin),
        publishedMediaMembershipSignature(full),
      ),
    ).toBe(true);
  });

  it("16: single-image natural sizing path remains non-multi in carousel", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("isPublishedSingleImage");
    expect(carousel).toContain("intrinsicHeightFrame");
    expect(carousel).toContain("naturalHeight={singleImage}");
  });

  it("17: Feed stable-list wiring unchanged", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain('framePolicy="stable-list"');
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain('policy: "stable-list"');
  });

  it("18: fullscreen sizing unchanged (no stable-list)", () => {
    const fullscreen = read(
      "src/components/PublishedMediaFullscreenViewer.tsx",
    );
    expect(fullscreen).not.toContain("usePublishedMultiMediaFrame");
    expect(fullscreen).not.toContain("stable-list");
  });
});
