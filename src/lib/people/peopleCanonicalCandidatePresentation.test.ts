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
  it("Mine and Discover render PeopleCanonicalCandidatePresentation", () => {
    expect(DUO_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(DUO_SRC).not.toContain("data-people-duo-identity");
    expect(DUO_SRC).not.toContain("data-people-duo-note");
    expect(DUO_SRC).not.toContain('peekDirection="down"');
    expect(CANONICAL_SRC).toContain('data-people-canonical-candidate="true"');
    expect(OVERLAY_SRC).toContain("PeopleDuoCandidateSlide");
    expect(OVERLAY_SRC).toContain('duoPresentation="mine"');
    expect(OVERLAY_SRC).toContain('presentation="mine"');
    expect(OVERLAY_SRC).toContain("isCanonicalPairUpScope");
  });

  it("Mine and Discover produce identical geometry at the same host", () => {
    expect(PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX).toBe(54);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MIN).toBe(0.75);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MAX).toBe(0.85);
    // Overlay drives Discover through duoPresentation="mine" → chromeProfile mine.
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

  it("Discover uses Mine shell, edges, atmosphere, compact Connect", () => {
    expect(OVERLAY_SRC).toContain("isCanonicalPairUpScope");
    expect(OVERLAY_SRC).toContain("isCanonicalPeopleScope");
    expect(OVERLAY_SRC).toMatch(
      /isCanonicalPeopleScope[\s\S]{0,80}MineAtmosphereCrossfade/
    );
    expect(OVERLAY_SRC).toMatch(
      /isCanonicalPairUpScope[\s\S]{0,120}MineEdgeNavCards/
    );
    expect(OVERLAY_SRC).toContain("fixedRailsGeometry");
    expect(OVERLAY_SRC).toContain(
      "const mineCompactConnect = isCanonicalPeopleScope"
    );
    expect(OVERLAY_SRC).toContain(
      "isCanonicalPairUpScope && isPeopleMineRealIncomingEnabled()"
    );
    expect(OVERLAY_SRC).toContain("peopleShellMineContentTopPad()");
    expect(OVERLAY_SRC).toContain("peopleShellMineContentBottomPad()");
    expect(OVERLAY_SRC).not.toContain("flex-[0.02]");
    expect(OVERLAY_SRC).not.toContain(
      "mineMotionSurfaceEnabled && visualScope === \"my_plans\""
    );
    expect(PEOPLE_MINE_CONNECT_H_PX).toBe(46);
    expect(PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX).toBe(22);
    expect(PEOPLE_ACTION_CIRCLE_PX).toBe(72);
    expect(DOCK_SRC).toContain("mineCompactConnect");
    expect(DOCK_SRC).toContain("PEOPLE_MINE_CONNECT_H_PX");
  });

  it("Discover identity/note/atmosphere use canonical pieces", () => {
    expect(CANONICAL_SRC).toContain("MinePortraitIdentityOverlay");
    expect(CANONICAL_SRC).toContain("MineOpportunityNote");
    expect(CANONICAL_SRC).toContain('data-people-duo-source-surface="mine-top-right"');
    expect(CANONICAL_SRC).toContain('peekDirection="up"');
    expect(OVERLAY_SRC).toContain("handleMineAtmosphereChange");
    expect(OVERLAY_SRC).toContain("onMineAtmosphereChange=");
    expect(OVERLAY_SRC).toContain("handleMineAtmosphereChange");
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
    expect(OPEN_PLANS_BODY).toContain("PeopleOpenPlanCandidateSlide");
    expect(OPEN_PLANS_BODY).toContain('duoPresentation="mine"');
    expect(OPEN_PLANS_BODY).toContain("requestOpenPlan");
    expect(PLANS_SLIDE).toContain("PeopleCanonicalCandidatePresentation");
    expect(PLANS_SLIDE).toContain("identityVisible={false}");
  });

  it("Groups unchanged", () => {
    expect(OVERLAY_SRC).toContain("GroupUpDeckBody");
    expect(GROUPS_BODY).not.toContain("PeopleCanonicalCandidatePresentation");
  });
});
