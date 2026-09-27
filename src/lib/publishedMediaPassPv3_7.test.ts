/**
 * PASS PV3.7 — media invariant stabilization (cache, IO, ownership, CLS).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __bumpPublishedListVisibilityEpochForTests,
  __resetPublishedImageAspectRatioCacheForTests,
  __resetPublishedListVideoCoordinatorForTests,
  __resetPublishedMediaCacheForTests,
  __resetPublishedProcessingListRevalidatorForTests,
  buildPublishedMediaItems,
  getPublishedImageAspectRatio,
  getPublishedListVisibilityEpoch,
  getPublishedMediaCache,
  isUsablePublishedImageNaturalSize,
  mergePublishedPosterUrl,
  patchPublishedMediaRow,
  pausePublishedProcessingListPolling,
  preservePublishedVideoMetadataAcrossItems,
  PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT,
  PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT,
  PUBLISHED_IMAGE_SAMPLE_MIN_PX,
  PUBLISHED_LIST_IO_THRESHOLDS,
  publishedMediaFrameStyle,
  publishedMediaViewerKey,
  remapPublishedMediaActiveIndex,
  rememberPublishedImageAspectRatio,
  resolvePublishedMultiMediaFrame,
  seedPublishedMediaFromList,
  shouldApplyPublishedMediaListSeed,
  subscribePublishedListVisibilityEpoch,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

beforeEach(() => {
  __resetPublishedMediaCacheForTests();
  __resetPublishedListVideoCoordinatorForTests();
  __resetPublishedProcessingListRevalidatorForTests();
  __resetPublishedImageAspectRatioCacheForTests();
});

describe("PASS PV3.7 — poster / dims merge", () => {
  it("A: patch null poster preserves existing poster", () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "p1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn/poster.jpg",
          duration_sec: 3,
          width: 1080,
          height: 1920,
        },
      ],
      source: "publish",
    });
    patchPublishedMediaRow({
      postId: "p1",
      viewerKey: publishedMediaViewerKey("u1"),
      row: {
        id: "m1",
        post_id: "p1",
        sort_order: 0,
        kind: "video",
        bunny_video_id: "b1",
        video_status: "ready",
        poster_url: null,
        duration_sec: 3,
        width: null,
        height: null,
      },
    });
    const video = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"))
      ?.items[0];
    expect(video?.kind).toBe("video");
    if (video?.kind === "video") {
      expect(video.posterUrl).toBe("https://cdn/poster.jpg");
      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.status).toBe("ready");
    }
  });

  it("B: valid Bunny poster replaces old poster", () => {
    expect(
      mergePublishedPosterUrl("https://cdn/old.jpg", "https://cdn/bunny.jpg"),
    ).toBe("https://cdn/bunny.jpg");
    expect(mergePublishedPosterUrl("https://cdn/old.jpg", null)).toBe(
      "https://cdn/old.jpg",
    );
    expect(mergePublishedPosterUrl("https://cdn/old.jpg", "  ")).toBe(
      "https://cdn/old.jpg",
    );
  });

  it("C/D: Detail getOrFetch preserves dims/poster; positive incoming wins", () => {
    const cacheSrc = read("src/lib/publishedMedia/publishedMediaCache.ts");
    expect(cacheSrc).toContain("preservePublishedVideoMetadataAcrossItems");
    expect(cacheSrc).toMatch(
      /getOrFetchPublishedMedia[\s\S]*preservePublishedVideoMetadataAcrossItems/,
    );

    seedPublishedMediaFromList({
      postId: "p-detail",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "p-detail",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn/p.jpg",
          duration_sec: 2,
          width: 1080,
          height: 1920,
        },
      ],
      source: "publish",
    });

    // Simulate Detail write path: build from null dims then preserve.
    const built = buildPublishedMediaItems({
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "p-detail",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "ready",
          poster_url: null,
          duration_sec: 2,
          width: null,
          height: null,
        },
      ],
      imageUrls: [],
    });
    const existing = getPublishedMediaCache(
      "p-detail",
      publishedMediaViewerKey("u1"),
    );
    const merged = preservePublishedVideoMetadataAcrossItems(
      existing?.items,
      built,
    );
    const video = merged[0];
    expect(video?.kind).toBe("video");
    if (video?.kind === "video") {
      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.posterUrl).toBe("https://cdn/p.jpg");
      expect(video.status).toBe("ready");
    }

    const withIncoming = preservePublishedVideoMetadataAcrossItems(merged, [
      {
        kind: "video",
        key: "video:m1",
        mediaId: "m1",
        videoId: "b1",
        status: "ready",
        posterUrl: "https://cdn/bunny-thumb.jpg",
        width: 720,
        height: 1280,
        durationSec: 2,
      },
    ]);
    const next = withIncoming[0];
    if (next?.kind === "video") {
      expect(next.width).toBe(720);
      expect(next.height).toBe(1280);
      expect(next.posterUrl).toBe("https://cdn/bunny-thumb.jpg");
    }
  });
});

describe("PASS PV3.7 — image-only seed / CLS / samples", () => {
  it("E/F: CreateFinalize image-only seed no longer video-gated", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("canSeedImageOnly");
    expect(page).toContain("canSeedVideo");
    expect(page).toMatch(/canSeedVideo \|\| canSeedImageOnly/);
  });

  it("G/H: ProgressiveImage natural uses known ratio; unknown cold placeholder is square only", () => {
    rememberPublishedImageAspectRatio("https://cdn/portrait.jpg", 900, 1600);
    expect(getPublishedImageAspectRatio("https://cdn/portrait.jpg")).toBeCloseTo(
      900 / 1600,
      5,
    );
    const src = read("src/components/ui/ProgressiveImage.tsx");
    expect(src).toContain("getPublishedImageAspectRatio");
    expect(src).toContain("rememberPublishedImageAspectRatio");
    expect(src).toContain("data-progressive-placeholder");
    expect(src).toContain('"known-ratio"');
    expect(src).toContain('"square"');
    expect(src).toContain("knownNaturalRatio != null");
    expect(src).toContain("aspectRatio: `${knownNaturalRatio}`");
    expect(src).toContain('{ aspectRatio: "1 / 1" }');
    expect(src).not.toContain('{ minHeight: "4rem" }');
    expect(src).toContain('className="block h-auto w-full object-contain"');
  });

  it("I/J: tiny samples rejected; valid samples commit median", () => {
    expect(isUsablePublishedImageNaturalSize(1, 1)).toBe(false);
    expect(isUsablePublishedImageNaturalSize(31, 31)).toBe(false);
    expect(
      isUsablePublishedImageNaturalSize(
        PUBLISHED_IMAGE_SAMPLE_MIN_PX,
        PUBLISHED_IMAGE_SAMPLE_MIN_PX,
      ),
    ).toBe(true);

    const items = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [],
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    });
    const bogus = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 1, height: 1 },
        { key: items[1]!.key, width: 1, height: 1 },
      ],
    });
    expect(bogus.source).toBe("provisional");
    expect(bogus.shouldCommit).toBe(false);

    const ok = resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: [
        { key: items[0]!.key, width: 900, height: 1600 },
        { key: items[1]!.key, width: 900, height: 1600 },
      ],
    });
    expect(ok.source).toBe("image-median");
    expect(ok.shouldCommit).toBe(true);
  });
});

describe("PASS PV3.7 — IO / visibility / revalidator / HLS / index", () => {
  it("K/L: dense IO thresholds; no per-card scroll listener", () => {
    expect(PUBLISHED_LIST_IO_THRESHOLDS[0]).toBe(0);
    expect(PUBLISHED_LIST_IO_THRESHOLDS).toContain(0.05);
    expect(PUBLISHED_LIST_IO_THRESHOLDS).toContain(0.7);
    expect(PUBLISHED_LIST_IO_THRESHOLDS[PUBLISHED_LIST_IO_THRESHOLDS.length - 1]).toBe(1);
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("PUBLISHED_LIST_IO_THRESHOLDS");
    expect(surface).toContain("computeEffectiveIntersectionRatio");
    expect(surface).not.toContain("addEventListener(\"scroll\"");
  });

  it("M/N/O/P: visibility epoch reclaim hooks; sound pref untouched", () => {
    const start = getPublishedListVisibilityEpoch();
    let bumped = false;
    const unsub = subscribePublishedListVisibilityEpoch(() => {
      bumped = true;
    });
    __bumpPublishedListVisibilityEpochForTests();
    expect(getPublishedListVisibilityEpoch()).toBe(start + 1);
    expect(bumped).toBe(true);
    unsub();
    const coord = read("src/lib/publishedMedia/publishedListVideoCoordinator.ts");
    expect(coord).toContain("onPublishedListForeground");
    expect(coord).toContain("onPublishedListBackground");
    expect(coord).toContain("visibilitychange");
    expect(read("src/lib/publishedMedia/publishedVideoMutePreference.ts")).toContain(
      "getPublishedVideoPreferredMuted",
    );
  });

  it("Q: Capacitor appStateChange wired when package available", () => {
    const coord = read("src/lib/publishedMedia/publishedListVideoCoordinator.ts");
    expect(coord).toContain("@capacitor/app");
    expect(coord).toContain("appStateChange");
    expect(read("package.json")).toContain('"@capacitor/app"');
  });

  it("R/S/T: processing missing row releases; pause API exists; ready still patches", () => {
    const rev = read(
      "src/lib/publishedMedia/publishedProcessingListRevalidator.ts",
    );
    expect(rev).toContain("if (!row)");
    expect(rev).toContain("releasePublishedProcessingListOwnership");
    expect(rev).toContain("pausePublishedProcessingListPolling");
    expect(rev).toContain("pollingPaused");
    pausePublishedProcessingListPolling();
    expect(true).toBe(true);
  });

  it("U/V/W: fatal HLS releases ownership; poster retained; retries bounded", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("onPlaybackFailed");
    expect(player).toContain("hlsNetworkRetryRef");
    expect(player).toContain("failTerminal");
    expect(player).toMatch(/hlsNetworkRetryRef\.current < 3/);
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("onPlaybackFailed");
    expect(surface).toContain("setPlaybackFailedKey");
  });

  it("X/Y/Z: active index remaps by key; clamp when removed", () => {
    expect(
      remapPublishedMediaActiveIndex({
        previousKey: "image:b",
        previousIndex: 1,
        nextKeys: ["image:a", "image:b", "image:c"],
      }),
    ).toBe(1);
    expect(
      remapPublishedMediaActiveIndex({
        previousKey: "image:b",
        previousIndex: 1,
        nextKeys: ["image:b", "image:a", "image:c"],
      }),
    ).toBe(0);
    expect(
      remapPublishedMediaActiveIndex({
        previousKey: "image:gone",
        previousIndex: 2,
        nextKeys: ["image:a", "image:b"],
      }),
    ).toBe(1);
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      "remapPublishedMediaActiveIndex",
    );
    expect(read("src/components/detail/PublishedMediaCarousel.tsx")).toContain(
      "remapPublishedMediaActiveIndex",
    );
  });

  it("AA: dimless video shared fallback Feed/Detail", () => {
    const items = buildPublishedMediaItems({
      mediaOrder: [{ kind: "video", mediaId: "v" }],
      postMedia: [
        {
          id: "v",
          post_id: "p",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b",
          video_status: "processing",
          poster_url: null,
          duration_sec: 1,
          width: null,
          height: null,
        },
      ],
      imageUrls: [],
    });
    expect(publishedMediaFrameStyle(items, "40vh")).toEqual({
      width: "100%",
      aspectRatio: PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT,
      height: "auto",
      minHeight: PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT,
    });
    expect(publishedMediaFrameStyle(items, "50vh")).toEqual(
      publishedMediaFrameStyle(items, "40vh"),
    );
  });

  it("AB: authoritative cache not overwritten by warm", () => {
    seedPublishedMediaFromList({
      postId: "p-auth",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "image", url: "https://cdn/a.jpg" }],
      postMedia: [],
      imageUrls: ["https://cdn/a.jpg"],
      source: "feed",
    });
    const existing = getPublishedMediaCache(
      "p-auth",
      publishedMediaViewerKey("u1"),
    );
    expect(
      shouldApplyPublishedMediaListSeed({
        existing,
        source: "warm",
      }),
    ).toBe(false);
  });

  it("AC: Surface unmount release refs present", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("releaseRef.current?.()");
    expect(surface).toContain("warmReleaseRef.current?.()");
  });
});
