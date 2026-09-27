import { describe, expect, it } from "vitest";
import {
  createMineButtonFlightLatch,
  flushMineButtonLatch,
  mineButtonStepShouldJump,
  mineEdgeCannotFitAccessibleTarget,
  mineEdgeNavMovedPastTap,
  mineEdgeRotationInwardExtraPx,
  mineEdgeSideGutterPx,
  mineEdgeVisiblePx,
  mineEdgeVisualGapPx,
  MINE_EDGE_CARD_LAYOUT_W_PX,
  MINE_EDGE_NAV_MOVE_CANCEL_PX,
  MINE_EDGE_PORTRAIT_CLEARANCE_PX,
  MINE_EDGE_VISIBLE_IDEAL_MIN_PX,
  MINE_EDGE_VISIBLE_MAX_PX,
  planMineButtonStep,
  queueMineButtonTarget,
  releaseMineButtonLatchOnIndexDiverge,
} from "./mineEdgeNavGesture";
import {
  computePeopleDiscoverCardMetrics,
  PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX,
  PEOPLE_MINE_EDGE_VISIBLE_MIN_TALL_PX,
  peopleMineEdgeVisibleMinPx,
  peopleMinePreferredEdgeVisiblePx,
  peopleMineTallFactor,
  peoplePlansTargetFrameW,
  peopleMineVisualClearanceMinPx,
  peopleMineVisualClearancePx,
} from "./peopleCandidateMediaPresentation";

describe("mineEdgeNavMovedPastTap", () => {
  const origin = { x: 100, y: 200 };

  it("treats movement within tolerance as a tap", () => {
    expect(
      mineEdgeNavMovedPastTap(origin, 100 + MINE_EDGE_NAV_MOVE_CANCEL_PX, 200)
    ).toBe(false);
    expect(mineEdgeNavMovedPastTap(origin, 110, 205)).toBe(false);
  });

  it("cancels after genuine drag past tolerance", () => {
    expect(
      mineEdgeNavMovedPastTap(
        origin,
        100 + MINE_EDGE_NAV_MOVE_CANCEL_PX + 1,
        200
      )
    ).toBe(true);
  });
});

describe("mineEdgeVisiblePx rotation-aware clearance", () => {
  const matrix = [
    { hostW: 320, hostH: 700 },
    { hostW: 360, hostH: 740 },
    { hostW: 390, hostH: 844 },
    { hostW: 412, hostH: 924 },
    { hostW: 440, hostH: 956 },
  ] as const;

  it("keeps visual gap near tall-aware clearance on matrix hosts", () => {
    const rot = mineEdgeRotationInwardExtraPx();
    expect(rot).toBeGreaterThan(9);
    expect(rot).toBeLessThan(12);
    expect(MINE_EDGE_PORTRAIT_CLEARANCE_PX).toBe(
      PEOPLE_MINE_EDGE_VISUAL_CLEARANCE_PX
    );

    for (const { hostW, hostH } of matrix) {
      const tall = peopleMineTallFactor(hostW, hostH);
      const clearance = peopleMineVisualClearancePx(tall);
      const clearanceMin = peopleMineVisualClearanceMinPx(tall);
      const frameW = peoplePlansTargetFrameW(hostW, hostH);
      // Fixed-rail Plans: frame width independent of hostH.
      expect(frameW).toBe(peoplePlansTargetFrameW(hostW, 500));
      const visible = mineEdgeVisiblePx(hostW, frameW, undefined, hostH);
      expect(visible).toBeGreaterThanOrEqual(0);
      expect(visible).toBeLessThanOrEqual(MINE_EDGE_VISIBLE_MAX_PX);
      const gap = mineEdgeVisualGapPx(
        hostW,
        visible,
        frameW,
        undefined,
        hostH
      );
      expect(gap).toBeGreaterThanOrEqual(clearanceMin - 0.6);
      expect(gap).toBeLessThanOrEqual(clearance + 2.5);
      const m = computePeopleDiscoverCardMetrics({
        hostW,
        hostH,
        reserveInFlowChrome: true,
        distributeVerticalSurplus: true,
        upwardPeekPad: false,
        fullWidthSlide: true,
        chromeProfile: "plans",
      });
      expect(m.frameW).toBeCloseTo(frameW, 1);
      expect(m.portraitW).toBeCloseTo(hostW - 2 * 54, 1);
    }
  });

  it("preferred exposure uses tallFactor (short baseline unchanged without hostH)", () => {
    expect(peopleMinePreferredEdgeVisiblePx(440)).toBe(30);
    expect(peopleMinePreferredEdgeVisiblePx(360)).toBe(28);
    expect(peopleMinePreferredEdgeVisiblePx(320)).toBe(28);
    expect(mineEdgeVisiblePx(440)).toBe(30);

    const tall440 = peopleMineTallFactor(440, 956);
    expect(tall440).toBeGreaterThan(0.5);
    const preferredTall = peopleMinePreferredEdgeVisiblePx(440, 956);
    expect(preferredTall).toBeGreaterThanOrEqual(
      PEOPLE_MINE_EDGE_VISIBLE_MIN_TALL_PX - 0.5
    );
    expect(preferredTall).toBeLessThanOrEqual(MINE_EDGE_VISIBLE_MAX_PX);
    expect(peopleMineVisualClearancePx(tall440)).toBeLessThan(18);
  });

  it("consumes height-bound surplus gutter toward the same visual gap", () => {
    // Measured-like short Mine host: frame shrinks below width-first target.
    const hostW = 360;
    const hostH = 560;
    const actualFrameW = 215.9;
    const targetFrame = peoplePlansTargetFrameW(hostW, hostH);
    expect(actualFrameW).toBeLessThan(targetFrame);
    const visible = mineEdgeVisiblePx(hostW, actualFrameW, undefined, hostH);
    expect(visible).toBeGreaterThan(
      mineEdgeVisiblePx(hostW, undefined, undefined, hostH)
    );
    const gap = mineEdgeVisualGapPx(
      hostW,
      visible,
      actualFrameW,
      undefined,
      hostH
    );
    const tall = peopleMineTallFactor(hostW, hostH);
    expect(gap).toBeGreaterThanOrEqual(
      peopleMineVisualClearanceMinPx(tall) - 0.5
    );
    expect(gap).toBeLessThanOrEqual(
      peopleMineVisualClearancePx(tall) + 1.5
    );
  });

  it("preserves fixed-rail portrait on tall 440 (no tallFactor widen)", () => {
    const hostW = 440;
    const hostH = 956;
    const frameW = peoplePlansTargetFrameW(hostW, hostH);
    expect(frameW).toBe(peoplePlansTargetFrameW(hostW, 560));
    const visible = mineEdgeVisiblePx(hostW, frameW, undefined, hostH);
    const tall = peopleMineTallFactor(hostW, hostH);
    expect(visible).toBeGreaterThanOrEqual(
      peopleMineEdgeVisibleMinPx(tall) - 0.5
    );
    expect(
      mineEdgeVisualGapPx(hostW, visible, frameW, undefined, hostH)
    ).toBeGreaterThanOrEqual(peopleMineVisualClearanceMinPx(tall) - 0.5);
  });

  it("never overlaps portrait on narrow 320 hosts", () => {
    const hostW = 320;
    const hostH = 700;
    const frameW = peoplePlansTargetFrameW(hostW, hostH);
    const visible = mineEdgeVisiblePx(hostW, frameW, undefined, hostH);
    const gutter = mineEdgeSideGutterPx(hostW, frameW, hostH);
    const tall = peopleMineTallFactor(hostW, hostH);
    expect(visible).toBeGreaterThan(0);
    expect(
      visible +
        mineEdgeRotationInwardExtraPx() +
        peopleMineVisualClearanceMinPx(tall)
    ).toBeLessThanOrEqual(gutter + 0.6);
    expect(mineEdgeCannotFitAccessibleTarget(hostW, frameW, hostH)).toBe(true);
    expect(visible).toBeLessThan(44);
  });

  it("both directions use the same visible width helper", () => {
    expect(mineEdgeVisiblePx(360, undefined, undefined, 740)).toBe(
      mineEdgeVisiblePx(360, undefined, undefined, 740)
    );
  });

  it("keeps underlying card width at 104px (hit target unchanged)", () => {
    expect(MINE_EDGE_CARD_LAYOUT_W_PX).toBe(104);
    expect(MINE_EDGE_VISIBLE_IDEAL_MIN_PX).toBe(28);
    expect(MINE_EDGE_NAV_MOVE_CANCEL_PX).toBe(18);
  });
});

describe("mine button flight latch", () => {
  it("no-op destination does not latch", () => {
    const { latch, shouldNavigate } = planMineButtonStep(
      createMineButtonFlightLatch(),
      2,
      2,
      5,
      true
    );
    expect(shouldNavigate).toBe(false);
    expect(latch.flightActive).toBe(false);
  });

  it("queues while in flight and flushes one step", () => {
    let latch = createMineButtonFlightLatch();
    const planned = planMineButtonStep(latch, 1, 0, 5, true);
    expect(planned.shouldNavigate).toBe(true);
    latch = planned.latch;
    latch = queueMineButtonTarget(latch, 3, 5);
    const flushed = flushMineButtonLatch(latch, 1, 5);
    expect(flushed.nextStep).toBe(2);
  });

  it("button hops always jump", () => {
    expect(mineButtonStepShouldJump()).toBe(true);
  });

  it("releases latch when index diverges from flight dest", () => {
    const latch = releaseMineButtonLatchOnIndexDiverge(
      { flightActive: true, pendingTarget: 4, flightDest: 2 },
      1
    );
    expect(latch.flightActive).toBe(false);
    expect(latch.pendingTarget).toBe(4);
  });
});
