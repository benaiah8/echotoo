import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mixedIndexToLightboxImageIndex,
  publishedLightboxImageUrls,
  type PublishedMediaItem,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mixed: PublishedMediaItem[] = [
  { kind: "image", key: "image:a", url: "https://cdn/a.jpg" },
  {
    kind: "video",
    key: "video:m1",
    mediaId: "m1",
    videoId: "bunny-1",
    status: "ready",
    posterUrl: "https://cdn/poster.jpg",
    width: 1080,
    height: 1920,
    durationSec: 12,
  },
  { kind: "image", key: "image:b", url: "https://cdn/b.jpg" },
];

describe("PASS PV1.3 — image lightbox index", () => {
  it("C/D: mixed maps correct image index; video excluded", () => {
    expect(publishedLightboxImageUrls(mixed)).toEqual([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
    ]);
    expect(mixedIndexToLightboxImageIndex(mixed, 0)).toBe(0);
    expect(mixedIndexToLightboxImageIndex(mixed, 1)).toBeNull();
    expect(mixedIndexToLightboxImageIndex(mixed, 2)).toBe(1);
  });
});

describe("PASS PV1.3 — Detail carousel / lightbox contracts", () => {
  it("A/B/E/F: image tap opens mixed fullscreen viewer; swipe gated (PV2B)", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PublishedMediaFullscreenViewer");
    expect(carousel).toContain("openFullscreenForImageTap");
    expect(carousel).toContain("gestureMovedRef");
    expect(carousel).toContain("MIXED_HERO_SWIPE_THRESHOLD_PX");
    expect(carousel).toContain("onClose={closeFullscreen}");
    expect(carousel).toContain("activeMediaKey");
  });

  it("shared image lightbox still used by MediaCarousel (feed cards)", () => {
    const media = read("src/components/MediaCarousel.tsx");
    expect(media).toContain("MediaGalleryLightbox");
    expect(media).toContain('from "./MediaGalleryLightbox"');
    const lightbox = read("src/components/MediaGalleryLightbox.tsx");
    expect(lightbox).toContain("modules={[Zoom]}");
    expect(lightbox).toContain("swiper-zoom-container");
    expect(lightbox).toContain("useOverlayBackgroundScrollLock");
  });
});

describe("PASS PV1.3 — scrubber position", () => {
  it("G: published scrubber near bottom of media frame", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS");
    expect(player).not.toContain("CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS");
    const index = read("src/lib/publishedMedia/index.ts");
    expect(index).toContain('PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS = "0.75rem"');
  });

  it("H: Create scrubber layout unchanged", () => {
    const create = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(create).toContain("CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS");
    expect(create).not.toContain("PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS");
  });

  it("I: scrubber drag still cannot swipe carousel", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PUBLISHED_MEDIA_SWIPE_NO_SELECTOR");
    expect(carousel).toContain("noSwiping");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-video-scrubber");
    expect(player).toContain("setPointerCapture");
    expect(player).toContain('touchAction: "none"');
  });
});

describe("PASS PV1.3 — processing + HLS guards", () => {
  it("K/L: processing shows poster + quiet Processing label (no ready copy)", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("Getting video ready…");
    expect(player).not.toContain("Loading video…");
    expect(player).toContain("data-published-video-processing");
    expect(player).toContain("Processing video…");
    expect(player).toContain("showPoster");
    expect(player).toMatch(/posterUrl/);
  });

  it("M/N/O/P/Q: processing→ready in place; no HLS while processing; preload none", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("fetchPublishedPostMediaRowById");
    expect(player).toContain("onVideoUpdated");
    expect(player).toContain('key: item.key');
    expect(player).toMatch(
      /ensureHlsLoaded[\s\S]*status !== "ready"[\s\S]*return false/,
    );
    expect(player).toMatch(
      /Prefetch hls\.js CODE only when warm or active[\s\S]*status !== "ready"/,
    );
    expect(player).toContain('preload="none"');
    expect(player).toContain("userWantsPlayRef");
    expect(player).toMatch(
      /if \(!isActive && !isWarm\) \{[\s\S]*tearDownPlayback\(\)/,
    );
    expect(player).not.toMatch(/5\s*second|first five|downloadCache|fixed.?5/i);
  });

  it("R/S: pagination below frame; black stage", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("data-published-media-pagination");
    expect(carousel.indexOf("</Swiper>")).toBeLessThan(
      carousel.indexOf("<PublishedMediaPagination"),
    );
    expect(carousel).toContain("bg-black");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("bg-black");
  });

  it("T/U: Feed/Profile unchanged (Edit media hydration is PV4)", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).not.toContain("PublishedMediaCarousel");
    expect(feed).not.toContain("PublishedVideoPlayer");
    const edit = read("src/lib/editPostBootstrap.ts");
    // PV4 adds PublishedVideoReference to edit bootstrap.
    expect(edit).toContain("PublishedVideoReference");
  });

  it("V: no new dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["hls.js"]).toBeTruthy();
    expect(pkg.dependencies["video.js"]).toBeUndefined();
  });
});
