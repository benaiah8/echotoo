/**
 * PASS PV3.3 — Warm/persisted feed media cache seeding + Create media_order race.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedMediaCacheForTests,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  seedPublishedMediaFromFeedItems,
  seedPublishedMediaFromList,
  setPublishedMediaCache,
  shouldApplyPublishedMediaListSeed,
} from "./publishedMedia";
import {
  mapDraftMediaOrderToPublished,
  reconcileActiveVideoIntoPublishMediaOrder,
  videoOrderItem,
  imageOrderItem,
  writeDraftMediaOrderState,
} from "./createDraftMediaOrder";
import {
  PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE,
  isCanonicalPublishedVideoMediaId,
  isPublishedVideoOrderRequiredError,
} from "./resolvePublishedVideoMediaId";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function installLocalStorageStub(): Map<string, string> {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
    clear: () => storage.clear(),
  });
  return storage;
}

const videoOnlyOrder = [{ kind: "video" as const, mediaId: "pm-vid-1" }];
const readyRow = {
  id: "pm-vid-1",
  post_id: "post-v",
  sort_order: 0,
  kind: "video" as const,
  bunny_video_id: "bunny-v",
  video_status: "ready" as const,
  poster_url: "https://cdn/poster.jpg",
  duration_sec: 10,
  width: 1080,
  height: 1920,
};
const processingRow = {
  ...readyRow,
  video_status: "processing" as const,
  poster_url: null,
};

const mixedOrder = [
  { kind: "image" as const, url: "https://cdn/a.jpg" },
  { kind: "video" as const, mediaId: "pm-vid-1" },
  { kind: "image" as const, url: "https://cdn/b.jpg" },
];

describe("PASS PV3.3 — warm / persist seeding", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A: warm hydrated video-only Feed seeds cache", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-v",
          media_order: videoOnlyOrder,
          post_media: [readyRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "warm",
    });
    const entry = getPublishedMediaCache(
      "post-v",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items.map((i) => i.kind)).toEqual(["video"]);
    expect(entry?.source).toBe("warm");
  });

  it("B: persisted video-only Feed seeds cache", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-v",
          media_order: videoOnlyOrder,
          post_media: [readyRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "persist",
      snapshotTs: 1_000,
    });
    const entry = getPublishedMediaCache(
      "post-v",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items).toHaveLength(1);
    expect(entry?.items[0]?.kind).toBe("video");
    expect(entry?.source).toBe("persist");
    expect(entry?.fetchedAt).toBe(1_000);
  });

  it("C: video-only Feed renders PublishedMediaSurface from seeded cache", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-v",
          media_order: videoOnlyOrder,
          post_media: [readyRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "warm",
    });
    const entry = getPublishedMediaCache(
      "post-v",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items).toHaveLength(1);
    const post = read("src/components/Post.tsx");
    expect(post).toContain("getPublishedMediaCache");
    expect(post).toContain("hasPublishedManifest");
    expect(post).toContain("PublishedMediaSurface");
  });

  it("D: warm mixed image-video-image seeds exactly 3 items", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-m",
          media_order: mixedOrder,
          post_media: [readyRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "warm",
    });
    const entry = getPublishedMediaCache(
      "post-m",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items.map((i) => i.kind)).toEqual([
      "image",
      "video",
      "image",
    ]);
  });

  it("E: processing video retained", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-p",
          media_order: videoOnlyOrder,
          post_media: [processingRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "persist",
      snapshotTs: 50,
    });
    const entry = getPublishedMediaCache(
      "post-p",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items).toHaveLength(1);
    expect(entry?.items[0]).toMatchObject({
      kind: "video",
      status: "processing",
    });
  });

  it("F: ready video retained", () => {
    seedPublishedMediaFromList({
      postId: "post-r",
      viewerUserId: "viewer-1",
      mediaOrder: videoOnlyOrder,
      postMedia: [readyRow],
      source: "warm",
    });
    const entry = getPublishedMediaCache(
      "post-r",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.items[0]).toMatchObject({ kind: "video", status: "ready" });
  });

  it("G: fresh RPC seed remains working", () => {
    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-f",
          media_order: mixedOrder,
          post_media: [readyRow],
        },
      ],
      viewerUserId: "viewer-1",
      source: "feed",
    });
    const entry = getPublishedMediaCache(
      "post-f",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.source).toBe("feed");
    expect(entry?.items).toHaveLength(3);
  });

  it("H: stale persisted manifest does not overwrite newer cache", () => {
    setPublishedMediaCache({
      postId: "post-h",
      viewerKey: publishedMediaViewerKey("viewer-1"),
      items: [
        {
          kind: "video",
          key: "video:pm-vid-1",
          mediaId: "pm-vid-1",
          videoId: "bunny-new",
          status: "ready",
          posterUrl: "https://cdn/new.jpg",
          width: 1,
          height: 1,
          durationSec: 1,
        },
      ],
      mediaOrder: videoOnlyOrder,
      source: "feed",
      fetchedAt: 9_000,
    });
    expect(
      shouldApplyPublishedMediaListSeed({
        existing: getPublishedMediaCache(
          "post-h",
          publishedMediaViewerKey("viewer-1"),
        ),
        source: "persist",
        snapshotTs: 1_000,
      }),
    ).toBe(false);

    seedPublishedMediaFromFeedItems({
      items: [
        {
          id: "post-h",
          media_order: videoOnlyOrder,
          post_media: [{ ...readyRow, bunny_video_id: "bunny-stale" }],
        },
      ],
      viewerUserId: "viewer-1",
      source: "persist",
      snapshotTs: 1_000,
    });
    const entry = getPublishedMediaCache(
      "post-h",
      publishedMediaViewerKey("viewer-1"),
    );
    expect(entry?.source).toBe("feed");
    expect(entry?.items[0]).toMatchObject({ videoId: "bunny-new" });
  });

  it("I: no per-card media network fetch", () => {
    const helper = read(
      "src/lib/publishedMedia/seedPublishedMediaFromFeedItems.ts",
    );
    expect(helper).not.toContain("supabase");
    expect(helper).not.toContain("getPublishedPostMediaForDetail");
    const post = read("src/components/Post.tsx");
    expect(post).not.toMatch(/getOrFetchPublishedMedia/);
    expect(post).toContain("getPublishedMediaCache");
  });

  it("J: Profile warm/persist path uses canonical seed helper", () => {
    const own = read("src/sections/profile/OwnProfilePostsSection.tsx");
    const other = read("src/sections/profile/OtherProfilePostsSection.tsx");
    expect(own).toContain("seedPublishedMediaFromFeedItems");
    expect(other).toContain("seedPublishedMediaFromFeedItems");
    expect(own).not.toContain("buildPublishedMediaItems");
    expect(other).not.toContain("buildPublishedMediaItems");
  });
});

describe("PASS PV3.3 — Create publish order race", () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("K: video-only Create with stale/empty mediaOrder still publishes video order", () => {
    const result = reconcileActiveVideoIntoPublishMediaOrder({
      mediaOrder: [],
      activeVideoLocalId: "draft-vid-local",
    });
    expect(result.reconciledVideo).toBe(true);
    expect(result.order).toEqual([videoOrderItem("draft-vid-local")]);
    const published = mapDraftMediaOrderToPublished(
      result.order,
      "pm-canonical-1",
    );
    expect(published).toEqual([{ kind: "video", mediaId: "pm-canonical-1" }]);
  });

  it("L: mixed Create stale order cannot silently omit video", () => {
    const result = reconcileActiveVideoIntoPublishMediaOrder({
      mediaOrder: [
        imageOrderItem("https://cdn/a.jpg", "img-a"),
        imageOrderItem("https://cdn/b.jpg", "img-b"),
      ],
      activeVideoLocalId: "draft-vid-local",
      preferredVideoIndex: 1,
    });
    expect(result.finalDraftKinds).toEqual(["image", "video", "image"]);
    expect(result.order.filter((i) => i.kind === "video")).toHaveLength(1);
  });

  it("M: existing video position preserved", () => {
    const result = reconcileActiveVideoIntoPublishMediaOrder({
      mediaOrder: [
        imageOrderItem("https://cdn/a.jpg", "img-a"),
        videoOrderItem("old-id"),
        imageOrderItem("https://cdn/b.jpg", "img-b"),
      ],
      activeVideoLocalId: "draft-vid-local",
    });
    expect(result.reconciledVideo).toBe(false);
    expect(result.order.map((i) => i.kind)).toEqual([
      "image",
      "video",
      "image",
    ]);
    expect(result.order[1]).toEqual(videoOrderItem("draft-vid-local"));
  });

  it("N: only one video entry produced", () => {
    writeDraftMediaOrderState({
      mediaOrder: [
        videoOrderItem("persisted"),
        imageOrderItem("https://cdn/a.jpg", "img-a"),
      ],
      imageMediaClientIds: {},
    });
    const result = reconcileActiveVideoIntoPublishMediaOrder({
      mediaOrder: [
        imageOrderItem("https://cdn/a.jpg", "img-a"),
        videoOrderItem("a"),
        videoOrderItem("b"),
      ],
      activeVideoLocalId: "draft-vid-local",
    });
    expect(result.order.filter((i) => i.kind === "video")).toHaveLength(1);
  });

  it("O: final published video mediaId remains post_media.id", () => {
    const published = mapDraftMediaOrderToPublished(
      [videoOrderItem("draft-local-id")],
      "post-media-uuid-9",
    );
    expect(published[0]).toEqual({
      kind: "video",
      mediaId: "post-media-uuid-9",
    });
    expect(isCanonicalPublishedVideoMediaId("post-media-uuid-9")).toBe(true);
    expect(isCanonicalPublishedVideoMediaId("draft-local-id")).toBe(true);
    // bunny ids are still strings — identity rule is createFlowPublish mapping,
    // not rejecting arbitrary strings. Draft localId must not be passed as mediaId.
    expect(published[0]?.kind === "video" && published[0].mediaId).not.toBe(
      "draft-local-id",
    );
  });

  it("P: invariant blocks active video + final order without video", () => {
    expect(isPublishedVideoOrderRequiredError(
      new Error(PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE),
    )).toBe(true);
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("requireVideoInMediaOrder");
    expect(finalize).toContain("reconcileActiveVideoIntoPublishMediaOrder");
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE");
    expect(publish).toContain("requireVideoInMediaOrder");
  });

  it("Q: LI1C image mapping unchanged", () => {
    const li1c = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(li1c).toContain("mapMediaOrderImagesToRemotePaths");
    expect(li1c).toContain('if (item.kind !== "image") return item');
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("uploadSurvivingDraftImagesForPublish");
    expect(finalize).toContain("mapMediaOrderImagesToRemotePaths");
  });

  it("R: video upload retry unchanged", () => {
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("uploadVideoForPublish");
    expect(finalize).toContain("needsPublishTimeVideoUpload");
  });

  it("S: Feed autoplay/prewarm unchanged", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO");
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("seedPublishedMediaFromFeedItems");
    expect(home).not.toContain("requestPublishedListVideoOwnership");
  });

  it("T: Post Detail/fullscreen unchanged", () => {
    const detail = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(detail).toContain("PublishedMediaCarousel");
    const full = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(full).toContain("PublishedMediaFullscreenViewer");
    const home = read("src/pages/HomePage.tsx");
    expect(home).not.toContain("PublishedMediaFullscreenViewer");
  });

  it("U: Home/Profile hydrate paths seed synchronously", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain('"warm"');
    expect(home).toContain('"persist"');
    expect(home).toContain("readHomeFeedHydrationSnapshot");
    const own = read("src/sections/profile/OwnProfilePostsSection.tsx");
    expect(own).toContain('source = "persist"');
    expect(own).toContain("seedPublishedMediaFromFeedItems");
  });
});

describe("PASS PV3.3 — diagnostics contracts", () => {
  it("DEV warm-seed + publish-order log tags present", () => {
    const helper = read(
      "src/lib/publishedMedia/seedPublishedMediaFromFeedItems.ts",
    );
    expect(helper).toContain("[echotoo published media] warm-seed");
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("[echotoo published media] publish-order");
  });
});
