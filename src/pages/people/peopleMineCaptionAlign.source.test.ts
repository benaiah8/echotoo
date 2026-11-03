import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname);

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Mine caption Back-align structure (source)", () => {
  it("Overlay uses People feed top/bottom pads for all scopes", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).toContain("peopleFeedContentTopPad()");
    expect(src).toContain("isDuoDeckScope ? 0 : peopleFeedContentBottomPad()");
    expect(src).toContain("PeopleFeedTopNav");
    expect(src).toContain("isCanonicalPairUpScope");
  });

  it("Feed shell drops immersive dock spacers", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).not.toContain("data-people-mine-below-spacer");
    expect(src).not.toContain("data-people-mine-deck-column");
    expect(src).not.toContain("paddingBottom: PEOPLE_MINE_BOTTOM_GAP_PX");
    expect(src).not.toContain("MinePaintLayer");
    expect(src).not.toContain("<PeopleBottomDock");
    const feed = readFileSync(
      resolve(__dirname, "../../lib/people/peopleFeedLayout.ts"),
      "utf8"
    );
    expect(feed).toContain("peopleFeedContentBottomPad");
    expect(feed).toContain("--safe-area-bottom-layout");
  });

  it("Legacy carousel surplus CSS var remains available", () => {
    const src = read("MatchDeckCarousel.tsx");
    expect(src).toContain("--people-mine-surplus-pad-top");
    expect(src).toContain("paddingTop: 0");
    expect(src).not.toContain("mineViewportLiftPx");
    expect(src).not.toContain("overflow-y-visible");
    expect(src).not.toContain("peopleShellMineSourceBackAlignLiftPx");
  });

  it("Canonical slide keeps absolute caption at top:0; surplus after TOP_GAP reserve", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
      ),
      "utf8"
    );
    expect(src).toContain('data-people-duo-source-caption="true"');
    expect(src).toContain('data-people-duo-source-reserve="true"');
    expect(src).toContain("absolute top-0");
    expect(src).toContain("var(--people-mine-surplus-pad-top, 0px)");
    expect(src).toContain("SOURCE_BACK_CLEARANCE_PX = 32");
    expect(src).toContain("SOURCE_CAPTION_OPTICAL_PAD_TOP_PX = 2");
    expect(src).toContain(
      "text-[13px] leading-tight text-[var(--text)]/82"
    );
    expect(src).not.toContain("top: -");
    expect(src).not.toContain("mineBackAlignLiftPx");
    const reserveIdx = src.indexOf("data-people-duo-source-reserve");
    const surplusIdx = src.indexOf("data-people-mine-surplus-pad-top");
    expect(surplusIdx).toBeGreaterThan(reserveIdx);
  });

  it("Mine Duo slide always delegates to canonical presentation", () => {
    const src = read("PeopleDuoCandidateSlide.tsx");
    expect(src).toContain("PeopleCanonicalCandidatePresentation");
    expect(src).not.toContain("data-people-duo-identity");
    expect(src).not.toContain("Legacy Discover");
  });

  it("Feed top nav replaces immersive Back dock", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).not.toContain('data-people-back="top-left"');
    expect(src).not.toContain("data-people-back-mine");
    expect(src).toContain("PeopleFeedTopNav");
    expect(src).not.toContain("onBack={onClose}");
    const nav = read("PeopleFeedTopNav.tsx");
    expect(nav).toContain("data-people-feed-top-nav");
    expect(nav).toContain("bg-[var(--glass-bg)]");
  });
});
