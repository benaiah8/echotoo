import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedMediaCacheForTests,
  buildPublishedMediaItems,
  clearPublishedMediaCache,
  getOrFetchPublishedMedia,
  getPublishedMediaCache,
  invalidatePublishedMedia,
  isPublishedMediaCacheFresh,
  patchPublishedMediaRow,
  publishedMediaViewerKey,
  resolvePublishedMediaCover,
  seedPublishedMediaFromList,
  setPublishedMediaCache,
  type PublishedMediaItem,
  type PublishedPostMediaRow,
} from "./publishedMedia";

vi.mock("./publishedMedia/getPublishedPostMediaForDetail", () => ({
  getPublishedPostMediaForDetail: vi.fn(async () => ({
    mediaOrder: [
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "video", mediaId: "m1" },
      { kind: "image", url: "https://cdn/b.jpg" },
    ],
    postMedia: [
      {
        id: "m1",
        post_id: "p1",
        sort_order: 0,
        kind: "video",
        bunny_video_id: "bunny-1",
        video_status: "ready",
        poster_url: "https://cdn/poster.jpg",
        duration_sec: 12,
        width: 1080,
        height: 1920,
      },
    ],
  })),
  fetchPublishedPostMediaRowById: vi.fn(),
}));

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const videoRow: PublishedPostMediaRow = {
  id: "m1",
  post_id: "p1",
  sort_order: 0,
  kind: "video",
  bunny_video_id: "bunny-1",
  video_status: "processing",
  poster_url: null,
  duration_sec: null,
  width: null,
  height: null,
};

const mixedOrder = [
  { kind: "image" as const, url: "https://cdn/a.jpg" },
  { kind: "video" as const, mediaId: "m1" },
  { kind: "image" as const, url: "https://cdn/b.jpg" },
];

describe("PASS PV2A — SQL / migration contracts", () => {
  it("A/B: feed RPC migration includes media_order + compact post_media", () => {
    const sql = read(
      "supabase/migrations/20260924120000_feed_profile_published_media_manifest.sql",
    );
    expect(sql).toContain("get_feed_with_related_data");
    expect(sql).toContain("'media_order', fp.media_order");
    expect(sql).toContain("'post_media', fp.post_media");
    expect(sql).toContain("FROM public.post_media pm");
    expect(sql).toContain("WHERE pm.post_id = p.id");
    expect(sql).toContain("'bunny_video_id', pm.bunny_video_id");
    expect(sql).not.toContain("failure_reason");
  });

  it("C/D: profile Created RPC same compact manifest; unattached excluded", () => {
    const sql = read(
      "supabase/migrations/20260924120000_feed_profile_published_media_manifest.sql",
    );
    expect(sql).toContain("get_user_posts_created_with_related_data");
    expect(sql).toContain("'media_order', media_order");
    expect(sql).toContain("'post_media', post_media");
    // Attached only — post_id = p.id (NULL drafts excluded)
    expect(sql).toMatch(/WHERE pm\.post_id = p\.id/);
  });

  it("E: RETURNS jsonb preserved (safe CREATE OR REPLACE)", () => {
    const sql = read(
      "supabase/migrations/20260924120000_feed_profile_published_media_manifest.sql",
    );
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).not.toContain("DROP FUNCTION");
  });
});

describe("PASS PV2A — normalization", () => {
  it("F: image-video-image builds exactly 3 items", () => {
    const items = buildPublishedMediaItems({
      imageUrls: [],
      mediaOrder: mixedOrder,
      postMedia: [{ ...videoRow, video_status: "ready", poster_url: "https://cdn/p.jpg" }],
    });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
  });

  it("G/H: video-first + processing without poster retained", () => {
    const items = buildPublishedMediaItems({
      imageUrls: [],
      mediaOrder: [
        { kind: "video", mediaId: "m1" },
        { kind: "image", url: "https://cdn/a.jpg" },
      ],
      postMedia: [videoRow],
    });
    expect(items[0]).toMatchObject({
      kind: "video",
      status: "processing",
      posterUrl: null,
    });
    expect(items).toHaveLength(2);
  });

  it("I: image-only legacy remains valid", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    expect(items.map((i) => i.kind)).toEqual(["image"]);
  });
});

describe("PASS PV2A — cache", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
  });

  it("J/K: Feed and Profile seed same viewer/post key", () => {
    const viewer = "user-1";
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: viewer,
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      source: "feed",
    });
    const a = getPublishedMediaCache("p1", publishedMediaViewerKey(viewer));
    expect(a?.items).toHaveLength(3);
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: viewer,
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      source: "profile",
    });
    const b = getPublishedMediaCache("p1", publishedMediaViewerKey(viewer));
    expect(b?.items).toHaveLength(3);
    expect(b?.source).toBe("profile");
  });

  it("L: fresh cache prevents duplicate Detail fetch", async () => {
    const { getPublishedPostMediaForDetail } = await import(
      "./publishedMedia/getPublishedPostMediaForDetail"
    );
    const spy = getPublishedPostMediaForDetail as ReturnType<typeof vi.fn>;
    spy.mockClear();
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: mixedOrder,
      postMedia: [{ ...videoRow, video_status: "ready" }],
      source: "feed",
    });
    const entry = await getOrFetchPublishedMedia({
      postId: "p1",
      viewerUserId: "u1",
    });
    expect(entry?.items).toHaveLength(3);
    expect(spy).not.toHaveBeenCalled();
  });

  it("M: stale cache returns immediately; force revalidates", async () => {
    const { getPublishedPostMediaForDetail } = await import(
      "./publishedMedia/getPublishedPostMediaForDetail"
    );
    const spy = getPublishedPostMediaForDetail as ReturnType<typeof vi.fn>;
    setPublishedMediaCache({
      postId: "p1",
      viewerKey: publishedMediaViewerKey("u1"),
      items: buildPublishedMediaItems({
        imageUrls: [],
        mediaOrder: mixedOrder,
        postMedia: [{ ...videoRow, video_status: "ready" }],
      }),
      mediaOrder: mixedOrder,
      source: "feed",
    });
    const entry = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"))!;
    // Make stale
    (entry as { fetchedAt: number }).fetchedAt = Date.now() - 200_000;
    expect(isPublishedMediaCacheFresh(entry)).toBe(false);
    spy.mockClear();
    const refreshed = await getOrFetchPublishedMedia({
      postId: "p1",
      viewerUserId: "u1",
      forceRevalidate: true,
    });
    expect(refreshed?.items).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("N: concurrent media fetch dedupes", async () => {
    const { getPublishedPostMediaForDetail } = await import(
      "./publishedMedia/getPublishedPostMediaForDetail"
    );
    const spy = getPublishedPostMediaForDetail as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const a = getOrFetchPublishedMedia({ postId: "p-new", viewerUserId: "u1" });
    const b = getOrFetchPublishedMedia({ postId: "p-new", viewerUserId: "u1" });
    await Promise.all([a, b]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("O: processing row patch preserves membership/order", () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      source: "feed",
    });
    const before = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"))!;
    expect(before.items.map((i) => i.key)).toEqual([
      before.items[0].key,
      "video:m1",
      before.items[2].key,
    ]);
    patchPublishedMediaRow({
      postId: "p1",
      viewerKey: publishedMediaViewerKey("u1"),
      row: {
        ...videoRow,
        video_status: "ready",
        poster_url: "https://cdn/poster.jpg",
        bunny_video_id: "bunny-1",
      },
    });
    const after = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"))!;
    expect(after.items).toHaveLength(3);
    expect(after.items.map((i) => i.key)).toEqual(before.items.map((i) => i.key));
    expect(after.items[1]).toMatchObject({
      kind: "video",
      status: "ready",
      posterUrl: "https://cdn/poster.jpg",
    });
  });

  it("P/Q: clear + invalidate", () => {
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder: mixedOrder,
      postMedia: [videoRow],
      source: "feed",
    });
    invalidatePublishedMedia("p1");
    expect(getPublishedMediaCache("p1", publishedMediaViewerKey("u1"))).toBeNull();
    seedPublishedMediaFromList({
      postId: "p2",
      viewerUserId: "u1",
      mediaOrder: null,
      postMedia: [],
      imageUrls: ["https://cdn/x.jpg"],
      source: "feed",
    });
    clearPublishedMediaCache();
    expect(getPublishedMediaCache("p2", publishedMediaViewerKey("u1"))).toBeNull();
  });
});

describe("PASS PV2A — Detail / cover / guardrails", () => {
  it("R/S: Detail uses cache-first; no provisional image-only list", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("getPublishedMediaCache");
    expect(body).toContain("getOrFetchPublishedMedia");
    expect(body).toContain("no image-only provisional");
    expect(body).not.toMatch(
      /publishedMediaLoading[\s\S]{0,200}buildPublishedMediaItems\(\{\s*imageUrls:\s*gallery/,
    );
  });

  it("T/U: carousel preserves index; initialMediaKey supported", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("initialMediaKey");
    expect(carousel).toContain("item.mediaId !== next.mediaId");
    expect(carousel).toContain("key: item.key");
    expect(carousel).toContain("patchPublishedMediaRow");
    const nav = read("src/lib/postDetailNavigationState.ts");
    expect(nav).toContain("initialMediaKey?: string");
  });

  it("V/W: cover helper", () => {
    const items: PublishedMediaItem[] = [
      { kind: "image", key: "image:a", url: "https://cdn/a.jpg" },
      {
        kind: "video",
        key: "video:m1",
        mediaId: "m1",
        videoId: "b",
        status: "ready",
        posterUrl: "https://cdn/p.jpg",
        width: null,
        height: null,
        durationSec: null,
      },
    ];
    expect(resolvePublishedMediaCover(items)).toEqual({
      kind: "image",
      url: "https://cdn/a.jpg",
    });
    expect(
      resolvePublishedMediaCover([
        {
          kind: "video",
          key: "video:m1",
          mediaId: "m1",
          videoId: "b",
          status: "processing",
          posterUrl: null,
          width: null,
          height: null,
          durationSec: null,
        },
      ]),
    ).toEqual({ kind: "video-placeholder" });
    expect(
      resolvePublishedMediaCover([
        {
          kind: "video",
          key: "video:m1",
          mediaId: "m1",
          videoId: "b",
          status: "ready",
          posterUrl: "https://cdn/p.jpg",
          width: null,
          height: null,
          durationSec: null,
        },
      ]),
    ).toEqual({ kind: "video-poster", url: "https://cdn/p.jpg" });
  });

  it("X/Y/Z: no per-card fetch; visuals/HLS unchanged in list surfaces", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("seedPublishedMediaFromFeedItems");
    expect(feed).not.toMatch(/for \(.*posts.*\)[\s\S]*getPublishedPostMediaForDetail/);
    const profile = read("src/api/queries/getUserPostsCreated.ts");
    expect(profile).toContain("seedPublishedMediaFromFeedItems");
    const helper = read("src/lib/publishedMedia/seedPublishedMediaFromFeedItems.ts");
    expect(helper).toContain("seedPublishedMediaFromList");
    const post = read("src/components/Post.tsx");
    expect(post).not.toContain("PublishedVideoPlayer");
    expect(post).not.toContain("PublishedMediaCarousel");
  });

  it("client maps media_order/post_media on FeedItem", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("media_order?: unknown");
    expect(feed).toContain("post_media?: unknown");
    expect(feed).toContain("media_order: (post as any).media_order");
  });

  it("invalidation hooks wired", () => {
    expect(read("src/lib/createFlowPublish.ts")).toContain(
      "invalidatePublishedMedia",
    );
    expect(read("src/lib/cacheInvalidation.ts")).toContain(
      "invalidatePublishedMedia",
    );
    expect(read("src/lib/cacheVersionManager.ts")).toContain(
      "clearPublishedMediaCache",
    );
    expect(read("src/api/services/blocks.ts")).toContain(
      "clearPublishedMediaCache",
    );
  });
});
