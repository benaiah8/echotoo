/**
 * Groups → Post Detail handoff (poster-only; no immersive expand).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX } from "./people/groupPublishedMediaPresentation";
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

describe("Groups Detail parity (poster-only)", () => {
  it("1–3: single open path passes current initialMediaKey; no immersive", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("const handleSeePost =");
    expect(body).not.toContain("handleSeePostImmersive");
    expect(body).not.toContain("openImmersiveFullscreen");
    expect(body).toContain("resolveGroupSourcePostInitialMediaKey");
    expect(body).toContain("initialMediaKey");
    expect(body).toContain("mediaIndexById[deckId]");

    expect(resolveGroupSourcePostInitialMediaKey([video, img("a")], 0)).toBe(
      "video:v1",
    );
    expect(resolveGroupSourcePostInitialMediaKey([video, img("a")], 1)).toBe(
      "image:a",
    );
  });

  it("4–6: cache handoff kept; no Group playback release; no Group Detail viewer", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("ensurePublishedMediaCacheForDetailHandoff");
    expect(body).toContain("navigateToPostDetailInApp");
    expect(body).not.toContain("releaseAllPublishedListVideoOwnership");
    expect(body).not.toContain("GroupPostDetail");
    expect(body).not.toContain("GroupPostViewer");

    const see = body.slice(
      body.indexOf("const handleSeePost ="),
      body.indexOf("const isPending ="),
    );
    expect(see.indexOf("ensurePublishedMediaCacheForDetailHandoff")).toBeLessThan(
      see.indexOf("navigateToPostDetailInApp"),
    );
  });

  it("7–9: video chrome uses image inset; dots in chrome", () => {
    expect(GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX).toBe(0);
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).not.toContain("GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX");
    expect(shell).toContain("paddingBottom: inset");
    expect(shell).toContain("data-people-group-media-dots");
    const bandStart = shell.indexOf("data-people-group-title-band");
    const dots = shell.indexOf("data-people-group-media-dots");
    const bandEnd = shell.indexOf("data-people-group-media-chrome-row");
    expect(dots).toBeGreaterThan(bandStart);
    expect(dots).toBeLessThan(bandEnd);
  });

  it("10–11: poster-only surface; Embla owns swipe", () => {
    expect(
      existsSync(join(root, "components/people/PeopleGroupPublishedVideo.tsx")),
    ).toBe(false);
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).not.toContain("PublishedVideoPlayer");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("MatchDeckCarousel");
    expect(body).toContain('layout="duo"');
  });

  it("12–15: See post via shared control beside date; caption clickable", () => {
    const presentation = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx",
    );
    expect(presentation).not.toContain("data-people-group-see-post-slot");
    expect(presentation).not.toContain("data-people-group-see-post-icon");
    expect(presentation).toContain("PeopleSeePostControl");
    expect(presentation).toContain("data-people-group-source-date-row");
    expect(presentation).toContain("onSeePost?.()");
    expect(presentation).toContain("data-people-group-source-caption-hit");
    expect(presentation).toContain("captionInteractive");
  });

  it("16: Feed/Profile/Post Detail player untouched", () => {
    const player = read("components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("PeopleGroup");
    expect(player).not.toContain("GROUP_VIDEO_SEEKER");

    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("PeopleGroupPublishedVideo");
    expect(feed).not.toContain("GROUP_VIDEO_SEEKER");
  });
});
