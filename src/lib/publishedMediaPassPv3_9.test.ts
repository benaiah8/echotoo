/**
 * PASS PV3.9 — Feed→Detail media handoff + stable list multi-frame.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  __resetPublishedMediaCacheForTests,
  ensurePublishedMediaCacheForDetailHandoff,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  resolvePublishedMultiMediaFrame,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  type PublishedMediaItem,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function imageItem(key: string, url: string): PublishedMediaItem {
  return { kind: "image", key, url };
}

function videoItem(
  key: string,
  dims?: { width: number | null; height: number | null },
): PublishedMediaItem {
  return {
    kind: "video",
    key,
    mediaId: key.replace("video:", ""),
    videoId: "bunny-vid",
    status: "ready",
    posterUrl: null,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    durationSec: null,
  };
}

describe("PASS PV3.9 — Feed→Detail handoff", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
  });

  it("1: ensurePublishedMediaCacheForDetailHandoff seeds cache before Detail", () => {
    const items = [imageItem("image:a", "https://cdn.example/a.jpg")];
    const entry = ensurePublishedMediaCacheForDetailHandoff({
      postId: "post-1",
      viewerUserId: "user-1",
      items,
      source: "feed",
    });
    expect(entry).not.toBeNull();
    const cached = getPublishedMediaCache(
      "post-1",
      publishedMediaViewerKey("user-1"),
    );
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0]?.key).toBe("image:a");
    expect(cached?.source).toBe("feed");
  });

  it("2/3: Post goToDetails reseeds cache; preserves initialMediaKey in nav state", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("ensurePublishedMediaCacheForDetailHandoff");
    expect(post).toContain("initialMediaKey");
    expect(post).toContain("publishedMediaItems");
    const stateIdx = post.indexOf("const state: PostDetailNavigateState");
    expect(stateIdx).toBeGreaterThan(-1);
    const stateBlock = post.slice(stateIdx, stateIdx + 450);
    expect(stateBlock).toContain("initialPost: post ?? undefined");
    expect(stateBlock).toContain("initialMediaKey");
    expect(stateBlock).not.toContain("publishedMediaItems");
  });

  it("4: Detail sync-consumes cache / seeds from post without null-first wait", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("seedPublishedMediaFromFeedItems");
    expect(body).toContain("Cache-first: paint final count immediately");
    expect(body).toContain("getPublishedMediaCache(post.id, viewerKey)");
  });

  it("5: SWR path still present for stale cache", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("isPublishedMediaCacheFresh");
    expect(body).toContain("forceRevalidate: true");
    expect(body).toContain("getOrFetchPublishedMedia");
  });

  it("6: cold/deep-link still null-then-fetch", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain(
      "Deep link / no cache: keep shell until final manifest",
    );
    expect(body).toContain("setPublishedMediaItems(null)");
  });

  it("7: handoff helper does not fetch", () => {
    const cache = read("src/lib/publishedMedia/publishedMediaCache.ts");
    const start = cache.indexOf("ensurePublishedMediaCacheForDetailHandoff");
    const block = cache.slice(start, start + 2500);
    expect(block).not.toContain("getPublishedPostMediaForDetail");
    expect(block).not.toContain("fetch(");
    expect(block).toContain("setPublishedMediaCache");
  });
});

describe("PASS PV3.9 — stable list multi-frame", () => {
  it("8–11: list policy locks provisional; late samples/video ignored via wiring", () => {
    const hook = read(
      "src/lib/publishedMedia/usePublishedMultiMediaFrame.ts",
    );
    expect(hook).toContain('policy?: PublishedMultiMediaFramePolicy');
    expect(hook).toContain('"stable-list"');
    expect(hook).toContain("imageAspectSamples: []");
    expect(hook).toContain(
      "Lock on first establishment (video dims or provisional 1:1)",
    );

    const images = [
      imageItem("image:a", "https://cdn.example/a.jpg"),
      imageItem("image:b", "https://cdn.example/b.jpg"),
    ];
    const provisional = resolvePublishedMultiMediaFrame({
      items: images,
      imageAspectSamples: [],
    });
    expect(provisional.source).toBe("provisional");
    expect(provisional.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);

    // Once committed, late median samples must not change ratio.
    const locked = resolvePublishedMultiMediaFrame({
      items: images,
      imageAspectSamples: [
        { key: "image:a", width: 1000, height: 2000 },
        { key: "image:b", width: 1000, height: 2000 },
      ],
      committedAspectRatio: PUBLISHED_MULTI_PROVISIONAL_ASPECT,
    });
    expect(locked.source).toBe("committed");
    expect(locked.aspectRatio).toBe(PUBLISHED_MULTI_PROVISIONAL_ASPECT);
    expect(locked.shouldCommit).toBe(false);

    // Mixed: dimless video stays provisional when not committed
    const mixed = [
      imageItem("image:a", "https://cdn.example/a.jpg"),
      videoItem("video:1"),
      imageItem("image:b", "https://cdn.example/b.jpg"),
    ];
    const mixedProv = resolvePublishedMultiMediaFrame({ items: mixed });
    expect(mixedProv.source).toBe("provisional");

    // Known video dims choose video ratio first
    const mixedDims = [
      imageItem("image:a", "https://cdn.example/a.jpg"),
      videoItem("video:1", { width: 1920, height: 1080 }),
    ];
    const withVideo = resolvePublishedMultiMediaFrame({ items: mixedDims });
    expect(withVideo.source).toBe("video");
    expect(withVideo.aspectRatio).toBeCloseTo(1920 / 1080);
  });

  it("12: Detail carousel uses stable-list (Pass 2C)", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain('policy: "stable-list"');
    expect(carousel).toContain("usePublishedMultiMediaFrame(mediaItems");
  });

  it("12b: list surface uses stable-list", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain('policy: "stable-list"');
  });

  it("13/14: single image/video frame helpers unchanged", () => {
    const types = read("src/lib/publishedMedia/types.ts");
    expect(types).toContain("isPublishedSingleImage");
    expect(types).toContain("isPublishedVideoOnly");
    expect(types).toContain("PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT");
  });

  it("15: active index remap preserved on list", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("remapPublishedMediaActiveIndex");
    const post = read("src/components/Post.tsx");
    expect(post).toContain(
      "onOpenDetail={(mediaKeyOrOpts) => goToDetails(mediaKeyOrOpts)}",
    );
  });

  it("fullscreen / Create untouched in this pass", () => {
    // Wiring smoke: these files should not be required for PV3.9 handoff/frame
    const fullscreen = read(
      "src/components/PublishedMediaFullscreenViewer.tsx",
    );
    expect(fullscreen).toContain("PublishedMediaFullscreenViewer");
    expect(fullscreen).not.toContain("stable-list");
    expect(fullscreen).not.toContain("ensurePublishedMediaCacheForDetailHandoff");
  });
});
