/**
 * Hybrid People presentation contracts — Discover vertical groups + Duo Embla.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVER_OPPORTUNITIES_PER_APPEARANCE,
  flattenDiscoverAppearanceOpportunityIds,
  groupDiscoverOpportunities,
} from "./groupDiscoverOpportunities";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleHybridPresentation", () => {
  it("caps Discover appearances at three and preserves all opportunity ids", () => {
    const ordered = Array.from({ length: 10 }, (_, i) => ({
      opportunity_id: `a${i + 1}`,
      creator_id: "alice",
    }));
    const groups = groupDiscoverOpportunities(ordered);
    expect(
      groups.every(
        (g) => g.opportunities.length <= DISCOVER_OPPORTUNITIES_PER_APPEARANCE
      )
    ).toBe(true);
    expect(groups.length).toBeGreaterThan(1);
    expect(flattenDiscoverAppearanceOpportunityIds(groups)).toEqual(
      ordered.map((r) => r.opportunity_id)
    );
  });

  it("Discover UI keeps heart above message per opportunity box", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("PeopleFeedActionRail");
    expect(box).toContain('data-people-feed-opportunity={opportunityId}');
    expect(box).toContain("onHeart");
    expect(box).toContain("onMessage");
    expect(box).toContain("postTypeCompactLabel");
    const rail = read("components/people/PeopleFeedActionRail.tsx");
    const heartIdx = rail.indexOf("data-people-feed-heart");
    const msgIdx = rail.indexOf("data-people-feed-message");
    expect(heartIdx).toBeGreaterThan(-1);
    expect(msgIdx).toBeGreaterThan(heartIdx);
  });

  it("Discover person row has no permanent side rail next to photo", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).toContain("PeopleCandidateMedia");
    expect(row).toContain('data-people-discover-appearance={appearanceKey}');
    expect(row).not.toContain("PeopleFeedActionRail");
    expect(row).not.toContain("data-people-discover-name");
    expect(row).toContain("enableHorizontalPhotoSwipe");
    expect(row).toContain("enableTapCycle={false}");
  });

  it("overlay mounts Discover groups and historical Duo carousel + connect dock", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("groupDiscoverOpportunities");
    expect(overlay).toContain("PeopleDiscoverPersonRow");
    expect(overlay).toContain("<MatchDeckCarousel");
    expect(overlay).toContain("PeopleDuoCandidateSlide");
    expect(overlay).toContain('data-people-presentation="horizontal"');
    expect(overlay).toContain("handleFeedHeart");
    expect(overlay).toContain("handleFeedRowVisible");
    expect(overlay).toContain("<MineAtmosphereCrossfade");
    expect(overlay).toContain("isDuoAtmosphereScope");
    expect(overlay).toContain("<MineEdgeNavCards");
    expect(overlay).toContain("<PeopleBottomDock");
    expect(overlay).toContain("hideCategoryNav");
    expect(overlay).toContain("PeopleFeedTopNav");
  });

  it("top nav uses soft page fade and marks Duo", () => {
    const nav = read("pages/people/PeopleFeedTopNav.tsx");
    expect(nav).toContain("data-people-feed-top-fade-soft");
    expect(nav).toContain('data-people-feed-top-fade="true"');
    expect(nav).toContain("var(--gradient-from-top)");
    expect(nav).toContain("frostedScrollThrough");
    expect(nav).toContain("data-people-duo-dest");
  });

  it("feed media unlocks Discover swipe without isCurrent; Duo keeps tap-cycle", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("feedSwipeNav");
    expect(media).toContain("enableHorizontalPhotoSwipe");
    expect(media).toContain("feedTapCycleUnlocked");
    expect(media).toContain("isCurrent || feedTapCycleUnlocked");
    const canonical = read(
      "components/people/PeopleCanonicalCandidatePresentation.tsx"
    );
    expect(canonical).toContain("enableTapCycle={isCurrent}");
    expect(canonical).not.toContain("enableHorizontalPhotoSwipe");
  });

  it("Plans uses Discover-style card; Groups use text-first Group Up card", () => {
    expect(read("pages/people/OpenPlanDeckBody.tsx")).toContain(
      "PeopleOpenPlanFeedCard"
    );
    expect(read("pages/people/OpenPlanDeckBody.tsx")).not.toContain(
      "PeopleFeedRow"
    );
    expect(read("pages/people/GroupUpDeckBody.tsx")).toContain(
      "PeopleGroupUpFeedCard"
    );
    expect(read("pages/people/GroupUpDeckBody.tsx")).not.toContain(
      "PeopleFeedRow"
    );
  });

  it("pagination freeze keeps prior Discover appearances stable", () => {
    const page1 = [
      { opportunity_id: "a1", creator_id: "alice" },
      { opportunity_id: "a2", creator_id: "alice" },
      { opportunity_id: "b1", creator_id: "bob" },
    ];
    const first = groupDiscoverOpportunities(page1);
    const page2 = [
      ...page1,
      { opportunity_id: "a3", creator_id: "alice" },
      { opportunity_id: "a4", creator_id: "alice" },
    ];
    const second = groupDiscoverOpportunities(page2, { previous: first });
    expect(second[0]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(
      flattenDiscoverAppearanceOpportunityIds(second).includes("a4")
    ).toBe(true);
  });
});
