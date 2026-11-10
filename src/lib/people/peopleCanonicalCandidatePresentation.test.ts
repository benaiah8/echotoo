import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
  PEOPLE_MINE_MEDIA_ASPECT_MAX,
  PEOPLE_MINE_MEDIA_ASPECT_MIN,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  computePeopleDiscoverCardMetrics,
  peopleMineTargetFrameW,
} from "./peopleCandidateMediaPresentation";
import {
  PEOPLE_ACTION_CIRCLE_PX,
  PEOPLE_MINE_CONNECT_H_PX,
  PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX,
} from "../../pages/people/peopleShellLayout";

const CANONICAL_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const DUO_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);
const OVERLAY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
  "utf8"
);
const OPEN_PLANS_BODY = readFileSync(
  resolve(__dirname, "../../pages/people/OpenPlanDeckBody.tsx"),
  "utf8"
);
const PLANS_SLIDE = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const GROUPS_BODY = readFileSync(
  resolve(__dirname, "../../pages/people/GroupUpDeckBody.tsx"),
  "utf8"
);
const DOCK_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
  "utf8"
);

function mineMetrics(hostW: number, hostH: number) {
  return computePeopleDiscoverCardMetrics({
    hostW,
    hostH,
    reserveInFlowChrome: true,
    distributeVerticalSurplus: true,
    upwardPeekPad: true,
    fullWidthSlide: true,
    chromeProfile: "mine",
  });
}

describe("PeopleCanonicalCandidatePresentation — Mine + Discover", () => {
  it("Duo uses canonical presentation; Plans still use canonical", () => {
    expect(DUO_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(DUO_SRC).not.toContain("PeopleDuoImmersivePresentation");
    expect(CANONICAL_SRC).toContain('data-people-canonical-candidate="true"');
    expect(OVERLAY_SRC).toContain("PeopleDiscoverPersonRow");
    expect(OVERLAY_SRC).toContain("PeopleFeedList");
    expect(OVERLAY_SRC).toContain("PeopleDuoCandidateSlide");
    expect(OVERLAY_SRC).toContain("isCanonicalPairUpScope");
    expect(PLANS_SLIDE).toContain("PeopleCanonicalCandidatePresentation");
  });

  it("Mine and Discover produce identical geometry at the same host", () => {
    expect(PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX).toBe(54);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MIN).toBe(0.75);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MAX).toBe(0.85);
    // Duo Embla still uses duoPresentation="mine" → chromeProfile mine.
    expect(OVERLAY_SRC).toContain('duoPresentation="mine"');
    for (const [hostW, hostH] of [
      [360, 640],
      [390, 844],
      [412, 915],
      [440, 956],
    ] as const) {
      const a = mineMetrics(hostW, hostH);
      const b = mineMetrics(hostW, hostH);
      expect(a.frameW).toBe(b.frameW);
      expect(a.portraitW).toBe(b.portraitW);
      expect(a.portraitH).toBe(b.portraitH);
      expect(a.aspect).toBe(b.aspect);
      expect(a.padTop).toBe(b.padTop);
      expect(a.padBottom).toBe(b.padBottom);
      expect(a.frameW).toBe(peopleMineTargetFrameW(hostW, hostH));
      expect(a.portraitW).toBeCloseTo(hostW - 2 * 54, 1);
      expect(a.aspect).toBeGreaterThanOrEqual(0.75 - 0.001);
      expect(a.aspect).toBeLessThanOrEqual(0.85 + 0.001);
    }
  });

  it("Discover uses feed shell; Duo atmosphere gated to my_plans", () => {
    expect(OVERLAY_SRC).toContain("isCanonicalPairUpScope");
    expect(OVERLAY_SRC).toContain("isCanonicalPeopleScope");
    expect(OVERLAY_SRC).toContain("<MineAtmosphereCrossfade");
    expect(OVERLAY_SRC).toContain("isDuoAtmosphereScope");
    expect(OVERLAY_SRC).toContain("bg-transparent");
    expect(OVERLAY_SRC).toContain("PeopleFeedList");
    expect(OVERLAY_SRC).toContain("PeopleFeedTopNav");
    expect(OVERLAY_SRC).toContain("topChromePad={peopleFeedContentTopPad()}");
    expect(OVERLAY_SRC).toContain("paddingBottom: 0");
    expect(
      readFileSync(
        resolve(__dirname, "../../components/people/PeopleFeedList.tsx"),
        "utf8"
      )
    ).toContain("peopleFeedContentBottomPad()");
    expect(OVERLAY_SRC).toContain("paddingTop: 0");
    expect(OVERLAY_SRC).toContain("handleFeedHeart");
    expect(OVERLAY_SRC).not.toContain("flex-[0.02]");
    expect(PEOPLE_MINE_CONNECT_H_PX).toBe(46);
    expect(PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX).toBe(22);
    expect(PEOPLE_ACTION_CIRCLE_PX).toBe(72);
    expect(DOCK_SRC).toContain("mineCompactConnect");
    expect(DOCK_SRC).toContain("PEOPLE_MINE_CONNECT_H_PX");
  });

  it("Discover identity/note use person-row + opportunity-box pieces", () => {
    expect(CANONICAL_SRC).toContain("MinePortraitIdentityOverlay");
    expect(CANONICAL_SRC).toContain("MineOpportunityNote");
    expect(CANONICAL_SRC).toContain('data-people-duo-source-surface="mine-top-right"');
    expect(CANONICAL_SRC).toContain('peekDirection="up"');
    expect(OVERLAY_SRC).toContain("handleMineAtmosphereChange");
    expect(OVERLAY_SRC).toContain("PeopleDiscoverPersonRow");
    expect(OVERLAY_SRC).toContain("PeopleDiscoverOpportunityBox");
  });

  it("Discover Connect mutation path unchanged", () => {
    expect(OVERLAY_SRC).toContain("runMinePairUpConnect");
    expect(OVERLAY_SRC).toContain("runPairUpConnectForTarget");
    expect(OVERLAY_SRC).toContain("handleConnect");
    expect(OVERLAY_SRC).toContain('scope !== "my_plans" && scope !== "discover"');
    expect(OVERLAY_SRC).toContain("pairUpPrimaryAction");
  });

  it("Mine geometry constants unchanged", () => {
    expect(PEOPLE_MINE_NOTE_RESERVE_H_PX).toBeGreaterThanOrEqual(70);
    const m = mineMetrics(390, 844);
    expect(m.frameW).toBe(peopleMineTargetFrameW(390, 844));
  });

  it("Plans still uses OpenPlanDeckBody + PeopleOpenPlanCandidateSlide", () => {
    expect(OPEN_PLANS_BODY).toContain("PeopleOpenPlanFeedCard");
    expect(OPEN_PLANS_BODY).not.toContain("PeopleFeedRow");
    expect(OPEN_PLANS_BODY).toContain("requestOpenPlan");
    expect(PLANS_SLIDE).toContain("PeopleCanonicalCandidatePresentation");
    expect(PLANS_SLIDE).toContain("identityVisible={false}");
  });

  it("Groups unchanged", () => {
    expect(OVERLAY_SRC).toContain("GroupUpDeckBody");
    expect(GROUPS_BODY).not.toContain("PeopleCanonicalCandidatePresentation");
  });
});
