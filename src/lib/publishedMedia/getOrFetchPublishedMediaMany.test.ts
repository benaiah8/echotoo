/**
 * getOrFetchPublishedMediaMany — Groups source-media batch plumbing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  __resetPublishedMediaCacheForTests,
  buildPublishedMediaItems,
  dedupePublishedMediaPostIds,
  getOrFetchPublishedMediaMany,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  seedPublishedMediaFromList,
  setPublishedMediaCache,
  isPublishedMediaCacheFresh,
} from "../publishedMedia";
import type { PublishedPostMediaRow } from "./types";

const batchSpy = vi.fn();

vi.mock("./getPublishedPostMediaForDetail", async () => {
  const actual = await vi.importActual<
    typeof import("./getPublishedPostMediaForDetail")
  >("./getPublishedPostMediaForDetail");
  return {
    ...actual,
    getPublishedPostMediaForPosts: (...args: unknown[]) => batchSpy(...args),
    getPublishedPostMediaForDetail: vi.fn(async (postId: string) => {
      const map = await batchSpy([postId]);
      return (
        map.get(postId) ?? {
          mediaOrder: null,
          postMedia: [],
          imageUrls: [],
        }
      );
    }),
  };
});

const videoRow: PublishedPostMediaRow = {
  id: "vm1",
  post_id: "p-video",
  sort_order: 0,
  kind: "video",
  bunny_video_id: "bunny-1",
  video_status: "ready",
  poster_url: "https://cdn.example/poster.jpg",
  duration_sec: 12,
  width: 1280,
  height: 720,
};

const mixedOrder = [
  { kind: "image" as const, url: "https://cdn.example/a.jpg" },
  { kind: "video" as const, mediaId: "vm1" },
  { kind: "image" as const, url: "https://cdn.example/b.jpg" },
];

function emptyBatchMap(ids: string[]) {
  const map = new Map();
  for (const id of ids) {
    map.set(id, { mediaOrder: null, postMedia: [], imageUrls: [] });
  }
  return map;
}

describe("getOrFetchPublishedMediaMany", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
    batchSpy.mockReset();
    batchSpy.mockImplementation(async (ids: string[]) => emptyBatchMap(ids));
  });

  it("1: duplicate post ids are deduped", async () => {
    expect(
      dedupePublishedMediaPostIds(["a", "a", null, "", "b", "a", undefined]),
    ).toEqual(["a", "b"]);

    batchSpy.mockImplementation(async (ids: string[]) => {
      expect(ids).toEqual(["a", "b"]);
      return emptyBatchMap(ids);
    });
    await getOrFetchPublishedMediaMany({
      postIds: ["a", "a", "b", "a"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toEqual(["a", "b"]);
  });

  it("2: fresh cache hits cause no batch fetch", async () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
      source: "feed",
    });
    const result = await getOrFetchPublishedMediaMany({
      postIds: ["p1"],
      viewerUserId: "u1",
    });
    expect(batchSpy).not.toHaveBeenCalled();
    expect(result.fetchedPostIds).toEqual([]);
    expect(result.byPostId.get("p1")).toHaveLength(3);
  });

  it("3: partial hits fetch only misses", async () => {
    seedPublishedMediaFromList({
      postId: "hit",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "image", url: "https://cdn.example/x.jpg" }],
      postMedia: [],
      imageUrls: ["https://cdn.example/x.jpg"],
      source: "feed",
    });
    batchSpy.mockImplementation(async (ids: string[]) => {
      expect(ids).toEqual(["miss"]);
      const map = emptyBatchMap(ids);
      map.set("miss", {
        mediaOrder: [{ kind: "image", url: "https://cdn.example/y.jpg" }],
        postMedia: [],
      });
      return map;
    });
    const result = await getOrFetchPublishedMediaMany({
      postIds: ["hit", "miss"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(result.fetchedPostIds).toEqual(["miss"]);
    expect(result.byPostId.get("hit")?.[0]).toMatchObject({ kind: "image" });
    expect(result.byPostId.get("miss")?.[0]).toMatchObject({
      kind: "image",
      url: expect.stringContaining("y.jpg"),
    });
  });

  it("4: cold page performs one batched request", async () => {
    batchSpy.mockImplementation(async (ids: string[]) => {
      expect(ids).toEqual(["p1", "p2", "p3"]);
      return emptyBatchMap(ids);
    });
    await getOrFetchPublishedMediaMany({
      postIds: ["p1", "p2", "p3"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
  });

  it("5: multiple Groups on same source fetch once", async () => {
    await getOrFetchPublishedMediaMany({
      postIds: ["shared", "shared", "shared"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toEqual(["shared"]);
  });

  it("6–8: media order, images, and video metadata normalize correctly", async () => {
    batchSpy.mockImplementation(async (ids: string[]) => {
      const map = emptyBatchMap(ids);
      map.set("p-mixed", {
        mediaOrder: mixedOrder,
        postMedia: [{ ...videoRow, post_id: "p-mixed" }],
      });
      return map;
    });
    const result = await getOrFetchPublishedMediaMany({
      postIds: ["p-mixed"],
      viewerUserId: "u1",
    });
    const items = result.byPostId.get("p-mixed")!;
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
    const video = items[1];
    expect(video).toMatchObject({
      kind: "video",
      mediaId: "vm1",
      videoId: "bunny-1",
      status: "ready",
      posterUrl: "https://cdn.example/poster.jpg",
      width: 1280,
      height: 720,
      durationSec: 12,
    });
  });

  it("9–10: zero-media becomes authoritative [] and does not refetch", async () => {
    batchSpy.mockImplementation(async (ids: string[]) => emptyBatchMap(ids));
    const first = await getOrFetchPublishedMediaMany({
      postIds: ["empty-post"],
      viewerUserId: "u1",
    });
    expect(first.byPostId.get("empty-post")).toEqual([]);
    expect(batchSpy).toHaveBeenCalledTimes(1);

    const cached = getPublishedMediaCache(
      "empty-post",
      publishedMediaViewerKey("u1"),
    );
    expect(cached).not.toBeNull();
    expect(cached!.items).toEqual([]);
    expect(isPublishedMediaCacheFresh(cached!)).toBe(true);

    batchSpy.mockClear();
    const second = await getOrFetchPublishedMediaMany({
      postIds: ["empty-post"],
      viewerUserId: "u1",
    });
    expect(batchSpy).not.toHaveBeenCalled();
    expect(second.fetchedPostIds).toEqual([]);
    expect(second.byPostId.get("empty-post")).toEqual([]);
  });

  it("11: New → Yours reuses the same viewer cache", async () => {
    seedPublishedMediaFromList({
      postId: "src-1",
      viewerUserId: "u1",
      mediaOrder: [{ kind: "image", url: "https://cdn.example/feed.jpg" }],
      postMedia: [],
      imageUrls: ["https://cdn.example/feed.jpg"],
      source: "feed",
    });
    // Simulate Yours page requesting the same source_post_id.
    const yours = await getOrFetchPublishedMediaMany({
      postIds: ["src-1"],
      viewerUserId: "u1",
    });
    expect(batchSpy).not.toHaveBeenCalled();
    expect(yours.byPostId.get("src-1")?.[0]).toMatchObject({
      kind: "image",
    });
  });

  it("12: viewer change does not reuse wrong viewer cache", async () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "alice",
      mediaOrder: [{ kind: "image", url: "https://cdn.example/alice.jpg" }],
      postMedia: [],
      imageUrls: ["https://cdn.example/alice.jpg"],
      source: "feed",
    });
    batchSpy.mockImplementation(async (ids: string[]) => {
      const map = emptyBatchMap(ids);
      map.set("p1", {
        mediaOrder: [{ kind: "image", url: "https://cdn.example/bob.jpg" }],
        postMedia: [],
      });
      return map;
    });
    const bob = await getOrFetchPublishedMediaMany({
      postIds: ["p1"],
      viewerUserId: "bob",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(bob.byPostId.get("p1")?.[0]).toMatchObject({
      url: expect.stringContaining("bob.jpg"),
    });
    expect(
      getPublishedMediaCache("p1", publishedMediaViewerKey("alice"))?.items[0],
    ).toMatchObject({ url: expect.stringContaining("alice.jpg") });
  });

  it("13: viewer-scoped inFlight does not write into another viewer", async () => {
    let resolveAlice!: (map: Map<string, unknown>) => void;
    const aliceGate = new Promise<Map<string, unknown>>((r) => {
      resolveAlice = r;
    });

    batchSpy.mockImplementationOnce(async (ids: string[]) => {
      expect(ids).toEqual(["p-race"]);
      return aliceGate as Promise<Map<string, { mediaOrder: unknown; postMedia: unknown[] }>>;
    });

    const alicePromise = getOrFetchPublishedMediaMany({
      postIds: ["p-race"],
      viewerUserId: "alice",
    });

    const aliceMap = emptyBatchMap(["p-race"]);
    aliceMap.set("p-race", {
      mediaOrder: [{ kind: "image", url: "https://cdn.example/alice-only.jpg" }],
      postMedia: [],
    });
    resolveAlice(aliceMap);
    await alicePromise;

    expect(
      getPublishedMediaCache("p-race", publishedMediaViewerKey("alice"))
        ?.items[0],
    ).toMatchObject({ url: expect.stringContaining("alice-only.jpg") });
    expect(
      getPublishedMediaCache("p-race", publishedMediaViewerKey("bob")),
    ).toBeNull();
  });

  it("14: does not call getOrFetchPublishedMedia N times (one batch)", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `post-${i}`);
    await getOrFetchPublishedMediaMany({
      postIds: ids,
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(12);
  });

  it("15: Feed seed remains readable after many (no regression)", async () => {
    seedPublishedMediaFromList({
      postId: "feed-p",
      viewerUserId: "u1",
      mediaOrder: mixedOrder,
      postMedia: [{ ...videoRow, post_id: "feed-p" }],
      imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
      source: "feed",
    });
    await getOrFetchPublishedMediaMany({
      postIds: ["other"],
      viewerUserId: "u1",
    });
    const feed = getPublishedMediaCache(
      "feed-p",
      publishedMediaViewerKey("u1"),
    );
    expect(feed?.items).toHaveLength(3);
    expect(feed?.source).toBe("feed");
  });

  it("stale entries are treated as misses and refreshed in batch", async () => {
    setPublishedMediaCache({
      postId: "stale",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: ["https://cdn.example/old.jpg"],
        mediaOrder: null,
        postMedia: [],
      }),
      mediaOrder: null,
      source: "detail",
    });
    const entry = getPublishedMediaCache(
      "stale",
      publishedMediaViewerKey("u1"),
    )!;
    (entry as { fetchedAt: number }).fetchedAt = Date.now() - 200_000;
    expect(isPublishedMediaCacheFresh(entry)).toBe(false);

    batchSpy.mockImplementation(async (ids: string[]) => {
      const map = emptyBatchMap(ids);
      map.set("stale", {
        mediaOrder: [{ kind: "image", url: "https://cdn.example/new.jpg" }],
        postMedia: [],
        imageUrls: ["https://cdn.example/new.jpg"],
      });
      return map;
    });
    const result = await getOrFetchPublishedMediaMany({
      postIds: ["stale"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(result.byPostId.get("stale")?.[0]).toMatchObject({
      url: expect.stringContaining("new.jpg"),
    });
  });

  it("legacy activity imageUrls produce image items without media_order", async () => {
    batchSpy.mockImplementation(async (ids: string[]) => {
      const map = emptyBatchMap(ids);
      map.set("legacy", {
        mediaOrder: null,
        postMedia: [],
        imageUrls: ["https://cdn.example/activity.jpg"],
      });
      return map;
    });
    const result = await getOrFetchPublishedMediaMany({
      postIds: ["legacy"],
      viewerUserId: "u1",
    });
    expect(result.byPostId.get("legacy")).toHaveLength(1);
    expect(result.byPostId.get("legacy")?.[0]).toMatchObject({
      kind: "image",
      url: expect.stringContaining("activity.jpg"),
    });
    const cached = getPublishedMediaCache(
      "legacy",
      publishedMediaViewerKey("u1"),
    );
    expect(cached?.detailImageLoaderRev).toBeGreaterThan(0);
  });

  it("pre-rev empty detail seed is revalidated once; genuine empty stays", async () => {
    setPublishedMediaCache({
      postId: "empty-old",
      viewerKey: publishedMediaViewerKey("u1"),
      items: [],
      mediaOrder: null,
      source: "detail",
      // intentionally omit detailImageLoaderRev
    });
    batchSpy.mockImplementation(async (ids: string[]) => {
      const map = emptyBatchMap(ids);
      map.set("empty-old", {
        mediaOrder: null,
        postMedia: [],
        imageUrls: ["https://cdn.example/recovered.jpg"],
      });
      return map;
    });
    const first = await getOrFetchPublishedMediaMany({
      postIds: ["empty-old"],
      viewerUserId: "u1",
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(first.byPostId.get("empty-old")?.[0]).toMatchObject({
      kind: "image",
    });

    batchSpy.mockClear();
    // Corrected empty with rev stamped — must not refetch forever.
    setPublishedMediaCache({
      postId: "empty-true",
      viewerKey: publishedMediaViewerKey("u1"),
      items: [],
      mediaOrder: null,
      source: "detail",
      detailImageLoaderRev: 2,
      forceWrite: true,
    });
    await getOrFetchPublishedMediaMany({
      postIds: ["empty-true"],
      viewerUserId: "u1",
    });
    expect(batchSpy).not.toHaveBeenCalled();
  });
});

describe("groupUpPublishedMedia helpers", () => {
  it("collects unique source_post_ids from candidates", async () => {
    const { collectGroupUpSourcePostIds } = await import(
      "../groupUpPublishedMedia"
    );
    expect(
      collectGroupUpSourcePostIds([
        { source_post_id: "a" },
        { source_post_id: "b" },
        { source_post_id: "a" },
        { source_post_id: null },
        { source_post_id: "  " },
      ]),
    ).toEqual(["a", "b"]);
  });
});
