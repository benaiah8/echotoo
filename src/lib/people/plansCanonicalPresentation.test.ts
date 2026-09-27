import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computePeopleDiscoverCardMetrics,
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
  peopleMineTargetFrameW,
} from "./peopleCandidateMediaPresentation";
import {
  createMineButtonFlightLatch,
  flushMineButtonLatch,
  planMineButtonStep,
  queueMineButtonTarget,
} from "./mineEdgeNavGesture";

const OVERLAY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
  "utf8"
);
const BODY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/OpenPlanDeckBody.tsx"),
  "utf8"
);
const SLIDE_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleOpenPlanCandidateSlide.tsx"
  ),
  "utf8"
);
const CANONICAL_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const DOCK_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
  "utf8"
);
const NOTE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MineOpportunityNote.tsx"),
  "utf8"
);
const EXPAND_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const GROUPS_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/GroupUpDeckBody.tsx"),
  "utf8"
);
const DUO_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);

describe("Plans → canonical People presentation", () => {
  it("Mine, Discover, and Plans use PeopleCanonicalCandidatePresentation", () => {
    expect(DUO_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(BODY_SRC).toContain("PeopleOpenPlanCandidateSlide");
    expect(BODY_SRC).toContain('duoPresentation="mine"');
    expect(BODY_SRC).not.toContain('duoPresentation="plans"');
  });

  it("same host yields same Mine chromeProfile geometry for Plans path", () => {
    const mine = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    expect(mine.frameW).toBe(peopleMineTargetFrameW(390, 844));
    expect(mine.portraitW).toBeCloseTo(
      390 - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
      1
    );
    expect(BODY_SRC).toContain('duoPresentation="mine"');
  });

  it("Plans maps caption/schedule/note into canonical slots; identity stays hidden", () => {
    expect(SLIDE_SRC).toContain("source_caption");
    expect(SLIDE_SRC).toContain("formatOpenPlanSchedule");
    expect(SLIDE_SRC).toContain("candidate.description");
    expect(SLIDE_SRC).toContain("identityVisible={false}");
    expect(SLIDE_SRC).toContain("onOpenProfile={undefined}");
    expect(SLIDE_SRC).toContain("bio={null}");
    expect(SLIDE_SRC).toContain("avatarUrl={null}");
    expect(SLIDE_SRC).not.toContain("data-people-plans-chrome");
    expect(SLIDE_SRC).not.toContain("openPlansPrivacyLine");
    expect(CANONICAL_SRC).toContain("anonymousIdentity={!showIdentity}");
  });

  it("Plans floating note is anonymous-safe", () => {
    expect(NOTE_SRC).toContain("anonymousIdentity");
    expect(EXPAND_SRC).toContain("anonymous?: boolean");
    expect(EXPAND_SRC).toContain(
      "data-people-expandable-note-floating-anonymous"
    );
    expect(SLIDE_SRC).toContain("openPlanRequesterNameHidden");
  });

  it("Plans action uses compact pill; mutations preserved; no disclosure line", () => {
    expect(OVERLAY_SRC).toContain("isCanonicalPeopleScope");
    expect(OVERLAY_SRC).toContain(
      "const mineCompactConnect = isCanonicalPeopleScope"
    );
    expect(BODY_SRC).not.toContain("openPlansPrivacyLine");
    expect(BODY_SRC).not.toContain("disclosure");
    expect(BODY_SRC).toContain("requestOpenPlan");
    expect(BODY_SRC).toContain("withdrawOpenPlanRequest");
    expect(DOCK_SRC).not.toContain("data-people-shell-action-disclosure");
    expect(DOCK_SRC).not.toContain("action?.disclosure");
    expect(DOCK_SRC).toContain("PEOPLE_MINE_CONNECT_H_PX");
  });

  it("Plans uses canonical atmosphere + real-incoming edges/motion", () => {
    expect(BODY_SRC).toContain("onAtmosphereChange");
    expect(BODY_SRC).toContain("createMineMotionProbeController");
    expect(BODY_SRC).toContain("mineMotionProbeRef");
    expect(BODY_SRC).toContain("mineEdgeNavCardsRef");
    expect(BODY_SRC).toContain("onFlightSettled");
    expect(BODY_SRC).toContain("fixedRailsGeometry");
    expect(OVERLAY_SRC).toContain("setPlansAtmosphereIdentityKey");
    expect(OVERLAY_SRC).toMatch(
      /isCanonicalPeopleScope[\s\S]{0,80}MineAtmosphereCrossfade/
    );
  });

  it("Plans edge latch supports second/rapid hops", () => {
    let latch = createMineButtonFlightLatch();
    const first = planMineButtonStep(latch, 1, 0, 4, true);
    expect(first.shouldNavigate).toBe(true);
    latch = queueMineButtonTarget(first.latch, 3, 4);
    const flushed = flushMineButtonLatch(latch, 1, 4);
    expect(flushed.nextStep).toBe(2);
    const second = planMineButtonStep(
      flushed.latch,
      flushed.nextStep!,
      1,
      4,
      true
    );
    expect(second.shouldNavigate).toBe(true);
  });

  it("old below-media Plans stack is gone; Groups untouched", () => {
    expect(SLIDE_SRC).not.toContain("PEOPLE_PLANS_CHROME_H_PX");
    expect(SLIDE_SRC).not.toContain('presentation="discover"');
    expect(SLIDE_SRC).not.toContain("expansionMode");
    expect(GROUPS_SRC).not.toContain("PeopleCanonicalCandidatePresentation");
  });
});
