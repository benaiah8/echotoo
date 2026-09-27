/**
 * Group media Prev/Next controls + centered title — Groups-owned only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishedMediaItem } from "./publishedMedia";
import {
  GROUP_MEDIA_NAV_BTN_HIT_PX,
  GROUP_MEDIA_NAV_BTN_VISUAL_PX,
  GROUP_MEDIA_NAV_INSET_PX,
  GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER,
  groupMediaNextIndex,
  groupMediaPrevIndex,
  groupMediaSurfaceTapAdvances,
} from "./people/groupPublishedMediaPresentation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const img = (key: string): PublishedMediaItem => ({
  kind: "image",
  key: `image:${key}`,
  url: `https://cdn.example/${key}.jpg`,
});

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

describe("Group media Prev/Next + centered title", () => {
  it("1–3: multi shows Prev/Next; single hides; title centered between", () => {
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain('data-people-group-media-nav="prev"');
    expect(shell).toContain('data-people-group-media-nav="next"');
    expect(shell).toContain("showMediaNav = count > 1");
    expect(shell).toContain('data-people-group-title-centered="true"');
    expect(shell).toContain("data-people-group-media-chrome-row");
    expect(shell).toContain("PiCaretLeftBold");
    expect(shell).toContain("PiCaretRightBold");
    expect(shell).toContain("text-center");
    expect(GROUP_MEDIA_NAV_BTN_VISUAL_PX).toBe(32);
    expect(GROUP_MEDIA_NAV_BTN_HIT_PX).toBe(40);
    expect(GROUP_MEDIA_NAV_INSET_PX).toBe(12);
  });

  it("4–6: Prev/Next wrap; use shared index helpers (mediaIndexById owner)", () => {
    expect(groupMediaPrevIndex(0, 3)).toBe(2);
    expect(groupMediaPrevIndex(2, 3)).toBe(1);
    expect(groupMediaNextIndex(2, 3)).toBe(0);
    expect(groupMediaNextIndex(0, 3)).toBe(1);

    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("groupMediaPrevIndex");
    expect(shell).toContain("groupMediaNextIndex");
    expect(shell).toContain("onActiveIndexChange");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("mediaIndexById");
    expect(body).toContain("setMediaIndexFor");
  });

  it("7–8: controls stop propagation; do not open Post Detail", () => {
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("isolateMediaNavEvent");
    expect(shell).toContain("e.stopPropagation()");
    expect(shell).toContain("e.preventDefault()");
    expect(shell).toContain('closest("[data-people-group-media-nav]")');
    // Nav path never calls onOpenSourcePost.
    expect(shell).toMatch(/goPrev\(\)/);
    expect(shell).toMatch(/goNext\(\)/);
    expect(shell).toContain("count <= 1 &&");
    expect(shell).toContain('items[safeIndex]?.kind !== "video"');
    expect(shell).toContain("onOpenSourcePost");
  });

  it("9–12: image tap advances; single opens post; video tap does not; Prev/Next leave video", () => {
    const mixed = [img("a"), video, img("b")];
    expect(groupMediaSurfaceTapAdvances(mixed, 0)).toBe(true);
    expect(groupMediaSurfaceTapAdvances(mixed, 1)).toBe(false);
    expect(groupMediaSurfaceTapAdvances(mixed, 2)).toBe(true);
    expect(groupMediaSurfaceTapAdvances([img("only")], 0)).toBe(false);
    expect(groupMediaSurfaceTapAdvances([video], 0)).toBe(false);

    // From video index, Next/Prev move away without relying on surface tap.
    expect(groupMediaNextIndex(1, 3)).toBe(2);
    expect(groupMediaPrevIndex(1, 3)).toBe(0);

    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("groupMediaSurfaceTapAdvances");
    expect(shell).toContain('items[safeIndex]?.kind !== "video"');
    expect(shell).toContain('closest("[data-people-group-video-open]")');
  });

  it("13–17: no Swiper; Embla/host/geometry/Feed isolation preserved", () => {
    expect(GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER).toBe(false);
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).not.toMatch(/from ["']swiper/);
    expect(shell).not.toContain("<Swiper");
    expect(shell).toContain('data-people-group-media-inner-swiper="false"');
    expect(shell).toContain("data-people-group-host-slot");
    expect(shell).toContain("inset-x-3 top-3");
    expect(shell).toContain("PEOPLE_MINE_CARD_RADIUS");
    expect(shell).toContain("h-full w-full");
    expect(shell).toContain("data-people-group-media-dots");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("MatchDeckCarousel");
    expect(body).toContain('layout="duo"');

    const notch = read("components/people/PeopleGroupHostNotch.tsx");
    expect(notch).toContain("data-people-group-host-notch");

    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("PeopleGroup");
    expect(feed).not.toContain("groupMediaPrevIndex");

    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).not.toContain("PeopleGroup");
    expect(carousel).not.toContain("groupMediaNav");
  });
});
