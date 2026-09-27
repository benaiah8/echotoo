/**
 * Universal People See post + Detail parity (Groups poster-only).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX } from "./people/groupPublishedMediaPresentation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("People universal See post + video/detail parity", () => {
  it("1–2: Duo/Discover show See post left of date via shared control", () => {
    const canonical = read(
      "components/people/PeopleCanonicalCandidatePresentation.tsx",
    );
    expect(canonical).toContain("PeopleSeePostControl");
    expect(canonical).toContain("data-people-source-date-row");
    expect(canonical).toContain("showSeePost");
    const row = canonical.slice(
      canonical.indexOf("data-people-source-date-row"),
      canonical.indexOf("/** Visible caption/date"),
    );
    expect(row.indexOf("PeopleSeePostControl")).toBeLessThan(
      row.indexOf("dateText"),
    );

    const control = read("components/people/PeopleSeePostControl.tsx");
    expect(control).toContain("PiArrowSquareOutBold");
    expect(control).toContain("peopleUiCopy.deckSeePost");
    expect(control).toContain("data-people-see-post");

    const duo = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(duo).toContain("onSeePost");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("handleSeePostFor");
    expect(overlay).toContain("canSeePostFor");
  });

  it("3: Plans does not expose See post under anonymity rules", () => {
    const plans = read("components/people/PeopleOpenPlanCandidateSlide.tsx");
    expect(plans).not.toContain("onSeePost");
    expect(plans).toContain("identityVisible={false}");
    expect(plans).toContain("onOpenProfile={undefined}");
  });

  it("4–6: Groups uses shared See post; no duplicates; same open path", () => {
    const groups = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx",
    );
    expect(groups).toContain("PeopleSeePostControl");
    expect(groups).not.toContain("data-people-group-see-post-slot");
    expect(groups).not.toContain("data-people-group-see-post-icon");
    expect(groups).toContain("onSeePost?.()");
    expect(groups).toContain("data-people-group-source-caption-hit");

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("handleSeePost");
    expect(body).toContain("navigateToPostDetailInApp");
    expect(body).not.toContain("handleSeePostImmersive");
  });

  it("7–11: Groups Detail handoff passes media key + cache; Duo still releases ownership", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("initialMediaKey");
    expect(body).toContain("ensurePublishedMediaCacheForDetailHandoff");
    expect(body).toContain("resolveGroupSourcePostInitialMediaKey");
    expect(body).not.toContain("releaseAllPublishedListVideoOwnership");
    expect(body).not.toContain("openImmersiveFullscreen");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("releaseAllPublishedListVideoOwnership");
    expect(overlay).toContain("navigateToPostDetailInApp");
  });

  it("12–17: Groups poster-only; no inline scrubber prop; chrome inset unchanged", () => {
    expect(
      existsSync(join(root, "components/people/PeopleGroupPublishedVideo.tsx")),
    ).toBe(false);

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).not.toContain("PublishedVideoPlayer");
    expect(surface).not.toContain("showScrubber");

    const player = read("components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("showScrubber?: boolean");
    expect(player).not.toContain("showScrubberProp");
    expect(player).toContain("VideoPlaybackLoadingSpinner");
    expect(player).toMatch(
      /showScrubber =\s*showChrome && \(!isListSurface \|\| listChromeRevealed\)/,
    );

    expect(GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX).toBe(0);
    const shell = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(shell).not.toContain("GROUP_VIDEO_SEEKER_SAFE_BOTTOM_PX");
    expect(shell).toContain("paddingBottom: inset");
    expect(shell).toContain('data-people-group-media-nav="prev"');
    expect(shell).toContain("data-people-group-title-centered");
  });

  it("18–22: Feed/Profile/Detail scrubber default preserved; Plans/Duo cards unchanged", () => {
    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("showScrubber={false}");
    expect(feed).toContain("PublishedVideoPlayer");

    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).not.toContain("showScrubber={false}");
    expect(carousel).toContain("PublishedVideoPlayer");

    const openPlan = read("components/people/PeopleOpenPlanCandidateSlide.tsx");
    expect(openPlan).toContain("PeopleCanonicalCandidatePresentation");
  });
});
