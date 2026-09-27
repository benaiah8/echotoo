/**
 * PASS PV3.2 — Video-only posts use natural video aspect ratio.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublishedMediaItems,
  isPublishedVideoOnly,
  publishedMediaFrameStyle,
  publishedVideoAspectRatio,
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC,
  type PublishedMediaItem,
  type PublishedPostMediaRow,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function videoOnlyItem(
  width: number | null,
  height: number | null,
  status: PublishedPostMediaRow["video_status"] = "ready",
): PublishedMediaItem[] {
  return buildPublishedMediaItems({
    mediaOrder: [{ kind: "video", mediaId: "vid-1" }],
    postMedia: [
      {
        id: "vid-1",
        post_id: "p1",
        sort_order: 0,
        kind: "video",
        bunny_video_id: "bunny-1",
        video_status: status,
        poster_url: "https://cdn/poster.jpg",
        duration_sec: 12,
        width,
        height,
      },
    ],
    imageUrls: [],
  });
}

describe("PASS PV3.2 — video-only natural aspect ratio", () => {
  it("A: one landscape video uses landscape aspect ratio", () => {
    const items = videoOnlyItem(1920, 1080);
    expect(isPublishedVideoOnly(items)).toBe(true);
    expect(publishedVideoAspectRatio(items[0] as Extract<PublishedMediaItem, { kind: "video" }>)).toBeCloseTo(
      16 / 9,
    );
    const style = publishedMediaFrameStyle(items, "40vh");
    expect(style.aspectRatio).toBe("1920 / 1080");
    expect(style.maxHeight).toBeUndefined();
    expect(style.height).toBe("auto");
    expect(style.width).toBe("100%");
  });

  it("B: one portrait video uses portrait aspect ratio", () => {
    const items = videoOnlyItem(1080, 1920);
    const style = publishedMediaFrameStyle(items, "40vh");
    expect(style.aspectRatio).toBe("1080 / 1920");
    expect(publishedVideoAspectRatio(items[0] as Extract<PublishedMediaItem, { kind: "video" }>)).toBeCloseTo(
      9 / 16,
    );
  });

  it("C: one square video uses square aspect ratio", () => {
    const items = videoOnlyItem(1080, 1080);
    const style = publishedMediaFrameStyle(items, "50vh");
    expect(style.aspectRatio).toBe("1080 / 1080");
    expect(publishedVideoAspectRatio(items[0] as Extract<PublishedMediaItem, { kind: "video" }>)).toBe(1);
  });

  it("D: stored width/height used before video loads (no metadata wait)", () => {
    const style = publishedMediaFrameStyle(videoOnlyItem(1280, 720), "40vh");
    expect(style.aspectRatio).toBe("1280 / 720");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    // Frame sizing is outer stage — not driven by loadedmetadata for layout.
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("publishedMediaFrameStyle");
    expect(surface).not.toMatch(
      /publishedMediaFrameStyle[\s\S]{0,200}loadedmetadata/,
    );
    expect(player).toContain('preload="none"');
  });

  it("E: processing→ready keeps same frame (dimensions establish aspect immediately)", () => {
    const processing = publishedMediaFrameStyle(
      videoOnlyItem(1080, 1920, "processing"),
      "40vh",
    );
    const ready = publishedMediaFrameStyle(
      videoOnlyItem(1080, 1920, "ready"),
      "40vh",
    );
    expect(processing).toEqual(ready);
    expect(processing.aspectRatio).toBe("1080 / 1920");
  });

  it("F/G/H: video-only Feed, Profile, Detail use natural frame helper", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const post = read("src/components/Post.tsx");
    const body = read("src/components/detail/PostDetailBody.tsx");

    expect(surface).toContain("publishedMediaFrameStyle");
    expect(surface).toContain("isPublishedVideoOnly");
    expect(surface).toContain("data-published-video-only");
    expect(surface).toContain('mode: "feed" | "profile"');
    expect(post).toContain("PublishedMediaSurface");
    expect(post).toContain("mode={publishedListMode}");

    expect(carousel).toContain("publishedMediaFrameStyle");
    expect(carousel).toContain("data-published-video-only");
    expect(body).toContain("PublishedMediaCarousel");
  });

  it("I: mixed media keeps stable fixed height frame", () => {
    const mixed = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "video", mediaId: "vid-1" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [
        {
          id: "vid-1",
          post_id: "p1",
          sort_order: 1,
          kind: "video",
          bunny_video_id: "bunny-1",
          video_status: "ready",
          poster_url: "https://cdn/poster.jpg",
          duration_sec: 12,
          width: 1920,
          height: 1080,
        },
      ],
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    });
    expect(isPublishedVideoOnly(mixed)).toBe(false);
    const style = publishedMediaFrameStyle(mixed, "40vh", {
      multiAspectRatio: 1920 / 1080,
    });
    expect(style.maxHeight).toBeUndefined();
    expect(style.minHeight).toBe("12rem");
    expect(style.height).toBe("auto");
    expect(style.aspectRatio).toBeTruthy();
  });

  it("J: image-only uses shared aspect frame (not legacy 40vh identity)", () => {
    const images = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [],
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    });
    expect(isPublishedVideoOnly(images)).toBe(false);
    const style = publishedMediaFrameStyle(images, "40vh");
    expect(style).toEqual({
      width: "100%",
      aspectRatio: "1",
      height: "auto",
      minHeight: "12rem",
    });
    const post = read("src/components/Post.tsx");
    expect(post).toContain("<MediaCarousel");
  });

  it("K: no pagination for one video", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("if (count <= 1) return null");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    // Pagination component still gated by count.
    expect(carousel).toMatch(/PublishedMediaPagination[\s\S]*count=\{slideCount\}/);
    expect(read("src/components/detail/PublishedMediaCarousel.tsx")).toBeTruthy();
    // Shared pagination helper in carousel file or imported — check ListPagination pattern.
    const pagSrc =
      surface.includes("if (count <= 1) return null") ||
      carousel.includes("count <= 1");
    expect(pagSrc).toBe(true);
  });

  it("L: PV3.1 warm/autoplay coordinator unchanged", () => {
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBe(350);
    expect(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_WARM_RATIO).toBe(0.15);
    expect(PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC).toBe(4);
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("requestPublishedListVideoWarmOwnership");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_DWELL_MS");
  });

  it("M: portrait video remains autoplay-eligible (effective IO ratio)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("IntersectionObserver");
    expect(surface).toContain("rootRef");
    expect(surface).toContain("io.observe(el)");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO");
    expect(surface).toContain("computeEffectiveIntersectionRatio");
    // PV3.4: video-only portrait is uncapped (true 9:16).
    const portrait = publishedMediaFrameStyle(videoOnlyItem(1080, 1920), "40vh");
    expect(portrait.maxHeight).toBeUndefined();
    expect(portrait.aspectRatio).toBe("1080 / 1920");
  });

  it("N: no backend change", () => {
    const types = read("src/lib/publishedMedia/types.ts");
    expect(types).toContain("isPublishedVideoOnly");
    expect(types).toContain("publishedMediaFrameStyle");
    expect(types).not.toContain("supabase");
  });

  it("missing dimensions use shared temporary fallback (not surface maxHeight)", () => {
    const style = publishedMediaFrameStyle(videoOnlyItem(null, null), "40vh");
    expect(style.aspectRatio).toBeTruthy();
    expect(style.height).toBe("auto");
    expect(style.maxHeight).toBeUndefined();
    expect(publishedMediaFrameStyle(videoOnlyItem(null, null), "50vh")).toEqual(
      style,
    );
  });

  it("player keeps object-contain (no object-cover for published video)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("object-contain");
    expect(player).not.toMatch(/className=\{[\s\S]*object-cover/);
  });
});
