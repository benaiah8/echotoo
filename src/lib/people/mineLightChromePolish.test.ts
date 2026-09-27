import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ATM_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MineAtmosphereCrossfade.tsx"),
  "utf8"
);
const SLIDE_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const DUO_SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);
const DOCK_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
  "utf8"
);
const NAV_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleFluidNav.tsx"),
  "utf8"
);

describe("Mine light-mode caption / date / dock polish", () => {
  it("strengthens light top atmosphere fade without a second overlay system", () => {
    expect(ATM_SRC).toContain('data-people-mine-atmosphere-edge-fade="light"');
    expect(ATM_SRC).toContain('data-people-mine-atmosphere-edge-fade="dark"');
    expect(ATM_SRC).toContain("app-light:block");
    expect(ATM_SRC).toContain("34%");
    expect(ATM_SRC).not.toContain("MineCaptionScrim");
    expect(ATM_SRC).not.toContain("rounded-xl");
  });

  it("uses full-opacity caption ink in light mode only", () => {
    expect(SLIDE_SRC).toContain("text-[var(--text)]/82");
    expect(SLIDE_SRC).toContain("app-light:text-[var(--text)]");
  });

  it("Mine date pills use accessible light bases with dark rail fallbacks", () => {
    expect(SLIDE_SRC).toContain("DATE_KIND_CLASSES");
    expect(SLIDE_SRC).toContain("bg-green-100 text-green-900");
    expect(SLIDE_SRC).toContain("bg-sky-100 text-sky-950");
    expect(SLIDE_SRC).toContain("bg-violet-100 text-violet-950");
    expect(SLIDE_SRC).toContain("bg-white/92");
    expect(SLIDE_SRC).toContain("app-dark:bg-green-500/20");
    expect(SLIDE_SRC).not.toContain('getPostScheduleLabelClasses(kind, "rail")');
    expect(DUO_SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
  });

  it("Connect keeps yellow circular face with restrained spacing tweak", () => {
    expect(DOCK_SRC).toContain("peopleShellActionFaceClass");
    expect(DOCK_SRC).toContain("gap-[3px]");
    expect(DOCK_SRC).toContain("size={18}");
    expect(DOCK_SRC).toContain("PEOPLE_ACTION_CIRCLE_PX");
  });

  it("nav outlines / flat destinations selected state", () => {
    expect(NAV_SRC).toContain("bg-[var(--glass-bg)]");
    expect(NAV_SRC).toContain("bottom-tab-pill-ring");
    expect(NAV_SRC).toContain("opacity-40");
    expect(NAV_SRC).toContain("PEOPLE_FLAT_DESTINATION_ORDER");
    expect(NAV_SRC).toContain("bottom-tab-feed-notif-active-bg");
    expect(NAV_SRC).not.toContain("PeoplePrimaryShelf");
  });
});
