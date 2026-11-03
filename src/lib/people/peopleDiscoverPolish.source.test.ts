/**
 * Discover Stage-1 polish contracts — presentation only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVER_OPPORTUNITIES_PER_APPEARANCE,
  groupDiscoverOpportunities,
} from "./groupDiscoverOpportunities";
import { PEOPLE_DISCOVER_PERSON_PAD_Y_PX } from "./peopleFeedLayout";
import {
  PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS,
  PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS,
} from "../../components/people/PeopleDiscoverOpportunityBox";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDiscoverPolish", () => {
  it("does not render a duplicate username above the Discover portrait", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).not.toContain("data-people-discover-name");
    expect(row).toContain("discoverPersonUsesPhotoFrame");
    expect(row).toContain("PeopleDiscoverCharacterCard");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("mergeDiscoverPersonIdentity");
    expect(row).toContain("MinePortraitIdentityOverlay");
    expect(row).toContain("PeopleCandidateMedia");
  });

  it("left-aligns feed identity overlay and clears fullscreen on the right", () => {
    const overlay = read("components/people/MinePortraitIdentityOverlay.tsx");
    expect(overlay).toContain('"top-left"');
    expect(overlay).toContain("justify-start");
    expect(overlay).toContain("PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX");
    expect(overlay).toContain('"top-center"');
  });

  it("mounts bottom photo indicators above the identity plate for 2+ photos", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain('data-people-photo-indicators-placement="bottom"');
    expect(media).toContain("feedLayout && photoCount > 1");
    expect(media).toContain("z-[12]");
    expect(media).toContain('data-people-mine-identity-plate="true"');
    expect(media).toContain("z-[10]");
  });

  it("keeps tap-to-cycle unlocked in Discover feedLayout", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("feedTapCycleUnlocked");
    expect(media).toContain("isCurrent || feedTapCycleUnlocked");
  });

  it("Discover entry resets to scrollTop 0; does not restore opportunity ids", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const discoverList = overlay.slice(
      overlay.indexOf(") : isDiscoverScope ? ("),
      overlay.indexOf("</PeopleFeedList>")
    );
    expect(discoverList).toContain("<PeopleFeedList");
    expect(discoverList).not.toContain("scrollToId=");
    expect(discoverList).not.toContain("scrollRestoreToken=");
    expect(overlay).not.toContain("discoverScrollRestoreToken");
    expect(overlay).toContain('querySelector("[data-people-feed-list]")');
    expect(overlay).toContain("list.scrollTop = 0");
    // Opportunity boxes still carry data-people-feed-opportunity (not scroll targets on entry).
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("data-people-feed-opportunity={opportunityId}");
  });

  it("portrait renders before associated opportunity cards in a person row", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    const portraitAt = row.indexOf('data-people-discover-portrait="true"');
    const identityAt = row.indexOf('data-people-discover-identity="true"');
    const oppStackAt = row.indexOf('data-people-discover-opp-stack="true"');
    const childrenAt = row.indexOf("{children}");
    expect(identityAt).toBeGreaterThan(0);
    expect(oppStackAt).toBeGreaterThan(identityAt);
    expect(childrenAt).toBeGreaterThan(oppStackAt);
    expect(portraitAt === -1 || portraitAt < oppStackAt).toBe(true);
  });

  it("Plans/Groups keep legacy scrollIntoView center; Discover does not use token restore", () => {
    const list = read("components/people/PeopleFeedList.tsx");
    expect(list).toContain('el.scrollIntoView({ block: "center", behavior: "auto" })');
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(plans).toContain("scrollToId={scopeSnap.currentOpportunityId}");
    expect(plans).not.toContain("scrollRestoreToken");
    expect(groups).toContain("scrollToId=");
    expect(groups).not.toContain("scrollRestoreToken");
  });

  it("skips pruneActiveOrderedIds while browsing Discover", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toMatch(
      /if \(contentScope === "discover"\) return;\s*\n\s*const snap = scopeStateRef/
    );
    expect(overlay).toContain("pruneActiveOrderedIds");
  });

  it("opportunity box shows Event/Post text, conditional caption clamp, note accent, top-right actions", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("postTypeCompactLabel");
    expect(box).not.toContain("PostTypeMetaChip");
    expect(box).toContain("PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS");
    expect(box).toContain("PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS");
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS).toContain("line-clamp-2");
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS).toContain("line-clamp-3");
    expect(box).toContain("px-3");
    expect(box).toContain("PEOPLE_PERSONAL_NOTE_ACCENT_CLASS");
    expect(box).toContain("data-people-personal-note-accent");
    expect(box).not.toContain("data-people-discover-opp-note-divider");
    expect(box).toContain('data-people-discover-opp-actions-align="top-right"');
    expect(box).toContain("items-start");
    expect(box).toContain("data-people-discover-opp-actions");
    expect(box).toContain("data-people-feed-opportunity={opportunityId}");
  });

  it("increases spacing between Discover person appearances", () => {
    expect(PEOPLE_DISCOVER_PERSON_PAD_Y_PX).toBeGreaterThanOrEqual(16);
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).toContain("--people-discover-person-pad-y");
    expect(row).toContain("border-t");
  });

  it("preserves three-opportunity grouping contract", () => {
    expect(DISCOVER_OPPORTUNITIES_PER_APPEARANCE).toBe(3);
    const groups = groupDiscoverOpportunities([
      { opportunity_id: "a1", creator_id: "a" },
      { opportunity_id: "a2", creator_id: "a" },
      { opportunity_id: "a3", creator_id: "a" },
      { opportunity_id: "a4", creator_id: "a" },
    ]);
    expect(groups[0]?.opportunities).toHaveLength(3);
    expect(groups[1]?.opportunities).toHaveLength(1);
  });

  it("seen marking stays on opportunity boxes via PeopleFeedList IO", () => {
    const list = read("components/people/PeopleFeedList.tsx");
    expect(list).toContain("[data-people-feed-opportunity]");
    expect(list).toContain("intersectionRatio < 0.55");
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).not.toContain("data-people-feed-opportunity");
  });

  it("Duo horizontal presentation remains mounted and Discover-gated polish does not remove it", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("<MatchDeckCarousel");
    expect(overlay).toContain("PeopleDuoCandidateSlide");
    expect(overlay).toContain('duoPresentation="mine"');
    expect(overlay).toContain("PeopleDiscoverPersonRow");
  });
});
