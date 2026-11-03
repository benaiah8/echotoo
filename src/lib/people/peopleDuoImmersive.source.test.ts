/**
 * Historical Duo restoration contracts (Discover vertical feed frozen).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDuoHistoricalRestoration", () => {
  it("Duo slide uses canonical Mine presentation, not immersive reconstruction", () => {
    const slide = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(slide).toContain("PeopleCanonicalCandidatePresentation");
    expect(slide).not.toContain("PeopleDuoImmersivePresentation");
    expect(read("pages/people/MatchDeckOverlay.tsx")).not.toContain(
      "PeopleDuoImmersivePresentation"
    );
  });

  it("atmosphere mounts for Duo (my_plans) only — not Discover feed", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("isDuoAtmosphereScope");
    expect(overlay).toContain("<MineAtmosphereCrossfade");
    expect(overlay).toMatch(
      /isDuoAtmosphereScope[\s\S]*contentScope === "my_plans"/
    );
  });

  it("Duo carousel flex-height chain, in-flow chrome, edge nav", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    expect(overlay).toContain('data-people-duo-carousel-slot="true"');
    expect(overlay).toContain("duoInFlowChrome");
    expect(overlay).not.toContain("duoEmblaNavArrows");
    expect(overlay).toContain("<MineEdgeNavCards");
    expect(overlay).toContain("mineEdgeNavCardsRef");
    expect(carousel).toContain("h-full min-h-0 w-full flex-1");
    expect(carousel).toContain('data-people-embla-viewport="true"');
    expect(overlay).toContain("PeopleDuoCandidateSlide");
    expect(overlay).toContain("PeopleDeckEmptyCard");
  });

  it("Duo uses modern bottom action row above global BottomTab", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    const layout = read("pages/people/peopleShellLayout.ts");
    expect(overlay).toContain("<PeopleDuoBottomActionRow");
    expect(overlay).toContain("isPeopleTabVisible");
    expect(row).toContain("createPortal");
    expect(row).toContain("PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB");
    expect(layout).toContain("PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB = 45");
    expect(row).toContain("data-people-duo-bottom-action-row");
  });

  it("Duo slide uses presentation identity adapter and clamped photo index", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("identitySourceForDuoPresentation");
    expect(overlay).toContain("adaptDuoPresentationIdentity");
    expect(overlay).toContain("clampDiscoverPhotoIndex");
  });

  it("Mine photo stack has Duo load/error contracts without Discover feed changes", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("mineEchoPreset");
    expect(media).toContain("mineFailedPhotos");
    expect(media).toContain("data-people-mine-photo-pending");
    expect(media).toContain("FeedEchoCompact");
    expect(media).toContain("MinePhotoStack");
  });

  it("Duo handlers unchanged; Discover opportunity box untouched", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(overlay).toContain("handleFeedHeart");
    expect(overlay).toContain("handleFeedMessage");
    expect(overlay).toContain("runPairUpConnectForTarget");
    expect(box).toContain("PeopleFeedActionRail");
    expect(overlay).toContain("groupDiscoverOpportunities");
  });

  it("global tab bottom pad adapter for Duo", () => {
    const layout = read("pages/people/peopleShellLayout.ts");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(layout).toContain("peopleShellMineDuoGlobalTabBottomPad");
    expect(layout).toContain("peopleDuoModernSlideScrollBottomPad");
    expect(overlay).toContain("isDuoDeckScope ? 0 : peopleFeedContentBottomPad()");
    expect(overlay).not.toContain("peopleShellMineDuoGlobalTabBottomPad");
  });
});
