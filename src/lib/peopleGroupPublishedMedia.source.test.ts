/**
 * Groups Feed-style media presentation — isolated from Feed/Profile surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishedMediaItem } from "./publishedMedia";
import {
  GROUP_PUBLISHED_IMAGE_FIT,
  GROUP_PUBLISHED_IMAGE_LAYOUT,
  GROUP_PUBLISHED_MEDIA_PLATE_BG,
  GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER,
  groupPublishedActiveVisual,
  groupPublishedContainedSize,
  resolveGroupPublishedMediaKind,
} from "./people/groupPublishedMediaPresentation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const landscape = { w: 1600, h: 900 };
const portrait = { w: 900, h: 1600 };
const tall = { w: 800, h: 3200 };
const square = { w: 1000, h: 1000 };

const landscapeItem: PublishedMediaItem = {
  kind: "image",
  key: "image:land",
  url: "https://cdn.example/land.jpg",
};

const portraitItem: PublishedMediaItem = {
  kind: "image",
  key: "image:port",
  url: "https://cdn.example/port.jpg",
};

const video: PublishedMediaItem = {
  kind: "video",
  key: "video:v1",
  mediaId: "m1",
  videoId: "bunny",
  status: "ready",
  posterUrl: "https://cdn.example/poster.jpg",
  width: 1280,
  height: 720,
  durationSec: 12,
};

describe("Groups Feed-style media (isolated)", () => {
  it("1–2: Groups-owned surface; Feed has no Groups mode", () => {
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain("data-people-group-published-media");
    expect(surface).toContain("ProgressiveImage");
    expect(surface).toContain("GROUP_PUBLISHED_IMAGE_LAYOUT");
    expect(surface).toContain("GROUP_PUBLISHED_IMAGE_FIT");
    expect(surface).not.toMatch(/from ["'].*PublishedMediaSurface/);
    expect(surface).not.toMatch(/from ["']swiper/);
    expect(surface).not.toContain("<Swiper");

    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("groupMode");
    expect(feed).not.toContain("PeopleGroup");
    expect(feed).not.toContain("people-group-published");

    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("PeopleGroupPublishedMediaSurface");
    expect(shell).not.toContain("<img");
  });

  it("3–7: landscape/portrait/tall/square fit inside fixed canvas; no stretch", () => {
    expect(GROUP_PUBLISHED_IMAGE_FIT).toBe("contain");
    expect(GROUP_PUBLISHED_IMAGE_LAYOUT).toBe("fill");

    const canvas = { canvasW: 320, canvasH: 420 };

    const land = groupPublishedContainedSize({
      ...canvas,
      sourceW: landscape.w,
      sourceH: landscape.h,
    });
    expect(land.width).toBeLessThanOrEqual(canvas.canvasW + 0.001);
    expect(land.height).toBeLessThanOrEqual(canvas.canvasH + 0.001);
    expect(land.width / land.height).toBeCloseTo(1600 / 900, 5);

    const port = groupPublishedContainedSize({
      ...canvas,
      sourceW: portrait.w,
      sourceH: portrait.h,
    });
    expect(port.height).toBeLessThanOrEqual(canvas.canvasH + 0.001);
    expect(port.width / port.height).toBeCloseTo(900 / 1600, 5);

    const veryTall = groupPublishedContainedSize({
      ...canvas,
      sourceW: tall.w,
      sourceH: tall.h,
    });
    // Tall cannot increase outer height — contained height ≤ canvas.
    expect(veryTall.height).toBeLessThanOrEqual(canvas.canvasH + 0.001);
    expect(veryTall.height).toBeCloseTo(canvas.canvasH, 5);

    const sq = groupPublishedContainedSize({
      ...canvas,
      sourceW: square.w,
      sourceH: square.h,
    });
    expect(sq.width).toBeCloseTo(sq.height, 5);
    expect(sq.width).toBeLessThanOrEqual(canvas.canvasW + 0.001);

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain('fit={GROUP_PUBLISHED_IMAGE_FIT}');
    expect(surface).toContain('data-published-media-fit="contain"');
    expect(surface).not.toContain("object-cover");
  });

  it("8–11: single tap → Post Detail; multi image tap-cycle; no inner Swiper", () => {
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("onOpenSourcePost");
    expect(shell).toContain('items[safeIndex]?.kind !== "video"');
    expect(shell).toContain("groupMediaSurfaceTapAdvances");
    expect(shell).toContain("groupMediaNextIndex");
    expect(shell).toContain('data-people-group-media-inner-swiper="false"');
    expect(shell).not.toMatch(/from ["']swiper/);
    expect(shell).not.toContain("<Swiper");
    expect(GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER).toBe(false);

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain('layout="duo"');
    // Embla carousel remains the horizontal owner (MatchDeckCarousel).
    expect(body).toContain("MatchDeckCarousel");
  });

  it("12–14: no-media / host / title band footprint (chrome inside card)", () => {
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("data-people-group-host-slot");
    expect(shell).toContain("inset-x-3 top-3");
    expect(shell).toContain("data-people-group-title-band");
    expect(shell).toContain("pt-14");
    expect(shell).toContain("GROUP_MEDIA_NAV_INSET_PX");
    expect(shell).toContain("PEOPLE_MINE_CARD_RADIUS");
    expect(shell).toContain("h-full w-full");

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain("data-people-group-no-media");
    expect(GROUP_PUBLISHED_MEDIA_PLATE_BG).toBe("bg-black");
  });

  it("15: video metadata accepted; poster-only (no inline player)", () => {
    expect(resolveGroupPublishedMediaKind([video])).toBe("video-poster");
    const vis = groupPublishedActiveVisual([video], 0);
    expect(vis.isVideo).toBe(true);
    expect(vis.url).toContain("poster.jpg");
    expect(vis.item?.kind).toBe("video");
    if (vis.item?.kind === "video") {
      expect(vis.item.videoId).toBe("bunny");
      expect(vis.item.status).toBe("ready");
      expect(vis.item.width).toBe(1280);
      expect(vis.item.height).toBe(720);
      expect(vis.item.posterUrl).toContain("poster.jpg");
    }

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain("data-people-group-video-meta");
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).toContain("PiPlayFill");
    expect(surface).not.toContain("PeopleGroupPublishedVideo");
    expect(surface).not.toContain("PublishedVideoPlayer");
  });

  it("16: Feed/Profile/Post Detail surface files unchanged by Groups wiring", () => {
    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).toContain('layout={singleImage ? "natural" : "fill"}');
    expect(feed).toContain('fit={singleImage ? "contain" : "cover"}');
    expect(feed).toContain("Swiper");

    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PublishedMediaCarousel");
    expect(carousel).not.toContain("PeopleGroup");
  });

  it("kind helpers: empty / single / multi", () => {
    expect(resolveGroupPublishedMediaKind([])).toBe("empty");
    expect(resolveGroupPublishedMediaKind([landscapeItem])).toBe("single-image");
    expect(
      resolveGroupPublishedMediaKind([landscapeItem, portraitItem]),
    ).toBe("multi-image");
  });
});
