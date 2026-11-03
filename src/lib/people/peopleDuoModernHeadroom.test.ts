import { describe, expect, it } from "vitest";
import {
  computePeopleDiscoverCardMetrics,
  PEOPLE_CANDIDATE_MEDIA_ASPECT,
  PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO,
  PEOPLE_DUO_MODERN_NAV_TO_STACK_CLEARANCE_PX,
  PEOPLE_DUO_MODERN_STACK_ENVELOPE_PHOTO_COUNT,
  PEOPLE_DUO_MODERN_STACK_PAD_Y_TOP_MIN_PX,
  PEOPLE_DUO_MODERN_STACK_POSE,
  PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
  PEOPLE_MINE_MAX_SLIDE_W,
  PEOPLE_MINE_STACK_POSE,
  peopleDuoModernCardOpacity,
  peopleDuoModernCardTransform,
  peopleDuoModernDistributeHostSurplus,
  peopleDuoModernStackLayerAabb,
  peopleDuoModernStackPadYTopPx,
  peopleDuoModernTargetFrameW,
  peopleMineCardOpacity,
  peopleMineCardTransform,
  peopleMinePortraitCssVars,
  peopleMineStackAssignments,
  peopleMineStackTopHeadroomUnit,
} from "./peopleCandidateMediaPresentation";
import { peopleDuoModernMetricsHostH } from "./peopleFeedLayout";

describe("peopleDuoModernHeadroom", () => {
  const host = { hostW: 390, hostH: 720 };

  it("uses minimum headroom for zero/one displayable photos", () => {
    expect(peopleDuoModernStackPadYTopPx(400, 0)).toBe(
      PEOPLE_DUO_MODERN_STACK_PAD_Y_TOP_MIN_PX
    );
    expect(peopleDuoModernStackPadYTopPx(400, 1)).toBe(
      PEOPLE_DUO_MODERN_STACK_PAD_Y_TOP_MIN_PX
    );
  });

  it("Duo modern pose is side-peek and isolated from Mine stack pose", () => {
    expect(PEOPLE_MINE_STACK_POSE.left.yPct).toBe(-14);
    expect(PEOPLE_MINE_STACK_POSE.right.yPct).toBe(-7);
    expect(PEOPLE_MINE_CARD_TRANSFORM_ORIGIN).toBe("50% 90%");
    expect(PEOPLE_DUO_MODERN_STACK_POSE.front).toEqual({
      xPct: 0,
      yPct: 0,
      rotDeg: 0,
      scale: 1,
      opacity: 1,
    });
    expect(PEOPLE_DUO_MODERN_STACK_POSE.right).toEqual({
      xPct: 2.2,
      yPct: -4,
      rotDeg: 1,
      scale: 0.97,
      opacity: 0.88,
    });
    expect(PEOPLE_DUO_MODERN_STACK_POSE.left).toEqual({
      xPct: -2.2,
      yPct: -4,
      rotDeg: -1,
      scale: 0.97,
      opacity: 0.88,
    });
    expect(peopleDuoModernCardOpacity("front")).toBe(1);
    expect(peopleDuoModernCardOpacity("left")).toBe(0.88);
    expect(peopleMineCardOpacity("left")).toBe(1);
    expect(peopleMineCardTransform("left")).toContain("translate(-2.35%");
    expect(peopleDuoModernCardTransform("left")).toContain("translate(-2.2%");
    expect(peopleDuoModernCardTransform("right")).toContain("translate(2.2%");
    expect(peopleDuoModernCardTransform("front")).toBe(
      peopleMineCardTransform("front")
    );
  });

  it("rear corners peek above and beside the front; bottoms stay inside", () => {
    const left = peopleDuoModernStackLayerAabb("left");
    const right = peopleDuoModernStackLayerAabb("right");
    const front = peopleDuoModernStackLayerAabb("front");
    expect(left.minY).toBeLessThan(0);
    expect(right.minY).toBeLessThan(0);
    expect(left.minX).toBeLessThan(0);
    expect(right.maxX).toBeGreaterThan(1);
    expect(Math.abs(left.minX)).toBeCloseTo(right.maxX - 1, 3);
    expect(left.maxY).toBeLessThanOrEqual(front.maxY + 0.02);
    expect(right.maxY).toBeLessThanOrEqual(front.maxY + 0.02);
  });

  it("headroom uses Duo pose; two/three stay at least the Echo minimum", () => {
    const two = peopleDuoModernStackPadYTopPx(320, 2);
    const three = peopleDuoModernStackPadYTopPx(320, 3);
    expect(two).toBeGreaterThanOrEqual(PEOPLE_DUO_MODERN_STACK_PAD_Y_TOP_MIN_PX);
    expect(three).toBeGreaterThanOrEqual(two);
    expect(
      peopleMineStackTopHeadroomUnit("left", PEOPLE_DUO_MODERN_STACK_POSE)
    ).toBeLessThan(peopleMineStackTopHeadroomUnit("left"));
  });

  it("Duo modern surplus is top clearance only; leftover is not scrollable", () => {
    expect(peopleDuoModernDistributeHostSurplus(0)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleDuoModernDistributeHostSurplus(Number.NaN)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleDuoModernDistributeHostSurplus(-4)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleDuoModernDistributeHostSurplus(80)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(peopleDuoModernDistributeHostSurplus(6)).toEqual({
      padTop: 0,
      padBottom: 0,
    });
    expect(PEOPLE_DUO_MODERN_NAV_TO_STACK_CLEARANCE_PX).toBe(0);
    const m = computePeopleDiscoverCardMetrics({
      ...host,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      fullWidthSlide: true,
      chromeProfile: "duoModern",
      duoModernDisplayPhotoCount: 3,
    });
    expect(m.padBottom).toBe(0);
    expect(m.padTop).toBeLessThanOrEqual(
      PEOPLE_DUO_MODERN_NAV_TO_STACK_CLEARANCE_PX
    );
    expect(m.unusedHostH).toBeGreaterThanOrEqual(0);
    expect(m.contentH + m.padTop + m.padBottom + m.unusedHostH).toBeCloseTo(
      host.hostH,
      0
    );
  });

  it("metrics host compensation preserves Duo-modern envelope", () => {
    const inset = 60;
    const visualH = host.hostH + inset;
    const compensated = peopleDuoModernMetricsHostH(visualH, inset);
    expect(compensated).toBe(host.hostH);
    const baseline = computePeopleDiscoverCardMetrics({
      ...host,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      fullWidthSlide: true,
      chromeProfile: "duoModern",
      duoModernDisplayPhotoCount: 3,
    });
    const frosted = computePeopleDiscoverCardMetrics({
      hostW: host.hostW,
      hostH: compensated,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      fullWidthSlide: true,
      chromeProfile: "duoModern",
      duoModernDisplayPhotoCount: 3,
    });
    expect(frosted.frameW).toBeCloseTo(baseline.frameW, 3);
    expect(frosted.frameH).toBeCloseTo(baseline.frameH, 3);
    expect(frosted.portraitH).toBeCloseTo(baseline.portraitH, 3);
    expect(frosted.contentH).toBeCloseTo(baseline.contentH, 3);
    const maxScrollBefore = baseline.contentH - host.hostH;
    const maxScrollAfter =
      frosted.contentH + inset - visualH;
    expect(maxScrollAfter).toBeCloseTo(maxScrollBefore, 3);
  });

  it("front frame is ~85% of mobile host with 16px stack-edge clearance", () => {
    expect(PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO).toBe(0.85);
    const expectedW: Record<number, number> = {
      320: 272,
      360: 306,
      390: 331.5,
      430: 365.5,
    };
    const left = peopleDuoModernStackLayerAabb("left");
    const right = peopleDuoModernStackLayerAabb("right");
    for (const hostW of [320, 360, 390, 430]) {
      const frameW = peopleDuoModernTargetFrameW(hostW, 720);
      const m = computePeopleDiscoverCardMetrics({
        hostW,
        hostH: 720,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        fullWidthSlide: true,
        chromeProfile: "duoModern",
        duoModernDisplayPhotoCount: 3,
      });
      expect(m.frameW).toBeCloseTo(frameW, 1);
      expect(m.frameW).toBeCloseTo(expectedW[hostW]!, 1);
      expect(m.frameW / hostW).toBeGreaterThanOrEqual(0.84);
      expect(m.frameW / hostW).toBeLessThanOrEqual(0.86);
      expect(m.frameH / m.frameW).toBeCloseTo(1 / PEOPLE_CANDIDATE_MEDIA_ASPECT, 3);
      expect(m.portraitW).toBeLessThanOrEqual(hostW);
      expect(peopleMinePortraitCssVars(m)["--people-mine-frame-w"]).toBe(
        `${m.frameW}px`
      );
      const sideBudget = (hostW - m.frameW) / 2;
      const leftOvershoot = -left.minX * m.frameW;
      const rightOvershoot = (right.maxX - 1) * m.frameW;
      const topPeek = -left.minY * m.frameH;
      expect(topPeek).toBeGreaterThanOrEqual(6);
      expect(topPeek).toBeLessThanOrEqual(11);
      expect(sideBudget - leftOvershoot).toBeGreaterThanOrEqual(16);
      expect(sideBudget - rightOvershoot).toBeGreaterThanOrEqual(16);
      expect(m.stackPadYTop).toBe(
        peopleDuoModernStackPadYTopPx(
          m.frameH,
          PEOPLE_DUO_MODERN_STACK_ENVELOPE_PHOTO_COUNT
        )
      );
    }
    const wide = peopleDuoModernTargetFrameW(800, 900);
    expect(wide).toBeLessThanOrEqual(PEOPLE_MINE_MAX_SLIDE_W - 20);
  });

  it("shared envelope keeps front-card bottom aligned across photo counts", () => {
    const heights = [0, 1, 2, 3].map((count) => {
      const m = computePeopleDiscoverCardMetrics({
        ...host,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        fullWidthSlide: true,
        chromeProfile: "duoModern",
        duoModernDisplayPhotoCount: count,
      });
      return m.portraitH;
    });
    expect(heights[0]).toBe(heights[3]);
    expect(heights[1]).toBe(heights[3]);
    expect(heights[2]).toBe(heights[3]);
  });

  it("short host still respects the width cap and aspect ladder", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 320,
      hostH: 520,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      fullWidthSlide: true,
      chromeProfile: "duoModern",
      duoModernDisplayPhotoCount: 3,
    });
    expect(m.frameW).toBeLessThanOrEqual(272);
    expect(m.frameW / m.frameH).toBeGreaterThanOrEqual(
      PEOPLE_CANDIDATE_MEDIA_ASPECT - 0.002
    );
    expect(m.frameW / m.frameH).toBeLessThanOrEqual(0.86);
  });

  it("assignments stay 0/1/2/3 without fake rear layers", () => {
    expect(peopleMineStackAssignments(0, 0)).toEqual([]);
    expect(peopleMineStackAssignments(1, 0).map((a) => a.role)).toEqual([
      "front",
    ]);
    expect(peopleMineStackAssignments(2, 0).map((a) => a.role)).toEqual([
      "front",
      "right",
    ]);
    expect(peopleMineStackAssignments(3, 0).map((a) => a.role)).toEqual([
      "front",
      "right",
      "left",
    ]);
  });

  it("metrics stackPadYTop matches CSS var contract per photo count", () => {
    for (const count of [0, 1, 2, 3]) {
      const m = computePeopleDiscoverCardMetrics({
        ...host,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        fullWidthSlide: true,
        chromeProfile: "duoModern",
        duoModernDisplayPhotoCount: count,
      });
      expect(m.stackPadYTop).toBe(
        peopleDuoModernStackPadYTopPx(
          m.frameH,
          PEOPLE_DUO_MODERN_STACK_ENVELOPE_PHOTO_COUNT
        )
      );
      expect(peopleMinePortraitCssVars(m)["--people-duo-stack-pad-y-top"]).toBe(
        `${m.stackPadYTop}px`
      );
    }
  });
});
