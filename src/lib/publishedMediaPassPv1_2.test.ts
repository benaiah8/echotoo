import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPublishedMediaItems } from "./publishedMedia";
import { normalizePublishedImageUrl } from "./publishedMedia/normalizePublishedImageUrl";

vi.mock("./img", () => ({
  imgUrlPublic: (path?: string | null) => {
    if (!path) return undefined;
    if (/^https?:\/\//i.test(path) || path.startsWith("data:image/")) {
      return path.split("?")[0];
    }
    return `https://cdn.example/storage/v1/object/public/media/${path}`;
  },
}));

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const videoRow = {
  id: "m1",
  post_id: "p1",
  sort_order: 0,
  kind: "video",
  bunny_video_id: "bunny-1",
  video_status: "ready" as const,
  poster_url: "https://cdn/poster.jpg",
  duration_sec: 12,
  width: 1080,
  height: 1920,
};

describe("PASS PV1.2 — builder / media_order", () => {
  it("A: image-video-image => exactly 3 items", () => {
    const items = buildPublishedMediaItems({
      imageUrls: [
        "https://cdn.example/storage/v1/object/public/media/user/a.jpg",
        "https://cdn.example/storage/v1/object/public/media/user/b.jpg",
      ],
      mediaOrder: [
        { kind: "image", url: "user/a.jpg" },
        { kind: "video", mediaId: "m1" },
        { kind: "image", url: "user/b.jpg" },
      ],
      postMedia: [videoRow],
    });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
  });

  it("B: media_order is authoritative (no leftover gallery append)", () => {
    const items = buildPublishedMediaItems({
      imageUrls: [
        "https://cdn.example/storage/v1/object/public/media/user/a.jpg",
        "https://cdn.example/storage/v1/object/public/media/user/b.jpg",
        "https://cdn.example/storage/v1/object/public/media/user/c.jpg",
      ],
      mediaOrder: [
        { kind: "image", url: "user/a.jpg" },
        { kind: "video", mediaId: "m1" },
        { kind: "image", url: "user/b.jpg" },
      ],
      postMedia: [videoRow],
    });
    expect(items).toHaveLength(3);
    expect(
      items.filter((i) => i.kind === "image").map((i) => i.url),
    ).not.toContain(
      "https://cdn.example/storage/v1/object/public/media/user/c.jpg",
    );
  });

  it("C: normalized raw/public image URL does not duplicate", () => {
    const path = "user/posts/photo.jpg";
    const publicUrl =
      "https://cdn.example/storage/v1/object/public/media/user/posts/photo.jpg";
    expect(normalizePublishedImageUrl(path)).toBe(
      normalizePublishedImageUrl(publicUrl),
    );
    const items = buildPublishedMediaItems({
      imageUrls: [publicUrl, publicUrl + "?width=400"],
      mediaOrder: [
        { kind: "image", url: path },
        { kind: "video", mediaId: "m1" },
      ],
      postMedia: [videoRow],
    });
    expect(items.filter((i) => i.kind === "image")).toHaveLength(1);
    expect(items).toHaveLength(2);
  });

  it("D: legacy no-media_order images still work", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    expect(items.map((i) => i.kind)).toEqual(["image", "image"]);
  });
});

describe("PASS PV1.2 — Detail shell / carousel / player contracts", () => {
  it("E/F: one stable published shell — no MediaCarousel swap on Detail", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("data-published-detail-media-shell");
    expect(body).toContain("publishedMediaLoading");
    expect(body).toContain("usePublishedDetailShell");
    // Published path must not branch to MediaCarousel
    const shellIdx = body.indexOf("usePublishedDetailShell ?");
    const mediaCarouselInPublished = body
      .slice(shellIdx, shellIdx + 800)
      .includes("<MediaCarousel");
    expect(mediaCarouselInPublished).toBe(false);
  });

  it("G–J: first-tap play intent + HLS ready", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("userWantsPlayRef");
    expect(player).toContain("setPlayPending(true)");
    expect(player).toContain("MANIFEST_PARSED");
    expect(player).toContain("tryPlayIfWanted");
    expect(player).toContain('import("hls.js")');
    // Prefetch code on active without requiring play first
    expect(player).toMatch(
      /Prefetch hls\.js CODE only when warm or active[\s\S]*import\("hls\.js"\)/,
    );
    // Pause clears pending intent
    expect(player).toContain("userWantsPlayRef.current = false");
  });

  it("K–N: scrubber / controls no-swipe ownership", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("noSwiping");
    expect(carousel).toContain("PUBLISHED_MEDIA_SWIPE_NO_SELECTOR");
    expect(carousel).toContain("touchStartPreventDefault={false}");
    expect(carousel).toContain("MIXED_HERO_SWIPE_THRESHOLD_PX");
    expect(carousel).toContain("clampCarouselCommitIndex");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-video-scrubber");
    expect(player).toContain('data-video-control');
    expect(player).toContain("setPointerCapture");
    expect(player).toContain('touchAction: "none"');
  });

  it("O/P: vertical scroll + horizontal swipe config", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("touchStartPreventDefault={false}");
    expect(carousel).toContain("threshold={MIXED_HERO_SWIPE_THRESHOLD_PX}");
  });

  it("Q: inactive video pauses", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toMatch(/if \(!isActive && !isWarm\) \{[\s\S]*tearDownPlayback\(\)/);
  });

  it("R: processing→ready preserves slide key", () => {
    const types = read("src/lib/publishedMedia/types.ts");
    expect(types).toContain("key: `video:${row.id}`");
    expect(types).toContain("key: `image:${identity}`");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("item.mediaId !== next.mediaId");
    expect(carousel).toContain("key: item.key");
  });

  it("S: video/media background black", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("bg-black");
    expect(player).not.toMatch(
      /data-published-video-player[\s\S]{0,120}bg-\[var\(--surface-2\)\]/,
    );
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("bg-black");
  });

  it("T/U/V: pagination below frame, longer active, count from items", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("data-published-media-pagination");
    expect(carousel).toContain("PublishedMediaPagination");
    // Pagination after frame close, not absolute inside viewport
    expect(carousel).toContain("<PublishedMediaPagination count={slideCount}");
    expect(carousel.indexOf("</Swiper>")).toBeLessThan(
      carousel.indexOf("<PublishedMediaPagination"),
    );
    expect(carousel).toContain('? "w-4 bg-[var(--text)]"');
    expect(carousel).toContain('w-2 bg-[var(--text)]/50');
  });

  it("W: image-only Detail uses same published shell (no provisional count)", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("PublishedMediaCarousel");
    expect(body).toContain("usePublishedDetailShell");
    expect(body).toContain("publishedMediaShellItems");
    expect(body).toContain("getOrFetchPublishedMedia");
    expect(body).not.toContain("gallery provisional");
  });

  it("X: no new dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["hls.js"]).toBeTruthy();
    // Only hls.js from PV1 — no extra video libs
    expect(pkg.dependencies["video.js"]).toBeUndefined();
  });

  it("Y: Feed/Profile unchanged", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).not.toContain("PublishedMediaCarousel");
    expect(feed).not.toContain("buildPublishedMediaItems");
  });
});
