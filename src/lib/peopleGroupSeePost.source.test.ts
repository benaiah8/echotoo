/**
 * Groups “See post” source entry — icon beside date/status (no below-card pill).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canOpenGroupSourcePost } from "./people/groupSourcePostOpen";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups See post source entry", () => {
  it("1: See post control in top date row (not below card)", () => {
    const presentation = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx",
    );
    expect(presentation).toContain("PeopleSeePostControl");
    expect(presentation).toContain("data-people-group-source-date-row");
    expect(presentation).not.toContain("data-people-group-see-post-slot");
    expect(presentation).not.toContain("data-people-group-see-post-icon");

    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).not.toContain("deckSeePost");
    expect(media).not.toContain("data-people-group-see-post");
  });

  it("2–3: uses existing Post Detail path; no Group-specific viewer", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("navigateToPostDetailInApp");
    expect(body).toContain("handleSeePost");
    expect(body).toContain("canOpenGroupSourcePost");
    expect(body).not.toContain("GroupPostViewer");
    expect(body).not.toContain("GroupPostDetail");

    const presentation = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx",
    );
    expect(presentation).not.toContain("PostDetailModal");
    expect(presentation).toContain("onSeePost?.()");
  });

  it("4–7: suspend + media cache handoff before open; Back stays on overlay path", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("onSuspendSession()");
    expect(body).not.toContain("releaseAllPublishedListVideoOwnership");
    expect(body).toContain("ensurePublishedMediaCacheForDetailHandoff");
    expect(body).toContain("initialMediaKey");
    expect(body).toContain("resolveGroupSourcePostInitialMediaKey");

    const seeFn = body.slice(
      body.indexOf("const handleSeePost"),
      body.indexOf("const isPending ="),
    );
    expect(seeFn.indexOf("canOpenGroupSourcePost")).toBeLessThan(
      seeFn.indexOf("onSuspendSession()"),
    );
    expect(seeFn.indexOf("onSuspendSession()")).toBeLessThan(
      seeFn.indexOf("navigateToPostDetailInApp"),
    );

    const nav = read("lib/navigateToPostDetailInApp.ts");
    expect(nav).toContain("backgroundLocation: currentLocation");

    expect(body).toContain("mediaIndexById");
    expect(body).toContain("browseTab");
    expect(body).toContain("scopeSnap");
  });

  it("8: unavailable source does not expose broken action", () => {
    expect(
      canOpenGroupSourcePost({
        source_post_id: "p1",
        source_type: "hangout",
      }),
    ).toBe(true);
    expect(
      canOpenGroupSourcePost({
        source_post_id: "p1",
        source_type: "experience",
      }),
    ).toBe(true);
    expect(
      canOpenGroupSourcePost({
        source_post_id: "  ",
        source_type: "hangout",
      }),
    ).toBe(false);
    expect(
      canOpenGroupSourcePost({
        source_post_id: "p1",
        source_type: null,
      }),
    ).toBe(false);
    expect(
      canOpenGroupSourcePost({
        source_post_id: null,
        source_type: "hangout",
      }),
    ).toBe(false);
    expect(
      canOpenGroupSourcePost({
        source_post_id: "p1",
        source_type: "hangout",
        source_unavailable: true,
      }),
    ).toBe(false);

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain(
      "meta.isCurrent && canOpenGroupSourcePost(row)",
    );
  });

  it("9–10: Prev/Next + image/video tap unchanged", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain('data-people-group-media-nav="prev"');
    expect(media).toContain('data-people-group-media-nav="next"');
    expect(media).toContain("groupMediaSurfaceTapAdvances");
    expect(media).toContain("groupMediaPrevIndex");
    expect(media).toContain("groupMediaNextIndex");
    expect(media).toContain("onOpenSourcePost");
  });

  it("11: Feed/Profile/Post Detail implementations unchanged by Groups entry", () => {
    const feed = read("components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("data-people-group-see-post");
    expect(feed).not.toContain("canOpenGroupSourcePost");

    const carousel = read("components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).not.toContain("PeopleGroup");
    expect(carousel).not.toContain("canOpenGroupSourcePost");

    const duo = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(duo).not.toContain("data-people-group-see-post");
  });
});
