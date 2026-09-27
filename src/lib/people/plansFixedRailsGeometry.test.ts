import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO,
  PEOPLE_MINE_EDGE_FIXED_CARD_W_PX,
  PEOPLE_MINE_EDGE_FIXED_GAP_PX,
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
  PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_TOP_GAP_PX,
  PEOPLE_PLANS_BIO_2LINE_H_PX,
  PEOPLE_PLANS_CHROME_H_PX,
  PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX,
  computePeopleDiscoverCardMetrics,
  peopleMineEdgeCardHPx,
  peopleMineTargetFrameW,
  peoplePlansTargetFrameW,
} from "./peopleCandidateMediaPresentation";

const BODY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/OpenPlanDeckBody.tsx"),
  "utf8"
);
const SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const NOTE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const MINE_SLIDE_SRC = readFileSync(
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

describe("Plans structural geometry (fixed rails)", () => {
  it("Plans width ignores hostH (no tallFactor) and matches fixed side alloc", () => {
    expect(PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX).toBe(
      PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX
    );
    expect(PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX).toBe(
      PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX + PEOPLE_MINE_EDGE_FIXED_GAP_PX
    );
    expect(peoplePlansTargetFrameW(390, 520)).toBe(
      peoplePlansTargetFrameW(390, 956)
    );
    expect(peoplePlansTargetFrameW(390, 844)).toBe(
      peopleMineTargetFrameW(390, 844)
    );
    for (const hostW of [320, 360, 390, 412, 440]) {
      const frameW = peoplePlansTargetFrameW(hostW, 844);
      const m = computePeopleDiscoverCardMetrics({
        hostW,
        hostH: 844,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: false,
        fullWidthSlide: true,
        chromeProfile: "plans",
      });
      expect(m.portraitW).toBeCloseTo(
        hostW - 2 * PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX,
        1
      );
      expect(m.frameW).toBe(frameW);
    }
  });

  it("Mine width outputs unchanged vs Plans sharing the same side alloc family", () => {
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
    const chrome =
      mine.contentH - (mine.frameH + mine.stackPadYTop + mine.stackPadY);
    expect(chrome).toBeCloseTo(
      PEOPLE_MINE_SOURCE_CHROME_H_PX +
        PEOPLE_MINE_TOP_GAP_PX +
        PEOPLE_MINE_NOTE_RESERVE_H_PX,
      5
    );
  });

  it("Plans edge cards use fixed/adaptive geometry (not legacy 46vh)", () => {
    expect(BODY_SRC).toContain("fixedRailsGeometry");
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_W_PX).toBe(60);
    expect(PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX).toBe(40);
    expect(PEOPLE_MINE_EDGE_FIXED_GAP_PX).toBe(14);
    expect(peopleMineEdgeCardHPx(400)).toBe(
      Math.round(400 * PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO)
    );
    expect(peopleMineEdgeCardHPx(200)).toBe(PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX);
    expect(peopleMineEdgeCardHPx(900)).toBe(PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX);
    // Side alloc keeps cards outside portrait.
    expect(
      PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX + PEOPLE_MINE_EDGE_FIXED_GAP_PX
    ).toBe(PEOPLE_PLANS_EDGE_FIXED_SIDE_ALLOC_PX);
  });

  it("Plans live path uses Mine chrome; legacy Plans bio chrome constants unused by slide", () => {
    expect(PEOPLE_PLANS_CHROME_H_PX).toBeGreaterThan(214);
    expect(PEOPLE_PLANS_BIO_2LINE_H_PX).toBe(Math.ceil(12.5 * 1.375 * 2));
    expect(SLIDE_SRC).not.toContain("PEOPLE_PLANS_BIO_2LINE_H_PX");
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(BODY_SRC).toContain('duoPresentation="mine"');
  });

  it("Plans uses canonical floating note; Mine floating note path shared", () => {
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(SLIDE_SRC).toContain("identityVisible={false}");
    expect(NOTE_SRC).toContain('expansionMode = "inline"');
    expect(NOTE_SRC).toContain('expansionMode?: PeopleExpandableNoteExpansionMode');
    expect(MINE_SLIDE_SRC).toContain("MineOpportunityNote");
    expect(MINE_SLIDE_SRC).toContain("anonymousIdentity");
    expect(DUO_SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
  });

  it("Plans Request CTA wiring unchanged", () => {
    expect(BODY_SRC).toContain("requestOpenPlan");
    expect(BODY_SRC).toContain("withdrawOpenPlanRequest");
    expect(BODY_SRC).toContain("openPlansImDown");
    expect(BODY_SRC).toContain("openPlansWithdraw");
  });

  it("tall Plans host splits surplus ~50/50 around content block", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: false,
      fullWidthSlide: true,
      chromeProfile: "plans",
    });
    const surplus = Math.max(0, Math.round(844 - m.contentH));
    expect(m.padTop).toBe(Math.floor(surplus / 2));
    expect(m.padBottom).toBe(surplus - m.padTop);
    expect(m.padTop).toBeGreaterThan(0);
    expect(m.unusedHostH).toBeLessThanOrEqual(0.5);
    expect(m.contentH + m.padTop + m.padBottom + m.unusedHostH).toBeCloseTo(
      844,
      0
    );
  });
});
