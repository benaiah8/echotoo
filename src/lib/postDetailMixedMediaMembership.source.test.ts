/**
 * Post Detail: never let legacy image-gallery upgrade delete video membership.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedMediaCacheForTests,
  buildPublishedMediaItems,
  ensurePublishedMediaCacheForDetailHandoff,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  setPublishedMediaCache,
  upgradePublishedMediaLegacyGalleryFromUrls,
} from "./publishedMedia";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const videoRow = {
  id: "m-video",
  post_id: "p-mixed",
  sort_order: 0,
  kind: "video",
  bunny_video_id: "bunny-1",
  video_status: "ready" as const,
  poster_url: "https://cdn.example/poster.jpg",
  duration_sec: 10,
  width: 1280,
  height: 720,
};

describe("Post Detail mixed-media membership safety", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
  });

  it("15–17: image-only upgrade does not delete cached video membership (helper)", () => {
    const mixed = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/a.jpg"],
      mediaOrder: null,
      postMedia: [videoRow],
    });
    expect(mixed.some((i) => i.kind === "video")).toBe(true);
    expect(mixed.map((i) => i.kind)).toEqual(["image", "video"]);

    setPublishedMediaCache({
      postId: "p-mixed",
      viewerKey: publishedMediaViewerKey("u1"),
      items: mixed,
      mediaOrder: null,
      source: "feed",
      provenance: "legacy-gallery",
      legacyScope: "full",
    });

    // Raw upgrade helper still builds image-only — Body must refuse to apply it
    // when cache already has video.
    const upgraded = upgradePublishedMediaLegacyGalleryFromUrls({
      postId: "p-mixed",
      viewerUserId: "u1",
      imageUrls: [
        "https://cdn.example/a.jpg",
        "https://cdn.example/b.jpg",
        "https://cdn.example/c.jpg",
      ],
      source: "detail",
    });
    expect(upgraded?.items.every((i) => i.kind === "image")).toBe(true);
    expect(upgraded?.items.some((i) => i.kind === "video")).toBe(false);

    // Body source contract: skip upgrade when cachedHasVideo.
    const body = read("components/detail/PostDetailBody.tsx");
    expect(body).toContain("cachedHasVideo");
    expect(body).toContain("forceCanonicalRevalidate");
    expect(body).toMatch(
      /if \(cachedHasVideo\) \{\s*forceCanonicalRevalidate = true;/,
    );
    expect(body).toContain("getOrFetchPublishedMedia");
    expect(body).toContain("forceRevalidate: true");
  });

  it("18–19: image-only legacy posts still upgrade; handoff preserves mixed order", () => {
    const imagesOnly = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/1.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    setPublishedMediaCache({
      postId: "p-imgs",
      viewerKey: publishedMediaViewerKey("u1"),
      items: imagesOnly,
      mediaOrder: null,
      source: "feed",
      provenance: "legacy-gallery",
      legacyScope: "partial",
    });
    const upgraded = upgradePublishedMediaLegacyGalleryFromUrls({
      postId: "p-imgs",
      viewerUserId: "u1",
      imageUrls: [
        "https://cdn.example/1.jpg",
        "https://cdn.example/2.jpg",
      ],
      source: "detail",
    });
    expect(upgraded?.items.map((i) => i.kind)).toEqual(["image", "image"]);
    expect(upgraded?.legacyScope).toBe("full");

    const mixed = buildPublishedMediaItems({
      imageUrls: ["https://cdn.example/a.jpg"],
      mediaOrder: null,
      postMedia: [videoRow],
    });
    const orderBefore = mixed.map((i) => i.key);
    const handoff = ensurePublishedMediaCacheForDetailHandoff({
      postId: "p-hand",
      viewerUserId: "u1",
      items: mixed,
      source: "feed",
    });
    expect(handoff?.items.map((i) => i.key)).toEqual(orderBefore);
    expect(
      getPublishedMediaCache("p-hand", publishedMediaViewerKey("u1"))?.items.map(
        (i) => i.kind,
      ),
    ).toEqual(["image", "video"]);
  });

  it("20: initialMediaKey selection remains key-based in carousel", () => {
    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("initialMediaKey");
    expect(carousel).toContain("resolvePublishedCarouselInitialIndex");
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("resolveGroupSourcePostInitialMediaKey");
  });
});
