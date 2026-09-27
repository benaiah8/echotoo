import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_PLANS_CHROME_H_PX,
  computePeopleDiscoverCardMetrics,
  peopleMineDistributeHostSurplus,
  peoplePlansDistributeContentBlockSurplus,
  peoplePlansTargetFrameW,
} from "./peopleCandidateMediaPresentation";

const SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const NOTE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const EDGE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MineEdgeNavCards.tsx"),
  "utf8"
);
const CAROUSEL_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckCarousel.tsx"),
  "utf8"
);
const DOCK_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
  "utf8"
);
const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/peopleShellLayout.ts"),
  "utf8"
);

function plansMetrics(hostW: number, hostH: number) {
  return computePeopleDiscoverCardMetrics({
    hostW,
    hostH,
    reserveInFlowChrome: true,
    distributeVerticalSurplus: true,
    upwardPeekPad: false,
    fullWidthSlide: true,
    chromeProfile: "plans",
  });
}

describe("Plans content-block vertical surplus", () => {
  it("splits collapsed surplus ~50/50 with odd pixel on bottom", () => {
    expect(peoplePlansDistributeContentBlockSurplus(0)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peoplePlansDistributeContentBlockSurplus(-10)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peoplePlansDistributeContentBlockSurplus(248)).toEqual({
      padTop: 124,
      padBottom: 124,
    });
    expect(peoplePlansDistributeContentBlockSurplus(249)).toEqual({
      padTop: 124,
      padBottom: 125,
    });
    // Same deterministic floor split as Mine helper; different semantic target.
    expect(peoplePlansDistributeContentBlockSurplus(247)).toEqual(
      peopleMineDistributeHostSurplus(247)
    );
  });

  it("tall hosts get nonzero top + bottom; unusedHostH ≈ 0", () => {
    for (const [hostW, hostH] of [
      [390, 844],
      [412, 915],
      [440, 956],
    ] as const) {
      const m = plansMetrics(hostW, hostH);
      const surplus = Math.max(0, Math.round(hostH - m.contentH));
      expect(surplus).toBeGreaterThan(0);
      expect(m.padTop).toBe(Math.floor(surplus / 2));
      expect(m.padBottom).toBe(surplus - m.padTop);
      expect(m.padTop).toBeGreaterThan(0);
      expect(m.padBottom).toBeGreaterThan(0);
      expect(m.unusedHostH).toBeLessThanOrEqual(0.5);
      expect(m.contentH + m.padTop + m.padBottom + m.unusedHostH).toBeCloseTo(
        hostH,
        0
      );
    }
  });

  it("short hosts get 0/0 surplus pads", () => {
    const m = plansMetrics(360, 520);
    expect(m.padTop).toBe(0);
    expect(m.padBottom).toBe(0);
    // Stress may shrink portrait; no artificial centering pads.
    expect(m.contentH).toBeLessThanOrEqual(520 + 0.5);
  });

  it("portrait width/frame unchanged by surplus distribution", () => {
    const withSurplus = plansMetrics(390, 844);
    const noFlag = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: false,
      upwardPeekPad: false,
      fullWidthSlide: true,
      chromeProfile: "plans",
    });
    expect(withSurplus.frameW).toBe(noFlag.frameW);
    expect(withSurplus.portraitW).toBe(noFlag.portraitW);
    expect(withSurplus.portraitH).toBe(noFlag.portraitH);
    expect(withSurplus.frameW).toBe(peoplePlansTargetFrameW(390, 844));
    // Chrome reserve still the derived 231 block.
    const chrome =
      withSurplus.contentH -
      (withSurplus.frameH + withSurplus.stackPadYTop + withSurplus.stackPadY);
    expect(chrome).toBeCloseTo(PEOPLE_PLANS_CHROME_H_PX, 5);
  });

  it("extraTop surplus CSS vars remain for Mine/canonical full-width slides", () => {
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(SLIDE_SRC).not.toContain("data-people-plans-surplus-pad-top");
    expect(CAROUSEL_SRC).toContain("--people-mine-surplus-pad-top");
    expect(CAROUSEL_SRC).toContain("--people-mine-surplus-pad-bottom");
    expect(CAROUSEL_SRC).toContain("discoverMetrics.padBottom");
    expect(CAROUSEL_SRC).toContain("paddingBottom: isFullWidthPresentation");
  });

  it("Plans live note is floating via canonical; inline maxHeight path remains for other modes", () => {
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(NOTE_SRC).toContain('expansionMode = "inline"');
    expect(NOTE_SRC).toMatch(
      /maxHeight: inlineExpanded[\s\S]*people-mine-surplus-pad-bottom[\s\S]*people-mine-unused-host/
    );
  });

  it("edge cards observe Mine portrait; Plans adapter no longer owns plans-portrait", () => {
    expect(EDGE_SRC).toContain("--mine-edge-center-y");
    expect(EDGE_SRC).toContain("data-people-mine-card");
    expect(SLIDE_SRC).not.toContain("data-people-plans-portrait");
  });

  it("Plans uses compact Connect; carousel host uses Mine bottom pad via shell", () => {
    expect(SHELL_SRC).toContain("PEOPLE_ACTION_CIRCLE_PX = 72");
    expect(SHELL_SRC).toContain("peopleShellMineContentBottomPad");
    expect(DOCK_SRC).toContain("mineCompactConnect");
    expect(DOCK_SRC).toContain("PEOPLE_MINE_CONNECT_H_PX");
  });

  it("Mine surplus path outputs unchanged", () => {
    const mine = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    const surplus = Math.max(0, Math.round(844 - mine.contentH));
    const expected = peopleMineDistributeHostSurplus(surplus);
    expect(mine.padTop).toBe(expected.padTop);
    expect(mine.padBottom).toBe(expected.padBottom);
    expect(mine.unusedHostH).toBeLessThanOrEqual(0.5);
  });

  it("Discover does not gain Plans content-block centering", () => {
    const d = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: false,
      fullWidthSlide: false,
      chromeProfile: "discover",
    });
    // Discover legacy distributeMineSurplus caps remain 0.
    expect(d.padTop).toBe(0);
    expect(d.padBottom).toBe(0);
  });
});
