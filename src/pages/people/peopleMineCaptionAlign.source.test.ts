import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname);

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Mine caption Back-align structure (source)", () => {
  it("Overlay uses Mine top pad for my_plans and discover", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).toContain("peopleShellMineContentTopPad()");
    expect(src).toContain("isCanonicalPairUpScope");
    expect(src).toContain("peopleShellContentTopPad()");
  });

  it("Mine + Discover drop flex breath spacers; note→Connect gap is shell pad", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).toContain("isCanonicalPairUpScope");
    expect(src).toContain("peopleShellMineContentBottomPad()");
    expect(src).not.toContain("data-people-mine-below-spacer");
    expect(src).not.toContain("data-people-mine-deck-column");
    expect(src).not.toContain("paddingBottom: PEOPLE_MINE_BOTTOM_GAP_PX");
    expect(src).not.toContain("MinePaintLayer");
    expect(src).not.toContain("mineLayoutPaint");
    expect(src).not.toContain("flex-[0.02]");
    const shell = read("peopleShellLayout.ts");
    expect(shell).toContain("PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX");
    expect(shell).toContain("peopleShellMineContentBottomPad");
  });

  it("Carousel moves surplus padTop into CSS var (no slide paddingTop)", () => {
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

  it("Mine caption Back-align structure preserved; deck Back lives inside unified nav", () => {
    const src = read("MatchDeckOverlay.tsx");
    expect(src).not.toContain('data-people-back="top-left"');
    expect(src).not.toContain("data-people-back-mine");
    expect(src).toContain("onBack={onClose}");
    const dock = read("PeopleBottomDock.tsx");
    expect(dock).toContain("onBack={onBack}");
    expect(dock).not.toContain('data-people-back="bottom-left"');
    const nav = read("PeopleFluidNav.tsx");
    expect(nav).toContain('data-people-back="nav-leading"');
    expect(nav).toContain("bg-[var(--glass-bg)]");
  });
});
