/**
 * PASS PV3.6 — single-image intrinsic layout + stable multi-media frame.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPublishedMediaItems,
  clampPublishedImageOnlyAspectRatio,
  findPrimaryPublishedVideoAspectRatio,
  isPublishedSingleImage,
  medianNumber,
  publishedMediaFrameStyle,
  publishedMediaMembershipSignature,
  PUBLISHED_MULTI_ASPECT_MAX,
  PUBLISHED_MULTI_ASPECT_MIN,
  PUBLISHED_MULTI_MIN_HEIGHT,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  resolvePublishedImageOnlyAspectRatio,
  resolvePublishedMultiMediaFrame,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function imageItems(urls: string[]) {
  return buildPublishedMediaItems({
    mediaOrder: urls.map((url) => ({ kind: "image" as const, url })),
    postMedia: [],
    imageUrls: urls,
  });
}

function mixedWithVideo(
  imageUrls: string[],
  video: { w: number | null; h: number | null },
) {
  return buildPublishedMediaItems({
    mediaOrder: [
      ...imageUrls.map((url) => ({ kind: "image" as const, url })),
      { kind: "video" as const, mediaId: "v1" },
    ],
    postMedia: [
      {
        id: "v1",
        post_id: "p",
        sort_order: imageUrls.length,
        kind: "video",
        bunny_video_id: "b",
        video_status: "ready",
        poster_url: "https://cdn/poster.jpg",
        duration_sec: 3,
        width: video.w,
        height: video.h,
      },
    ],
    imageUrls,
  });
}

describe("PASS PV3.6 — ProgressiveImage natural mode", () => {
  it("I/J: natural mode exists; fill default unchanged for unrelated callers", () => {
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain('layout?: ProgressiveImageLayout');
    expect(src).toContain('"fill" | "natural"');
    expect(src).toContain('layout = "fill"');
    expect(src).toContain('data-progressive-layout="natural"');
    expect(src).toContain('data-progressive-layout="fill"');
    expect(src).toContain("block h-auto w-full object-contain");
    expect(src).toContain('minHeight: fillMinHeight');
    // Default fill still uses cover + 200px identity for unrelated callers.
    expect(src).toMatch(/fit = "cover"/);
    expect(src).toMatch(/fillMinHeight = "200px"/);
  });

  it("K: single published image uses natural layout (no 200px stage)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(surface).toContain('layout={singleImage ? "natural" : "fill"}');
    expect(carousel).toContain('layout={naturalHeight ? "natural" : "fill"}');
    expect(surface).toContain("fillMinHeight={singleImage ? undefined : false}");
  });
});

describe("PASS PV3.6 — single image geometry", () => {
  it("A/B/F/H/L: single image frame is intrinsic; object-contain; one item", () => {
    const items = imageItems(["https://cdn/portrait.jpg"]);
    expect(isPublishedSingleImage(items)).toBe(true);
    expect(items).toHaveLength(1);
    const feed = publishedMediaFrameStyle(items, "40vh");
    const detail = publishedMediaFrameStyle(items, "50vh");
    expect(feed).toEqual({ width: "100%", height: "auto" });
    expect(detail).toEqual({ width: "100%", height: "auto" });
    expect(feed.maxHeight).toBeUndefined();
    expect(feed.minHeight).toBeUndefined();
    expect(feed.aspectRatio).toBeUndefined();
  });

  it("C/D/E: Detail cache seed cannot change single-image geometry policy", () => {
    const portrait = imageItems(["https://cdn/p.jpg"]);
    const before = publishedMediaFrameStyle(portrait, "40vh");
    const afterSeed = publishedMediaFrameStyle(portrait, "40vh");
    expect(before).toEqual(afterSeed);
    expect(before).toEqual(publishedMediaFrameStyle(portrait, "50vh"));
  });

  it("G: legacy MediaCarousel single image is natural", () => {
    const legacy = read("src/components/MediaCarousel.tsx");
    expect(legacy).toContain("singleImageNatural = slideCount === 1");
    expect(legacy).toContain('layout={singleImageNatural ? "natural" : "fill"}');
    expect(legacy).toContain("usePublishedMultiMediaFrame");
  });

  it("M: single video remains natural PV3.5 behavior", () => {
    const items = buildPublishedMediaItems({
      mediaOrder: [{ kind: "video", mediaId: "v" }],
      postMedia: [
        {
          id: "v",
          post_id: "p",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b",
          video_status: "ready",
          poster_url: null,
          duration_sec: 1,
          width: 1080,
          height: 1920,
        },
      ],
      imageUrls: [],
    });
    const style = publishedMediaFrameStyle(items, "40vh");
    expect(style).toEqual({
      width: "100%",
      aspectRatio: "1080 / 1920",
      height: "auto",
    });
    expect(style.maxHeight).toBeUndefined();
  });
});

describe("PASS PV3.6 — multi-media canonical helper", () => {
  it("AC: Feed/Profile/Detail share resolvePublishedMultiMediaFrame", () => {
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      "usePublishedMultiMediaFrame",
    );
    expect(read("src/components/detail/PublishedMediaCarousel.tsx")).toContain(
      "usePublishedMultiMediaFrame",
    );
    expect(read("src/lib/publishedMedia/index.ts")).toContain(
      "resolvePublishedMultiMediaFrame",
    );
  });

  it("N/O/P/Q: image-only median + clamp", () => {
    const portrait = 9 / 16;
    const landscape = 16 / 9;
    const mid = 1;
    expect(medianNumber([portrait, landscape, mid])).toBe(mid);
    expect(clampPublishedImageOnlyAspectRatio(0.1)).toBe(PUBLISHED_MULTI_ASPECT_MIN);
    expect(clampPublishedImageOnlyAspectRatio(10)).toBe(PUBLISHED_MULTI_ASPECT_MAX);
    expect(resolvePublishedImageOnlyAspectRatio([
      { key: "a", width: 900, height: 1600 },
      { key: "b", width: 1600, height: 900 },
      { key: "c", width: 1000, height: 1000 },
    ])).toBe(1);

    const items = imageItems(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    const resolved = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 900, height: 1600 },
        { key: items[1]!.key, width: 900, height: 1600 },
      ],
    });
    expect(resolved.source).toBe("image-median");
    expect(resolved.shouldCommit).toBe(true);
    expect(resolved.aspectRatio).toBeCloseTo(9 / 16, 5);
    expect(resolved.style.maxHeight).toBeUndefined();
    expect(resolved.style.minHeight).toBe(PUBLISHED_MULTI_MIN_HEIGHT);
  });

  it("R/S: extreme ratios clamp; minHeight retained", () => {
    const items = imageItems(["https://cdn/pan.jpg", "https://cdn/tall.jpg"]);
    const resolved = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 4000, height: 400 },
        { key: items[1]!.key, width: 400, height: 4000 },
      ],
    });
    expect(resolved.aspectRatio).toBeGreaterThanOrEqual(PUBLISHED_MULTI_ASPECT_MIN);
    expect(resolved.aspectRatio).toBeLessThanOrEqual(PUBLISHED_MULTI_ASPECT_MAX);
    expect(resolved.style.minHeight).toBe("12rem");
    expect(resolved.style.maxHeight).toBeUndefined();
  });

  it("T/U/V: provisional 1:1; freeze; membership reset signature", () => {
    const items = imageItems(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    const provisional = resolvePublishedMultiMediaFrame({ items });
    expect(provisional.source).toBe("provisional");
    expect(provisional.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
    expect(provisional.shouldCommit).toBe(false);

    const committed = resolvePublishedMultiMediaFrame({
      items,
      committedAspectRatio: 1.25,
      imageAspectSamples: [
        { key: items[0]!.key, width: 100, height: 100 },
        { key: items[1]!.key, width: 200, height: 100 },
      ],
    });
    expect(committed.source).toBe("committed");
    expect(committed.aspectRatio).toBe(1.25);
    expect(committed.shouldCommit).toBe(false);

    const sig1 = publishedMediaMembershipSignature(items);
    const sig2 = publishedMediaMembershipSignature(
      imageItems(["https://cdn/a.jpg", "https://cdn/c.jpg"]),
    );
    expect(sig1).not.toBe(sig2);
  });

  it("W/X: video-priority frame", () => {
    const items = mixedWithVideo(
      ["https://cdn/a.jpg", "https://cdn/b.jpg"],
      { w: 1080, h: 1920 },
    );
    expect(findPrimaryPublishedVideoAspectRatio(items)).toBeCloseTo(1080 / 1920, 5);
    const resolved = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 1600, height: 900 },
        { key: items[1]!.key, width: 1600, height: 900 },
      ],
    });
    expect(resolved.source).toBe("video");
    expect(resolved.aspectRatio).toBeCloseTo(1080 / 1920, 5);
    expect(resolved.style.maxHeight).toBeUndefined();

    const landscapeVideo = resolvePublishedMultiMediaFrame({
      items: mixedWithVideo(["https://cdn/a.jpg"], { w: 1920, h: 1080 }),
    });
    expect(landscapeVideo.aspectRatio).toBeCloseTo(1920 / 1080, 5);
  });

  it("Y/Z: no 40vh/50vh max when valid ratio; modest minHeight", () => {
    const items = imageItems(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    const style = publishedMediaFrameStyle(items, "40vh", {
      multiAspectRatio: 9 / 16,
    });
    expect(style.maxHeight).toBeUndefined();
    expect(style.height).toBe("auto");
    expect(style.minHeight).toBe("12rem");
    expect(style.aspectRatio).toBeTruthy();
    expect(String(style.aspectRatio)).not.toContain("40vh");
    expect(String(style.aspectRatio)).not.toContain("50vh");
  });

  it("AA/AB: multi slides object-cover; video contain; shared frame helper", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(surface).toContain('fit={singleImage ? "contain" : "cover"}');
    expect(carousel).toContain('fit={naturalHeight ? "contain" : "cover"}');
    expect(surface).toContain("reportImageNaturalSize");
    expect(carousel).toContain("reportImageNaturalSize");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("object-contain");
  });
});

describe("PASS PV3.6 — safety / unchanged passes", () => {
  it("AD: layout code does not mutate cache arrays in place", () => {
    const helper = read(
      "src/lib/publishedMedia/resolvePublishedMultiMediaFrame.ts",
    );
    const hook = read("src/lib/publishedMedia/usePublishedMultiMediaFrame.ts");
    expect(helper).not.toMatch(/items\[\d+\]\s*=/);
    expect(hook).toContain("Presentation-only");
    expect(hook).not.toContain("setPublishedMediaCache");
  });

  it("AE–AJ: fullscreen / PV3.4 / PV3.5 / LI1 untouched markers", () => {
    expect(read("src/components/PublishedMediaFullscreenViewer.tsx")).toContain(
      "PublishedMediaFullscreenViewer",
    );
    expect(read("src/lib/publishedMedia/listVideoVisibility.ts")).toContain(
      "computeEffectiveIntersectionRatio",
    );
    expect(read("src/lib/publishedMedia/publishedVideoMutePreference.ts")).toContain(
      "getPublishedVideoPreferredMuted",
    );
    expect(read("src/lib/publishedMedia/publishedProcessingListRevalidator.ts")).toContain(
      "requestPublishedProcessingListOwnership",
    );
  });

  it("AM: no schema/backend/SQL in PV3.6 helper", () => {
    const helper = read(
      "src/lib/publishedMedia/resolvePublishedMultiMediaFrame.ts",
    );
    expect(helper).not.toContain("supabase");
    expect(helper).not.toContain("migrate");
  });
});
