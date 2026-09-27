/**
 * Phase 1 published RSVP UI retirement — source/contract checks.
 * Does not cover Create, Edit, or notifications.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const publishedSurfaces = [
  "src/components/detail/PostDetailBody.tsx",
  "src/components/ui/PostActions.tsx",
  "src/components/Hangout.tsx",
  "src/components/Post.tsx",
] as const;

describe("published RSVP UI retirement (phase 1)", () => {
  it("Post Detail does not mount RSVP for hangouts or any post type", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).not.toContain("RSVPComponent");
    expect(body).not.toContain("RSVPListDrawer");
    expect(body).not.toContain("data-rsvp");
    expect(body).not.toMatch(/Going\s+[Nn]\s*\/\s*[Mm]/);
    expect(body).toContain("rsvp_capacity");
  });

  it("PostActions (Home / Profile / Saved via Post) has no RSVP mount", () => {
    const actions = read("src/components/ui/PostActions.tsx");
    expect(actions).not.toContain("RSVPComponent");
    expect(actions).not.toContain("RSVPListDrawer");
    expect(actions).not.toContain("hangoutRsvpConfigured");
    expect(actions).toContain("<SaveButton");
    expect(actions).toContain("<PostRatingChip");
    expect(actions).toContain("SocialActionCluster");
    expect(actions).toContain("canOfferPairUp");
    expect(actions).toContain("canOfferGroupUp");
  });

  it("Hangout rail has no RSVP; rating footer remains when ratings on", () => {
    const hangout = read("src/components/Hangout.tsx");
    expect(hangout).not.toContain("RSVPComponent");
    expect(hangout).not.toContain("RSVPListDrawer");
    expect(hangout).not.toContain("railRsvpConfigured");
    expect(hangout).toContain("{ratingEnabled ? (");
    expect(hangout).toContain("<PostRatingChip");
    expect(hangout).toContain("SocialActionCluster");
  });

  it("Profile and Saved inherit removal through shared Post → PostActions", () => {
    const own = read("src/sections/profile/OwnProfilePostsSection.tsx");
    const other = read("src/sections/profile/OtherProfilePostsSection.tsx");
    const home = read("src/sections/home/HomePostsSection.tsx");
    const post = read("src/components/Post.tsx");
    expect(own).toContain('from "../../components/Post"');
    expect(other).toContain('from "../../components/Post"');
    expect(home).toContain('from "../../components/Post"');
    expect(post).toContain("<PostActions");
    expect(post).not.toContain("RSVPComponent");
    expect(own).not.toContain("RSVPComponent");
    expect(other).not.toContain("RSVPComponent");
    expect(home).not.toContain("RSVPComponent");
  });

  it("published surfaces cannot open RSVPListDrawer or toggle Going", () => {
    for (const rel of publishedSurfaces) {
      const src = read(rel);
      expect(src).not.toContain("RSVPListDrawer");
      expect(src).not.toContain("setShowRSVPList");
      expect(src).not.toContain("rsvp_responses");
      expect(src).not.toContain("rsvp_going");
    }
    const drawerImporters = read("src/components/ui/RSVPComponent.tsx");
    expect(drawerImporters).toContain("RSVPListDrawer");
  });

  it("independent Follow on Post Detail sticky bar is preserved", () => {
    const sticky = read("src/components/ui/StickyPostActions.tsx");
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(sticky).toContain("<FollowButton");
    expect(body).toContain("<StickyPostActions");
    expect(body).not.toContain("FollowButton");
  });

  it("legacy Activities and V4 Sections rendering is unchanged", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("buildTimelineDisplayItems");
    expect(body).toContain("PostV4SectionsReadOnly");
    expect(body).toContain("listPublishedV4SectionBodies");
    expect(body).toContain("PostDetailSocialDock");
  });

  it("does not delete RSVP services or historical payload fields", () => {
    expect(read("src/api/services/rsvp.ts")).toContain("getRSVPListOptimized");
    expect(read("src/components/ui/RSVPComponent.tsx")).toContain(
      'from("rsvp_responses")',
    );
    expect(read("src/lib/rsvpCache.ts")).toContain("getCachedRSVPData");
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("rsvp_capacity");
    expect(feed).toContain("rsvp_data");
  });
});
