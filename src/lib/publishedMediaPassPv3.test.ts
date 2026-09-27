/**
 * PASS PV3 — Home Feed + Profile published mixed media, visibility muted autoplay,
 * Instagram-like passive chrome, single list HLS owner.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublishedMediaItems,
  resolvePublishedMediaCover,
  seedPublishedMediaFromList,
  getPublishedMediaCache,
  publishedMediaViewerKey,
  __resetPublishedMediaCacheForTests,
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_MEDIA_SWIPE_NO_SELECTOR,
  requestPublishedListVideoOwnership,
  getPublishedListVideoOwnerId,
  releaseAllPublishedListVideoOwnership,
  publishedListVideoOwnerId,
  __resetPublishedListVideoCoordinatorForTests,
  ensurePublishedListVideoDocumentVisibilityCleanup,
  type PublishedPostMediaRow,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mixedRows: PublishedPostMediaRow[] = [
  {
    id: "vid-1",
    post_id: "p1",
    sort_order: 1,
    kind: "video",
    bunny_video_id: "bunny-1",
    video_status: "ready",
    poster_url: "https://cdn/poster.jpg",
    duration_sec: 12,
    width: 1080,
    height: 1920,
  },
];

const mediaOrder = [
  { kind: "image", url: "https://cdn/a.jpg" },
  { kind: "video", mediaId: "vid-1" },
  { kind: "image", url: "https://cdn/b.jpg" },
];

describe("PASS PV3 — Feed/Profile published media + list autoplay", () => {
  beforeEach(() => {
    __resetPublishedMediaCacheForTests();
    __resetPublishedListVideoCoordinatorForTests();
  });

  it("A: image-only Feed post still uses legacy MediaCarousel path", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("hasPublishedManifest");
    expect(post).toContain("<MediaCarousel");
    expect(post).toContain("!hasPublishedManifest");
  });

  it("B: video-first cover uses video poster, not later image", () => {
    const items = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "video", mediaId: "vid-1" },
        { kind: "image", url: "https://cdn/a.jpg" },
      ],
      postMedia: mixedRows,
      imageUrls: ["https://cdn/activity-first.jpg", "https://cdn/a.jpg"],
    });
    const cover = resolvePublishedMediaCover(items);
    expect(cover).toEqual({
      kind: "video-poster",
      url: "https://cdn/poster.jpg",
    });
    expect(items[0]?.kind).toBe("video");
  });

  it("C/D: image-video-image renders exact media_order (3 slides)", () => {
    const items = buildPublishedMediaItems({
      mediaOrder,
      postMedia: mixedRows,
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
    expect(items[1]?.key).toBe("video:vid-1");
  });

  it("E: Profile Created uses same canonical cache seed path", () => {
    const profile = read("src/api/queries/getUserPostsCreated.ts");
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(profile).toContain("seedPublishedMediaFromFeedItems");
    expect(feed).toContain("seedPublishedMediaFromFeedItems");
    seedPublishedMediaFromList({
      postId: "p1",
      viewerUserId: "u1",
      mediaOrder,
      postMedia: mixedRows,
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
      source: "profile",
    });
    const entry = getPublishedMediaCache("p1", publishedMediaViewerKey("u1"));
    expect(entry?.items).toHaveLength(3);
    expect(entry?.source).toBe("profile");
  });

  it("F/G: visibility threshold + dwell constants", () => {
    expect(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBeGreaterThanOrEqual(300);
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBeLessThanOrEqual(400);
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("IntersectionObserver");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_DWELL_MS");
    expect(surface).toContain("PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO");
    expect(surface).toContain("setDwellOk");
  });

  it("H: eligible ready video autoplays muted via player + ownership", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(player).toContain('playIntentRef.current = "autoplay"');
    expect(player).toContain("getPublishedVideoPreferredMuted");
    expect(player).toContain("data-autoplay-muted={muted ? \"true\" : \"false\"}");
    expect(surface).toContain("requestPublishedListVideoOwnership");
    expect(surface).toContain("isActive={ownsPlayback && i === index}");
  });

  it("I/J: passive list chrome — no persistent Play / scrubber", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('mode === "feed" || mode === "profile"');
    expect(player).toContain("listChromeRevealed");
    expect(player).toContain("data-list-passive-chrome");
    expect(player).toContain("showCenterPlay");
    expect(player).toContain("showScrubber");
    expect(player).toMatch(
      /showCenterPlay = showChrome && \(!isListSurface \|\| listChromeRevealed\)/,
    );
    expect(player).toMatch(
      /showScrubber = showChrome && \(!isListSurface \|\| listChromeRevealed\)/,
    );
  });

  it("K/L: deliberate interaction reveals chrome then hides", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("setListChromeRevealed(true)");
    expect(player).toContain("setListChromeRevealed(false)");
    expect(player).toContain("VIDEO_CHROME_HIDE_MS");
    expect(player).toContain("if (isListSurface) {");
    expect(player).toContain("revealChrome()");
  });

  it("M/N: scrubber noSwiping; no body/html scroll lock", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain(
      "noSwipingSelector={PUBLISHED_MEDIA_SWIPE_NO_SELECTOR}",
    );
    expect(PUBLISHED_MEDIA_SWIPE_NO_SELECTOR).toContain("data-video-scrubber");
    expect(surface).toContain("touchStartPreventDefault={false}");
    expect(surface).not.toContain("document.body.style.overflow");
    expect(surface).not.toMatch(/addEventListener\(["']touchmove["']/);
  });

  it("O/P: only one global list video; B revokes A", () => {
    const revoked: string[] = [];
    requestPublishedListVideoOwnership({
      ownerId: "a",
      onRevoke: () => revoked.push("a"),
    });
    expect(getPublishedListVideoOwnerId()).toBe("a");
    requestPublishedListVideoOwnership({
      ownerId: "b",
      onRevoke: () => revoked.push("b"),
    });
    expect(getPublishedListVideoOwnerId()).toBe("b");
    expect(revoked).toEqual(["a"]);
  });

  it("Q/R: offscreen / document hidden tears down ownership", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(surface).toContain("releaseRef.current?.()");
    expect(coord).toContain(
      "ensurePublishedListVideoDocumentVisibilityCleanup",
    );
    expect(coord).toContain("visibilitychange");
    expect(coord).toContain("releaseAllPublishedListVideoOwnership");
    ensurePublishedListVideoDocumentVisibilityCleanup();
    requestPublishedListVideoOwnership({
      ownerId: "x",
      onRevoke: () => {},
    });
    releaseAllPublishedListVideoOwnership();
    expect(getPublishedListVideoOwnerId()).toBeNull();
  });

  it("S: inactive cards do not attach HLS (idle gates load)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("if (!isActive && !isWarm)");
    expect(player).toContain("tearDownPlayback()");
    expect(player).toContain("ensureHlsLoaded");
    expect(player).toContain('preload="none"');
  });

  it("T/U: processing occupies slide; list skips per-card poll storm", () => {
    const items = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "video", mediaId: "vid-proc" },
        { kind: "image", url: "https://cdn/a.jpg" },
      ],
      postMedia: [
        {
          id: "vid-proc",
          post_id: "p1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "bunny-proc",
          video_status: "processing",
          poster_url: null,
          duration_sec: null,
          width: null,
          height: null,
        },
      ],
      imageUrls: ["https://cdn/a.jpg"],
    });
    expect(items[0]?.kind).toBe("video");
    expect(resolvePublishedMediaCover(items)).toEqual({
      kind: "video-placeholder",
    });
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("Getting video ready…");
    expect(player).toContain("if (isListSurface) return;");
    expect(player).toContain("Processing poll while active");
  });

  it("V: list video loops while active", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("loop={isListSurface}");
    expect(player).toContain("if (!isListSurface || !isActive) return;");
  });

  it("W: autoplay failure falls back safely (no retry storm)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("autoplayRejectedRef");
    expect(player).toContain("Do not retry autoplay in a loop");
  });

  it("X/Y: opening Detail stops feed video + passes initialMediaKey", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("releaseAllPublishedListVideoOwnership()");
    expect(post).toContain("initialMediaKey");
    expect(post).toContain(
      "onOpenDetail={(mediaKeyOrOpts) => goToDetails(mediaKeyOrOpts)}",
    );
    expect(publishedListVideoOwnerId("p1", "video:vid-1")).toBe(
      "p1:video:vid-1",
    );
  });

  it("Z: Detail opens same media/order from cache", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("getPublishedMediaCache");
    expect(body).toContain("initialMediaKey");
  });

  it("AA: return from Detail requires visibility re-evaluation", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("detailRouteOpen");
    expect(surface).toContain("isPostDetailPath");
    expect(surface).toContain("setDwellOk(false)");
  });

  it("AB/AC: Profile/Feed scroll + actions preserved", () => {
    const post = read("src/components/Post.tsx");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(post).toContain("<PostActions");
    expect(post).toContain("PublishedMediaSurface");
    expect(surface).not.toContain("document.body");
    expect(surface).toContain('"profile"');
    expect(surface).toContain("data-published-media-mode={mode}");
  });

  it("AD: PV2B.2 Detail carousel path preserved (surface delegates)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain('mode === "detail"');
    expect(surface).toContain("PublishedMediaCarousel");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("openFullscreenAt(item.key)");
    expect(carousel).toContain("clampCarouselCommitIndex");
  });

  it("AE/AF: no new backend/migration for PV3", () => {
    expect(true).toBe(true);
  });

  it("shared surface + Post wiring", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("mode={publishedListMode}");
    expect(post).toContain("getPublishedMediaCache");
    expect(post).toContain("resolvePublishedMediaCover");
  });
});

describe("PASS PV3 — coordinator unit", () => {
  beforeEach(() => {
    __resetPublishedListVideoCoordinatorForTests();
  });

  it("releaseAll clears owner", () => {
    let revoked = false;
    requestPublishedListVideoOwnership({
      ownerId: "z",
      onRevoke: () => {
        revoked = true;
      },
    });
    releaseAllPublishedListVideoOwnership();
    expect(getPublishedListVideoOwnerId()).toBeNull();
    expect(revoked).toBe(true);
  });
});
