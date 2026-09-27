/**
 * Groups video = poster-only (no inline PublishedVideoPlayer).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER,
  groupMediaNextIndex,
  groupMediaPrevIndex,
  groupMediaSurfaceTapAdvances,
} from "./people/groupPublishedMediaPresentation";
import { resolveGroupSourcePostInitialMediaKey } from "./people/groupSourcePostOpen";
import type { PublishedMediaItem } from "./publishedMedia";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const img = (key: string): PublishedMediaItem => ({
  kind: "image",
  key: `image:${key}`,
  url: `https://cdn.example/${key}.jpg`,
});

const video = (key: string): PublishedMediaItem => ({
  kind: "video",
  key: `video:${key}`,
  mediaId: key,
  videoId: "bunny",
  status: "ready",
  posterUrl: `https://cdn.example/${key}-poster.jpg`,
  width: 1280,
  height: 720,
  durationSec: 12,
});

describe("Groups poster-only video", () => {
  it("1–6: PublishedMediaItem[] order is authoritative (video-first/middle/image-first)", () => {
    const videoFirst = [video("a"), img("b"), img("c")];
    expect(videoFirst.map((i) => i.kind)).toEqual(["video", "image", "image"]);
    expect(groupMediaNextIndex(0, 3)).toBe(1);
    expect(groupMediaNextIndex(1, 3)).toBe(2);
    expect(groupMediaPrevIndex(0, 3)).toBe(2);

    const videoMiddle = [img("a"), video("b"), img("c")];
    expect(videoMiddle.map((i) => i.kind)).toEqual(["image", "video", "image"]);
    expect(groupMediaNextIndex(0, 3)).toBe(1);
    expect(groupMediaSurfaceTapAdvances(videoMiddle, 0)).toBe(true);
    expect(groupMediaSurfaceTapAdvances(videoMiddle, 1)).toBe(false);

    const imageFirst = [img("a"), img("b"), video("c")];
    expect(imageFirst.map((i) => i.kind)).toEqual(["image", "image", "video"]);
    expect(resolveGroupSourcePostInitialMediaKey(imageFirst, 2)).toBe(
      "video:c",
    );
  });

  it("7–11: no PublishedVideoPlayer; poster + play affordance; Detail open with key", () => {
    expect(
      existsSync(join(root, "components/people/PeopleGroupPublishedVideo.tsx")),
    ).toBe(false);

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).not.toContain("PublishedVideoPlayer");
    expect(surface).not.toContain("PeopleGroupPublishedVideo");
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).toContain("data-people-group-video-poster");
    expect(surface).toContain("data-people-group-video-play-affordance");
    expect(surface).toContain("PiPlayFill");
    expect(surface).toContain("data-people-group-video-open");
    expect(surface).toContain("onOpenVideoPost");
    expect(surface).not.toContain("onRequestFullscreen");
    expect(surface).not.toContain("requestPublishedListVideoOwnership");

    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).toContain("onOpenVideoPost");
    expect(shell).toContain("onOpenSourcePost");
    expect(shell).not.toContain("onRequestVideoFullscreen");
    expect(shell).not.toContain("PublishedVideoPlayer");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("resolveGroupSourcePostInitialMediaKey");
    expect(body).toContain("initialMediaKey");
    expect(body).not.toContain("openImmersiveFullscreen");
    expect(body).not.toContain("handleSeePostImmersive");
    expect(body).not.toContain("onRequestVideoFullscreen");
  });

  it("12–14: no seeker/fullscreen/ownership behind Detail", () => {
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).not.toContain("showScrubber");
    expect(surface).not.toContain("onRequestMixedFullscreen");
    expect(surface).not.toContain("showExpandControl");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).not.toContain("releaseAllPublishedListVideoOwnership");

    expect(GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER).toBe(false);
  });

  it("15: Feed/Profile still mount shared player; Groups does not", () => {
    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).toContain("PublishedVideoPlayer");
    expect(feed).not.toContain("PeopleGroupPublishedVideo");

    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PublishedVideoPlayer");
    expect(carousel).not.toContain("PeopleGroup");
  });
});
