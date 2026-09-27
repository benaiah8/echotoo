import {
  PEOPLE_ACTION_CIRCLE_PX,
  PEOPLE_MINE_ACTION_TO_NAV_GAP_PX,
  PEOPLE_MINE_CONNECT_H_PX,
  PEOPLE_MINE_CONNECT_PILL_H_PX,
  PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX,
  PEOPLE_NAV_CHROME_H_PX,
  PEOPLE_SHELL_VISUAL_LIFT_PX,
  peopleShellContentBottomPad,
  peopleShellMineContentBottomPad,
} from "../../pages/people/peopleShellLayout";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_CANDIDATE_MEDIA_ASPECT,
  PEOPLE_DISCOVER_STACK_PAD_X,
  PEOPLE_MINE_BELOW_CAROUSEL_GAP_PX,
  PEOPLE_MINE_BOTTOM_GAP_PX,
  PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_PX,
  PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO,
  PEOPLE_MINE_EDGE_FIXED_CARD_W_PX,
  PEOPLE_MINE_EDGE_FIXED_GAP_PX,
  PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX,
  PEOPLE_MINE_EDGE_FIXED_RADIUS_PX,
  PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX,
  PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX,
  PEOPLE_MINE_MAX_SLIDE_W,
  PEOPLE_MINE_MEDIA_ASPECT_MAX,
  PEOPLE_MINE_MEDIA_ASPECT_MIN,
  PEOPLE_MINE_MEDIA_ASPECT_STRESS,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_TOP_GAP_PX,
  computePeopleDiscoverCardMetrics,
  peopleMineDistributeHostSurplus,
  peopleMineEdgeCardHPx,
  peopleMineEdgeFixedActualGapPx,
  peopleMineEdgeFixedCssVisiblePx,
  peopleMineTallFactor,
  peopleMineTargetFrameW,
  peoplePlansTargetFrameW,
} from "./peopleCandidateMediaPresentation";
import { describe, expect, it } from "vitest";

describe("Mine fixed side rails (horizontal)", () => {
  it("uses narrower card face with ~54px side allocation", () => {
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_W_PX).toBe(60);
    expect(PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX).toBe(40);
    expect(PEOPLE_MINE_EDGE_FIXED_GAP_PX).toBe(14);
    expect(PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX).toBe(54);
    expect(PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX).toBe(48);
    expect(PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX).toBeGreaterThanOrEqual(48);
    expect(PEOPLE_MINE_EDGE_FIXED_RADIUS_PX).toBe(12);
    expect(PEOPLE_MINE_EDGE_FIXED_RADIUS_PX).toBeLessThan(
      PEOPLE_MINE_EDGE_FIXED_CARD_W_PX / 2
    );
    expect(PEOPLE_MINE_EDGE_CARD_REST_ROTATE_DEG).toBe(5);
  });

  it("adaptive edge height tracks portrait and stays clamped", () => {
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_H_RATIO).toBe(0.58);
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX).toBe(210);
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX).toBe(280);
    expect(PEOPLE_MINE_EDGE_FIXED_CARD_H_PX).toBe(
      PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX
    );
    expect(peopleMineEdgeCardHPx(300)).toBe(210);
    expect(peopleMineEdgeCardHPx(400)).toBe(Math.round(400 * 0.58));
    expect(peopleMineEdgeCardHPx(600)).toBe(280);
    expect(peopleMineEdgeCardHPx(600)).toBeLessThan(600);
  });

  it("CSS visible is rotation-compensated so actual AABB gap ≈ 14", () => {
    for (const portraitH of [360, 520, 700]) {
      const cardH = peopleMineEdgeCardHPx(portraitH);
      const cssVisible = peopleMineEdgeFixedCssVisiblePx(cardH);
      const actualGap = peopleMineEdgeFixedActualGapPx(cardH);
      expect(cssVisible).toBeGreaterThan(20);
      expect(cssVisible).toBeLessThanOrEqual(PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX);
      expect(actualGap).toBeCloseTo(PEOPLE_MINE_EDGE_FIXED_GAP_PX, 0);
      // Hit budget stays within sideAlloc (no portrait overlap).
      expect(PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX).toBeLessThanOrEqual(
        PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX
      );
    }
  });

  it("portrait fills host minus 2×sideAlloc (clamped to max)", () => {
    const hostW = 390;
    const frameW = peopleMineTargetFrameW(hostW, 844);
    const portraitOuter = frameW + 2 * PEOPLE_DISCOVER_STACK_PAD_X;
    expect(portraitOuter).toBe(hostW - 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX);
    expect(peopleMineTargetFrameW(hostW, 500)).toBe(frameW);
    expect(peopleMineTargetFrameW(hostW, 1000)).toBe(frameW);
    expect(peopleMineTallFactor(hostW, 500)).toBe(0);
    expect(peopleMineTallFactor(hostW, 1000)).toBeGreaterThan(0.5);
  });

  it("grows with wider hosts until max slide width", () => {
    const narrow = peopleMineTargetFrameW(360, 800);
    const mid = peopleMineTargetFrameW(412, 915);
    const wideHost =
      PEOPLE_MINE_MAX_SLIDE_W + 2 * PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX;
    const wide = peopleMineTargetFrameW(wideHost, 900);
    expect(mid).toBeGreaterThan(narrow);
    const wideOuter = wide + 2 * PEOPLE_DISCOVER_STACK_PAD_X;
    expect(wideOuter).toBe(PEOPLE_MINE_MAX_SLIDE_W);
  });

  it("does not overlap fixed side rails (gutter ≥ sideAlloc)", () => {
    for (const hostW of [360, 390, 412, 430]) {
      const frameW = peopleMineTargetFrameW(hostW, 800);
      const portraitOuter = frameW + 2 * PEOPLE_DISCOVER_STACK_PAD_X;
      const gutter = (hostW - portraitOuter) / 2;
      expect(gutter).toBeGreaterThanOrEqual(
        PEOPLE_MINE_EDGE_FIXED_SIDE_ALLOC_PX - 0.1
      );
      expect(PEOPLE_MINE_EDGE_FIXED_VISUAL_W_PX).toBeLessThanOrEqual(gutter);
      expect(PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX).toBeLessThanOrEqual(
        gutter + 0.1
      );
    }
  });

  it("keeps Plans on fixed-rail width (no tallFactor growth)", () => {
    expect(peopleMineTargetFrameW(390, 560)).toBe(
      peopleMineTargetFrameW(390, 844)
    );
    const shortPlans = peoplePlansTargetFrameW(390, 560);
    const tallPlans = peoplePlansTargetFrameW(390, 844);
    expect(tallPlans).toBe(shortPlans);
    expect(tallPlans).toBe(peopleMineTargetFrameW(390, 844));
    expect(peopleMineTallFactor(390, 844)).toBeGreaterThan(0.5);
  });
});

describe("Mine vertical gaps + unusedHostH", () => {
  it("exposes one note→Connect gap token (22px)", () => {
    expect(PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX).toBe(22);
    expect(PEOPLE_MINE_TOP_GAP_PX).toBe(28);
    // Deprecated aliases keep the same numeric value for old imports.
    expect(PEOPLE_MINE_BOTTOM_GAP_PX).toBe(PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX);
    expect(PEOPLE_MINE_BELOW_CAROUSEL_GAP_PX).toBe(
      PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX
    );
  });

  it("source chrome excludes Back-align; topGap is separate", () => {
    expect(PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX).toBe(48);
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeLessThan(120);
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBeGreaterThan(80);
  });

  it("tall host clamps portrait at 3:4 — leftover surplus split ~50/50", () => {
    const hostH = 844;
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    expect(m.aspect).toBeGreaterThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_MIN - 0.001);
    expect(m.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_MAX + 0.001);
    expect(m.aspect).toBeCloseTo(PEOPLE_MINE_MEDIA_ASPECT_MIN, 2);
    expect(m.portraitH).toBeGreaterThan(300);
    const chrome =
      PEOPLE_MINE_SOURCE_CHROME_H_PX +
      PEOPLE_MINE_TOP_GAP_PX +
      PEOPLE_MINE_NOTE_RESERVE_H_PX;
    expect(m.contentH).toBeCloseTo(m.portraitH + chrome, 0);
    const surplus = Math.max(0, Math.round(hostH - m.contentH));
    const expected = peopleMineDistributeHostSurplus(surplus);
    expect(m.padTop).toBe(expected.padTop);
    expect(m.padBottom).toBe(expected.padBottom);
    expect(m.padTop).toBe(Math.floor(surplus / 2));
    expect(m.padBottom).toBe(surplus - m.padTop);
    expect(m.unusedHostH).toBeLessThanOrEqual(0.5);
    expect(m.padTop + m.padBottom).toBeGreaterThan(0);
    // Minimum gaps stay in chrome / shell — not consumed by surplus.
    expect(PEOPLE_MINE_TOP_GAP_PX).toBe(28);
    expect(PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX).toBe(22);
  });

  it("peopleMineDistributeHostSurplus is 50/50; short hosts get 0", () => {
    expect(peopleMineDistributeHostSurplus(0)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleMineDistributeHostSurplus(-4)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleMineDistributeHostSurplus(11)).toEqual({
      padTop: 5,
      padBottom: 6,
    });
    expect(peopleMineDistributeHostSurplus(100)).toEqual({
      padTop: 50,
      padBottom: 50,
    });
  });

  it("short host: no artificial surplus pads", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 520,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    // Compact: content fills host (or nearly) — no forced centering pads.
    expect(m.padTop).toBe(0);
    expect(m.padBottom).toBe(0);
    expect(m.unusedHostH).toBe(0);
  });

  it("slide places extraTop surplus after min TOP_GAP reserve", () => {
    const slide = readFileSync(
      resolve(
        __dirname,
        "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
      ),
      "utf8"
    );
    const reserveIdx = slide.indexOf("data-people-duo-source-reserve");
    const surplusIdx = slide.indexOf("data-people-mine-surplus-pad-top");
    expect(reserveIdx).toBeGreaterThan(0);
    expect(surplusIdx).toBeGreaterThan(reserveIdx);
    expect(slide).toContain("paddingBottom: PEOPLE_MINE_TOP_GAP_PX");
  });

  it("carousel applies extraBottom as slide paddingBottom", () => {
    const carousel = readFileSync(
      resolve(__dirname, "../../pages/people/MatchDeckCarousel.tsx"),
      "utf8"
    );
    expect(carousel).toContain("--people-mine-surplus-pad-bottom");
    expect(carousel).toContain("discoverMetrics.padBottom");
    expect(carousel).toContain("paddingBottom: isFullWidthPresentation");
  });

  it("Mine portrait aspect stays within [0.75, 0.85] across hosts", () => {
    expect(PEOPLE_MINE_MEDIA_ASPECT_MIN).toBe(PEOPLE_CANDIDATE_MEDIA_ASPECT);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MAX).toBe(PEOPLE_MINE_MEDIA_ASPECT_STRESS);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MIN).toBe(0.75);
    expect(PEOPLE_MINE_MEDIA_ASPECT_MAX).toBe(0.85);
    for (const vp of [
      { hostW: 320, hostH: 568 },
      { hostW: 360, hostH: 640 },
      { hostW: 390, hostH: 700 },
      { hostW: 390, hostH: 844 },
      { hostW: 412, hostH: 915 },
      { hostW: 430, hostH: 520 },
    ]) {
      const m = computePeopleDiscoverCardMetrics({
        ...vp,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: true,
        fullWidthSlide: true,
        chromeProfile: "mine",
      });
      expect(m.aspect).toBeGreaterThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_MIN - 0.001);
      expect(m.aspect).toBeLessThanOrEqual(PEOPLE_MINE_MEDIA_ASPECT_MAX + 0.001);
      // Width formula unchanged.
      const targetW = peopleMineTargetFrameW(vp.hostW, vp.hostH);
      expect(m.frameW).toBeLessThanOrEqual(targetW + 0.5);
      // Edge height tracks bounded portrait.
      const edgeH = peopleMineEdgeCardHPx(m.portraitH);
      expect(edgeH).toBeGreaterThanOrEqual(PEOPLE_MINE_EDGE_FIXED_CARD_H_MIN_PX);
      expect(edgeH).toBeLessThanOrEqual(PEOPLE_MINE_EDGE_FIXED_CARD_H_MAX_PX);
    }
  });

  it("no duplicate Mine bottom spacer — gap owned by shell reservation", () => {
    const overlay = readFileSync(
      resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    expect(overlay).toContain("peopleShellMineContentBottomPad()");
    expect(overlay).not.toContain("data-people-mine-deck-column");
    expect(overlay).not.toContain("data-people-mine-below-spacer");
    expect(overlay).not.toContain("data-people-mine-note-to-connect-gap");
    expect(overlay).not.toContain("paddingBottom: PEOPLE_MINE_BOTTOM_GAP_PX");
    expect(overlay).not.toContain("BELOW SPACER");
    expect(overlay).not.toContain("MinePaintLayer");
    expect(overlay).not.toContain("mineLayoutPaint");
    expect(overlay).not.toMatch(/my_plans[\s\S]{0,80}flex-\[0\.04\]/);
    const slide = readFileSync(
      resolve(
        __dirname,
        "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
      ),
      "utf8"
    );
    expect(slide).toContain("PEOPLE_MINE_TOP_GAP_PX");
    expect(slide).toContain("paddingBottom: PEOPLE_MINE_TOP_GAP_PX");
    expect(slide).not.toMatch(/style=\{\{ height: PEOPLE_MINE_TOP_GAP_PX \}\}/);
    expect(slide).not.toContain("MinePaintLayer");
    expect(slide).not.toContain("data-mine-debug-paint");
  });

  it("Connect reservation derives from Connect height + single note gap", () => {
    expect(PEOPLE_MINE_CONNECT_H_PX).toBe(46);
    expect(PEOPLE_MINE_CONNECT_PILL_H_PX).toBe(PEOPLE_MINE_CONNECT_H_PX);
    expect(PEOPLE_MINE_CONNECT_H_PX).toBeLessThan(PEOPLE_ACTION_CIRCLE_PX);
    const expectedChrome =
      PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX +
      PEOPLE_MINE_CONNECT_H_PX +
      PEOPLE_MINE_ACTION_TO_NAV_GAP_PX +
      PEOPLE_NAV_CHROME_H_PX +
      PEOPLE_SHELL_VISUAL_LIFT_PX;
    expect(expectedChrome).toBe(164);
    const minePad = peopleShellMineContentBottomPad();
    const legacyPad = peopleShellContentBottomPad();
    expect(minePad).toContain(`${expectedChrome}px`);
    expect(minePad).not.toContain("+ 12px");
    expect(legacyPad).toContain("182px");
    const dock = readFileSync(
      resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
      "utf8"
    );
    const shell = readFileSync(
      resolve(__dirname, "../../pages/people/peopleShellLayout.ts"),
      "utf8"
    );
    expect(dock).toContain("PEOPLE_MINE_CONNECT_H_PX");
    expect(shell).toContain("PEOPLE_MINE_CONNECT_H_PX");
    expect(shell).toContain("PEOPLE_MINE_NOTE_TO_CONNECT_GAP_PX");
    expect(shell).toContain("peopleShellMineContentBottomPad");
  });

  it("short host still height-stresses without exceeding target width", () => {
    const hostW = 390;
    const hostH = 560;
    const targetW = peopleMineTargetFrameW(hostW, hostH);
    const m = computePeopleDiscoverCardMetrics({
      hostW,
      hostH,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    expect(m.frameW).toBeLessThanOrEqual(targetW + 0.5);
    expect(m.contentH + m.padTop + m.padBottom).toBeLessThanOrEqual(
      hostH + 1
    );
  });
});
