import { describe, expect, it } from "vitest";
import {
  applyMineMotionProbeAdjacentMedia,
  beginMineMotionProbeFlight,
  claimMineMotionProbeFlightDestination,
  computeMineMotionProbeGeometry,
  computeMineMotionProbeProgress,
  createMineMotionProbeController,
  lockMineMotionProbeFlight,
  markMineMotionProbeSideReady,
  mineIncomingPortraitAabbHalfWidth,
  mineIncomingPortraitParkedCenterX,
  mineIncomingPortraitRotateDeg,
  mineIncomingProxyRotateDeg,
  mineIncomingProxyScale,
  mineIncomingRealSlideExtraTranslateX,
  mineOutgoingPortraitParkedCenterX,
  mineOutgoingPortraitRotateDeg,
  mineOutgoingPortraitScale,
  mineOutgoingRealSlideExtraTranslateX,
  mineEdgeCardEngagement,
  mineEdgeCardMotionTransform,
  mineEdgeCardRestTransform,
  mineEdgeCardTransformOrigin,
  mineMotionProbeAdjacentAtIndex,
  mineMotionProbeLandingFromRects,
  mineMotionProbeVisiblePx,
  MINE_EDGE_CARD_MAX_INWARD_PX,
  MINE_EDGE_CARD_MAX_SCALE,
  MINE_EDGE_CARD_OPPOSITE_TILT_DEG,
  MINE_EDGE_CARD_REST_ROTATE_DEG,
  MINE_INCOMING_PORTRAIT_PEEK_PX,
  MINE_INCOMING_PROXY_START_SCALE,
  MINE_MOTION_PROBE_DOT_INSET_PX,
  MINE_MOTION_PROBE_FLIGHT_DEST_OPEN,
  MINE_PORTRAIT_NAV_ROTATE_DEG,
  prepareMineMotionProbeProgrammaticFlight,
  unlockMineMotionProbeFlight,
  writeMineIncomingRealSlideVisual,
  writeMineMotionProbeVisual,
} from "./mineMotionProbeProgress";

describe("computeMineMotionProbeProgress", () => {
  const snaps = [0, 0.5, 1];

  it("returns zeros at rest on anchor", () => {
    expect(computeMineMotionProbeProgress(0, snaps, 0)).toEqual({
      prev: 0,
      next: 0,
    });
    expect(computeMineMotionProbeProgress(0.5, snaps, 1)).toEqual({
      prev: 0,
      next: 0,
    });
  });

  it("increases next when scrollProgress rises toward next snap", () => {
    expect(computeMineMotionProbeProgress(0.25, snaps, 0)).toEqual({
      prev: 0,
      next: 0.5,
    });
    expect(computeMineMotionProbeProgress(0.5, snaps, 0)).toEqual({
      prev: 0,
      next: 1,
    });
  });

  it("increases prev when scrollProgress falls toward previous snap", () => {
    expect(computeMineMotionProbeProgress(0.25, snaps, 1)).toEqual({
      prev: 0.5,
      next: 0,
    });
    expect(computeMineMotionProbeProgress(0, snaps, 1)).toEqual({
      prev: 1,
      next: 0,
    });
  });

  it("forces unavailable directions to zero at ends", () => {
    expect(computeMineMotionProbeProgress(-0.1, snaps, 0)).toEqual({
      prev: 0,
      next: 0,
    });
    expect(computeMineMotionProbeProgress(1.1, snaps, 2)).toEqual({
      prev: 0,
      next: 0,
    });
  });

  it("handles empty / invalid step safely", () => {
    expect(computeMineMotionProbeProgress(0, [], 0)).toEqual({
      prev: 0,
      next: 0,
    });
    expect(computeMineMotionProbeProgress(0, [0, 0], 0)).toEqual({
      prev: 0,
      next: 0,
    });
  });
});

describe("computeMineMotionProbeGeometry", () => {
  it("derives center and side anchors from shell width", () => {
    const g = computeMineMotionProbeGeometry(400);
    const edge = mineMotionProbeVisiblePx(400);
    expect(g.centerX).toBe(200);
    expect(g.centerY).toBe(0);
    expect(g.startCenterY).toBe(0);
    expect(g.frameW).toBe(0);
    expect(g.frameH).toBe(0);
    expect(g.prevStartX).toBe(edge - MINE_MOTION_PROBE_DOT_INSET_PX);
    expect(g.nextStartX).toBe(400 - edge + MINE_MOTION_PROBE_DOT_INSET_PX);
  });

  it("applies measured landing without changing edge start anchors", () => {
    const g = computeMineMotionProbeGeometry(400, {
      centerX: 188,
      centerY: 210,
      startCenterY: 198,
      frameW: 120,
      frameH: 160,
    });
    const edge = mineMotionProbeVisiblePx(400);
    expect(g.centerX).toBe(188);
    expect(g.centerY).toBe(210);
    expect(g.startCenterY).toBe(198);
    expect(g.frameW).toBe(120);
    expect(g.frameH).toBe(160);
    expect(g.prevStartX).toBe(edge - MINE_MOTION_PROBE_DOT_INSET_PX);
    expect(g.nextStartX).toBe(400 - edge + MINE_MOTION_PROBE_DOT_INSET_PX);
  });
});

describe("mineMotionProbeLandingFromRects", () => {
  it("maps slide-local front frame to resting host origin in the proxy container", () => {
    const landing = mineMotionProbeLandingFromRects(
      { left: 10, top: 20, width: 400, height: 800 },
      { left: 10, top: 120, width: 400, height: 500 },
      { left: -390, top: 120, width: 400, height: 500 },
      { left: -270, top: 220, width: 160, height: 200 }
    );
    expect(landing).toEqual({
      // Off-screen slide must not shift the resting destination.
      centerX: 200,
      centerY: 300,
      // Edge cards share the front-portrait center — start Y == dest Y.
      startCenterY: 300,
      frameW: 160,
      frameH: 200,
    });
    expect(landing?.startCenterY).toBe(landing?.centerY);
  });
});

describe("writeMineMotionProbeVisual landing", () => {
  function proxyCtrl() {
    const style: Record<string, string> = {};
    const root = {
      style,
      getAttribute: () => null,
    } as unknown as HTMLElement;
    const ctrl = createMineMotionProbeController("proxy");
    ctrl.root = root;
    ctrl.nextUrl = "next.jpg";
    ctrl.nextReady = true;
    ctrl.prevUrl = "prev.jpg";
    ctrl.prevReady = true;
    ctrl.frameW = 80;
    ctrl.frameH = 100;
    return { ctrl, style };
  }

  const geom = computeMineMotionProbeGeometry(400, {
    centerX: 200,
    centerY: 180,
    startCenterY: 198,
    frameW: 100,
    frameH: 80,
  });

  it("lands at the measured front-photo center at progress 1", () => {
    const { ctrl, style } = proxyCtrl();
    writeMineMotionProbeVisual(ctrl, { prev: 0, next: 1 }, geom);
    expect(style.transform).toBe(
      "translate3d(150px, -58px, 0) rotate(0deg) scale(1)"
    );
    expect(style.transformOrigin).toBe("bottom left");
  });

  it("PREVIOUS uses the same destination center", () => {
    const { ctrl, style } = proxyCtrl();
    writeMineMotionProbeVisual(ctrl, { prev: 1, next: 0 }, geom);
    expect(style.transform).toBe(
      "translate3d(150px, -58px, 0) rotate(0deg) scale(1)"
    );
    expect(style.transformOrigin).toBe("bottom right");
  });

  it("keeps edge start Y equivalent to -50% at progress 0+", () => {
    const { ctrl, style } = proxyCtrl();
    writeMineMotionProbeVisual(ctrl, { prev: 0, next: 0.0001 }, geom);
    const ty = Number(
      /translate3d\([^,]+,\s*([^p]+)px/.exec(style.transform ?? "")?.[1]
    );
    expect(ty).toBeCloseTo(-40.0018, 3);
  });
});

describe("mineIncomingPortraitParkedCenterX", () => {
  const slideW = 400;
  const frameW = 260;
  const frameH = 346.666;

  it("NEXT parks mostly outside the right viewport with only a thin peek", () => {
    const parked = mineIncomingPortraitParkedCenterX({
      side: "next",
      slideW,
      frameW,
      frameH,
    });
    const half = mineIncomingPortraitAabbHalfWidth({
      frameW,
      frameH,
      scale: MINE_INCOMING_PROXY_START_SCALE,
      rotateDeg: MINE_PORTRAIT_NAV_ROTATE_DEG,
    });
    // Left fringe of parked portrait = parked - half; should sit near slideW - peek.
    expect(parked - half).toBeCloseTo(slideW - MINE_INCOMING_PORTRAIT_PEEK_PX, 5);
    expect(parked).toBeGreaterThan(slideW);
  });

  it("PREVIOUS mirrors beyond the left boundary", () => {
    const parked = mineIncomingPortraitParkedCenterX({
      side: "prev",
      slideW,
      frameW,
      frameH,
    });
    const half = mineIncomingPortraitAabbHalfWidth({
      frameW,
      frameH,
      scale: MINE_INCOMING_PROXY_START_SCALE,
      rotateDeg: -MINE_PORTRAIT_NAV_ROTATE_DEG,
    });
    expect(parked + half).toBeCloseTo(MINE_INCOMING_PORTRAIT_PEEK_PX, 5);
    expect(parked).toBeLessThan(0);
  });
});

describe("mineOutgoingRealSlideExtraTranslateX", () => {
  const slideW = 400;
  const portraitCenterLocalX = 200;
  const frameW = 260;
  const frameH = 346.666;

  it("NEXT at p=0 keeps centered (extra 0)", () => {
    expect(
      mineOutgoingRealSlideExtraTranslateX({
        side: "next",
        progress: 0,
        slideW,
        portraitCenterLocalX,
        frameW,
        frameH,
      })
    ).toBe(0);
  });

  it("NEXT at p=1 places Embla+extra at the left parked peek", () => {
    const extra = mineOutgoingRealSlideExtraTranslateX({
      side: "next",
      progress: 1,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const parked = mineOutgoingPortraitParkedCenterX({
      side: "next",
      slideW,
      frameW,
      frameH,
    });
    // Natural departure screen X after full NEXT Embla move.
    const natural = portraitCenterLocalX - slideW;
    expect(natural + extra).toBeCloseTo(parked, 5);
    expect(parked).toBeLessThan(0);
    expect(extra).not.toBe(0);
  });

  it("PREVIOUS at p=1 parks beyond the right edge", () => {
    const extra = mineOutgoingRealSlideExtraTranslateX({
      side: "prev",
      progress: 1,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const parked = mineOutgoingPortraitParkedCenterX({
      side: "prev",
      slideW,
      frameW,
      frameH,
    });
    const natural = portraitCenterLocalX + slideW;
    expect(natural + extra).toBeCloseTo(parked, 5);
    expect(parked).toBeGreaterThan(slideW);
  });

  it("reverses linearly with progress", () => {
    const at1 = mineOutgoingRealSlideExtraTranslateX({
      side: "next",
      progress: 1,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const atHalf = mineOutgoingRealSlideExtraTranslateX({
      side: "next",
      progress: 0.5,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    expect(atHalf).toBeCloseTo(at1 * 0.5, 5);
  });
});

describe("mineIncomingRealSlideExtraTranslateX", () => {
  const slideW = 400;
  const portraitCenterLocalX = 200;
  const frameW = 260;
  const frameH = 346.666;

  it("NEXT at p=0 pulls left enough that natural+extra ≈ parked peek center", () => {
    const extra = mineIncomingRealSlideExtraTranslateX({
      side: "next",
      progress: 0,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const parked = mineIncomingPortraitParkedCenterX({
      side: "next",
      slideW,
      frameW,
      frameH,
    });
    const natural = slideW + portraitCenterLocalX;
    expect(natural + extra).toBeCloseTo(parked, 5);
    expect(extra).toBeLessThan(0);
  });

  it("NEXT at p=1 has zero extra translate", () => {
    expect(
      mineIncomingRealSlideExtraTranslateX({
        side: "next",
        progress: 1,
        slideW,
        portraitCenterLocalX,
        frameW,
        frameH,
      })
    ).toBe(0);
  });

  it("PREVIOUS at p=0 pulls right toward the left peek", () => {
    const extra = mineIncomingRealSlideExtraTranslateX({
      side: "prev",
      progress: 0,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const parked = mineIncomingPortraitParkedCenterX({
      side: "prev",
      slideW,
      frameW,
      frameH,
    });
    const natural = -slideW + portraitCenterLocalX;
    expect(natural + extra).toBeCloseTo(parked, 5);
    expect(extra).toBeGreaterThan(0);
  });

  it("interpolates linearly and reverses with progress", () => {
    const at0 = mineIncomingRealSlideExtraTranslateX({
      side: "next",
      progress: 0,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    const atHalf = mineIncomingRealSlideExtraTranslateX({
      side: "next",
      progress: 0.5,
      slideW,
      portraitCenterLocalX,
      frameW,
      frameH,
    });
    expect(atHalf).toBeCloseTo(at0 * 0.5, 5);
  });
});

describe("mineIncomingPortraitRotateDeg", () => {
  it("maps NEXT +7→0 and PREV −7→0", () => {
    expect(mineIncomingPortraitRotateDeg(0, "next")).toBe(
      MINE_PORTRAIT_NAV_ROTATE_DEG
    );
    expect(mineIncomingPortraitRotateDeg(1, "next")).toBe(0);
    expect(mineIncomingPortraitRotateDeg(0, "prev")).toBe(
      -MINE_PORTRAIT_NAV_ROTATE_DEG
    );
    expect(mineIncomingPortraitRotateDeg(0.5, "next")).toBeCloseTo(
      MINE_PORTRAIT_NAV_ROTATE_DEG / 2,
      5
    );
  });
});

describe("mineOutgoingPortraitRotateDeg / scale", () => {
  it("maps NEXT 0→−7 and PREV 0→+7", () => {
    expect(mineOutgoingPortraitRotateDeg(0, "next")).toBe(0);
    expect(mineOutgoingPortraitRotateDeg(1, "next")).toBe(
      -MINE_PORTRAIT_NAV_ROTATE_DEG
    );
    expect(mineOutgoingPortraitRotateDeg(0, "prev")).toBe(0);
    expect(mineOutgoingPortraitRotateDeg(1, "prev")).toBe(
      MINE_PORTRAIT_NAV_ROTATE_DEG
    );
    expect(mineOutgoingPortraitRotateDeg(0.5, "next")).toBeCloseTo(
      -MINE_PORTRAIT_NAV_ROTATE_DEG / 2,
      5
    );
  });

  it("scales 1→0.5 inversely to incoming", () => {
    expect(mineOutgoingPortraitScale(0)).toBe(1);
    expect(mineOutgoingPortraitScale(1)).toBe(MINE_INCOMING_PROXY_START_SCALE);
    expect(mineOutgoingPortraitScale(0.5)).toBeCloseTo(0.75, 5);
    expect(
      mineOutgoingPortraitScale(0.5) + mineIncomingProxyScale(0.5)
    ).toBeCloseTo(1.5, 5);
  });
});

describe("mineEdgeCardEngagement", () => {
  it("is rest at 0 and 1, engaged in the middle", () => {
    expect(mineEdgeCardEngagement(0)).toBe(0);
    expect(mineEdgeCardEngagement(1)).toBe(0);
    expect(mineEdgeCardEngagement(0.6)).toBe(1);
    expect(mineEdgeCardEngagement(0.3)).toBeCloseTo(0.5, 5);
  });

  it("restores exact resting transform at progress extremes", () => {
    expect(mineEdgeCardMotionTransform("next", 0)).toBe(
      mineEdgeCardRestTransform("next")
    );
    expect(mineEdgeCardMotionTransform("prev", 1)).toBe(
      mineEdgeCardRestTransform("prev")
    );
  });

  it("keeps edge-card rest tilt at ±5 (independent of portrait ±7)", () => {
    expect(MINE_EDGE_CARD_REST_ROTATE_DEG).toBe(5);
    expect(mineEdgeCardRestTransform("next")).toBe(
      "translateY(-50%) rotate(5deg)"
    );
    expect(mineEdgeCardRestTransform("prev")).toBe(
      "translateY(-50%) rotate(-5deg)"
    );
  });

  it("peaks at scale 1.28, inward 12px, and opposite ±4deg", () => {
    expect(MINE_EDGE_CARD_MAX_SCALE).toBe(1.28);
    expect(MINE_EDGE_CARD_MAX_INWARD_PX).toBe(12);
    expect(MINE_EDGE_CARD_OPPOSITE_TILT_DEG).toBe(4);

    const nextPeak = mineEdgeCardMotionTransform("next", 0.6);
    expect(nextPeak).toContain(`scale(${MINE_EDGE_CARD_MAX_SCALE})`);
    expect(nextPeak).toContain(
      `translateX(${-MINE_EDGE_CARD_MAX_INWARD_PX}px)`
    );
    expect(nextPeak).toContain(
      `rotate(${-MINE_EDGE_CARD_OPPOSITE_TILT_DEG}deg)`
    );

    const prevPeak = mineEdgeCardMotionTransform("prev", 0.6);
    expect(prevPeak).toContain(`scale(${MINE_EDGE_CARD_MAX_SCALE})`);
    expect(prevPeak).toContain(
      `translateX(${MINE_EDGE_CARD_MAX_INWARD_PX}px)`
    );
    expect(prevPeak).toContain(
      `rotate(${MINE_EDGE_CARD_OPPOSITE_TILT_DEG}deg)`
    );
  });

  it("uses outer-edge transform origins", () => {
    expect(mineEdgeCardTransformOrigin("prev")).toBe("left center");
    expect(mineEdgeCardTransformOrigin("next")).toBe("right center");
  });
});

describe("writeMineIncomingRealSlideVisual", () => {
  function slideWithEls(index: number) {
    return {
      querySelector: (sel: string) => {
        if (sel.includes("nav-portrait")) return portraitEls[index];
        if (sel.includes("nav-motion")) return outerEls[index];
        return null;
      },
    } as unknown as HTMLElement;
  }
  const portraitEls: Array<{ style: Record<string, string> }> = [];
  const outerEls: Array<{ style: Record<string, string> }> = [];

  function resetEls(n: number) {
    portraitEls.length = 0;
    outerEls.length = 0;
    for (let i = 0; i < n; i += 1) {
      portraitEls.push({ style: {} });
      outerEls.push({ style: { transform: "translate3d(-99px, 0, 0) scale(0.5)" } });
    }
  }

  it("writes incoming center + outgoing left-parked at NEXT progress 1", () => {
    resetEls(3);
    const slides = [0, 1, 2].map(slideWithEls);
    writeMineIncomingRealSlideVisual({
      slides,
      progress: { prev: 0, next: 1 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
    });
    // Incoming (index 1) at center.
    expect(portraitEls[1]?.style.transform).toContain("translate3d(0px, 0, 0)");
    expect(portraitEls[1]?.style.transform).toContain("rotate(0deg)");
    expect(portraitEls[1]?.style.transform).toContain("scale(1)");
    // Outgoing (departure 0) parked left, small, tilted −7.
    expect(portraitEls[0]?.style.transform).toContain(
      `rotate(${-MINE_PORTRAIT_NAV_ROTATE_DEG}deg)`
    );
    expect(portraitEls[0]?.style.transform).toContain(
      `scale(${MINE_INCOMING_PROXY_START_SCALE})`
    );
    expect(portraitEls[0]?.style.transform).toMatch(/translate3d\(/);
    expect(portraitEls[2]?.style.transform).toBe("");
    // Outer wrappers must not keep navigation transforms.
    expect(outerEls[0]?.style.transform).toBe("");
    expect(outerEls[1]?.style.transform).toBe("");
  });

  it("writes outgoing right-parked on PREVIOUS progress 1", () => {
    resetEls(3);
    writeMineIncomingRealSlideVisual({
      slides: [0, 1, 2].map(slideWithEls),
      progress: { prev: 1, next: 0 },
      departureIndex: 1,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
    });
    expect(portraitEls[0]?.style.transform).toContain("scale(1)");
    expect(portraitEls[0]?.style.transform).toContain("rotate(0deg)");
    expect(portraitEls[1]?.style.transform).toContain(
      `rotate(${MINE_PORTRAIT_NAV_ROTATE_DEG}deg)`
    );
    expect(portraitEls[1]?.style.transform).toContain(
      `scale(${MINE_INCOMING_PROXY_START_SCALE})`
    );
  });

  it("shares the same progress for incoming growth and outgoing shrink", () => {
    resetEls(2);
    writeMineIncomingRealSlideVisual({
      slides: [0, 1].map(slideWithEls),
      progress: { prev: 0, next: 0.5 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
    });
    expect(portraitEls[1]?.style.transform).toContain("scale(0.75)");
    expect(portraitEls[0]?.style.transform).toContain("scale(0.75)");
    expect(portraitEls[1]?.style.transform).toContain(
      `rotate(${MINE_PORTRAIT_NAV_ROTATE_DEG / 2}deg)`
    );
    expect(portraitEls[0]?.style.transform).toContain(
      `rotate(${-MINE_PORTRAIT_NAV_ROTATE_DEG / 2}deg)`
    );
  });

  it("parks NEXT incoming mostly outside at progress 0 via forceSide; outgoing stays clear", () => {
    resetEls(2);
    writeMineIncomingRealSlideVisual({
      slides: [0, 1].map(slideWithEls),
      progress: { prev: 0, next: 0 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
      forceSide: "next",
    });
    const transform = portraitEls[1]?.style.transform ?? "";
    const match = /translate3d\(([^p]+)px/.exec(transform);
    const x = Number(match?.[1]);
    expect(x).toBeLessThan(0);
    expect(transform).toContain(`rotate(${MINE_PORTRAIT_NAV_ROTATE_DEG}deg)`);
    expect(transform).toContain(`scale(${MINE_INCOMING_PROXY_START_SCALE})`);
    // Outgoing departure remains identity (cleared) at start.
    expect(portraitEls[0]?.style.transform).toBe("");
  });

  it("clears all when progress is idle without forceSide", () => {
    resetEls(2);
    portraitEls[0]!.style.transform = "translate3d(5px, 0, 0) scale(0.5)";
    portraitEls[1]!.style.transform = "translate3d(-10px, 0, 0) scale(0.5)";
    writeMineIncomingRealSlideVisual({
      slides: [0, 1].map(slideWithEls),
      progress: { prev: 0, next: 0 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
    });
    expect(portraitEls[0]?.style.transform).toBe("");
    expect(portraitEls[1]?.style.transform).toBe("");
  });

  it("engages both edge cards from the same progress", () => {
    resetEls(2);
    const prevStyle: Record<string, string> = {
      transform: mineEdgeCardRestTransform("prev"),
      transformOrigin: "",
    };
    const nextStyle: Record<string, string> = {
      transform: mineEdgeCardRestTransform("next"),
      transformOrigin: "",
    };
    writeMineIncomingRealSlideVisual({
      slides: [0, 1].map(slideWithEls),
      progress: { prev: 0, next: 0.6 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
      animateEdgeCards: true,
      edgeCards: {
        prev: { style: prevStyle } as unknown as HTMLElement,
        next: { style: nextStyle } as unknown as HTMLElement,
      },
    });
    expect(nextStyle.transform).not.toBe(mineEdgeCardRestTransform("next"));
    expect(prevStyle.transform).not.toBe(mineEdgeCardRestTransform("prev"));
    expect(nextStyle.transform).toContain(`scale(${MINE_EDGE_CARD_MAX_SCALE})`);
    expect(prevStyle.transform).toContain(`scale(${MINE_EDGE_CARD_MAX_SCALE})`);
    expect(nextStyle.transformOrigin).toBe("right center");
    expect(prevStyle.transformOrigin).toBe("left center");
  });

  it("keeps edge cards at rest when animateEdgeCards is false (button flights)", () => {
    resetEls(2);
    const prevStyle: Record<string, string> = {
      transform: "stale",
      transformOrigin: "",
    };
    const nextStyle: Record<string, string> = {
      transform: "stale",
      transformOrigin: "",
    };
    writeMineIncomingRealSlideVisual({
      slides: [0, 1].map(slideWithEls),
      progress: { prev: 0, next: 0.6 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
      animateEdgeCards: false,
      edgeCards: {
        prev: { style: prevStyle } as unknown as HTMLElement,
        next: { style: nextStyle } as unknown as HTMLElement,
      },
    });
    // Portraits still animate.
    expect(portraitEls[1]?.style.transform).toContain("scale(0.8)");
    expect(portraitEls[0]?.style.transform).toContain("scale(0.7)");
    // Edge cards restored to rest only.
    expect(prevStyle.transform).toBe(mineEdgeCardRestTransform("prev"));
    expect(nextStyle.transform).toBe(mineEdgeCardRestTransform("next"));
  });

  it("skips missing neighbors at first/last without throwing", () => {
    resetEls(1);
    expect(() =>
      writeMineIncomingRealSlideVisual({
        slides: [0].map(slideWithEls),
        progress: { prev: 0, next: 0.5 },
        departureIndex: 0,
        slideW: 400,
        portraitCenterLocalX: 200,
        frameW: 260,
        frameH: 347,
      })
    ).not.toThrow();
    // Outgoing still written when departure exists.
    expect(portraitEls[0]?.style.transform).toContain("scale(0.75)");
  });

  it("never writes caption/note selectors or photo-cycle card attributes", () => {
    resetEls(2);
    const queried: string[] = [];
    const slides = [
      {
        querySelector: (sel: string) => {
          queried.push(sel);
          if (sel.includes("nav-portrait")) return portraitEls[0];
          if (sel.includes("nav-motion")) return outerEls[0];
          return null;
        },
      },
      {
        querySelector: (sel: string) => {
          queried.push(sel);
          if (sel.includes("nav-portrait")) return portraitEls[1];
          if (sel.includes("nav-motion")) return outerEls[1];
          return null;
        },
      },
    ] as unknown as HTMLElement[];
    writeMineIncomingRealSlideVisual({
      slides,
      progress: { prev: 0, next: 0.4 },
      departureIndex: 0,
      slideW: 400,
      portraitCenterLocalX: 200,
      frameW: 260,
      frameH: 347,
      portraitEls: portraitEls as unknown as HTMLElement[],
    });
    expect(queried.every((s) => !s.includes("duo-source"))).toBe(true);
    expect(queried.every((s) => !s.includes("duo-note"))).toBe(true);
    expect(queried.every((s) => !s.includes("mine-card"))).toBe(true);
  });
});

describe("flightAnimateEdgeCards", () => {
  it("prepare disables edge motion; lock enables; unlock clears", () => {
    const ctrl = createMineMotionProbeController("proxy");
    expect(ctrl.flightAnimateEdgeCards).toBe(false);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 0, 1);
    expect(ctrl.flightAnimateEdgeCards).toBe(false);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 0, 1);
    expect(ctrl.flightAnimateEdgeCards).toBe(false);
    lockMineMotionProbeFlight(ctrl, 0);
    expect(ctrl.flightAnimateEdgeCards).toBe(true);
    claimMineMotionProbeFlightDestination(ctrl, 1);
    expect(unlockMineMotionProbeFlight(ctrl, 1)).toBe(true);
    expect(ctrl.flightAnimateEdgeCards).toBe(false);
  });
});

describe("mineIncomingProxyScale", () => {
  it("maps 0→0.5 and 1→1 linearly", () => {
    expect(mineIncomingProxyScale(0)).toBe(0.5);
    expect(mineIncomingProxyScale(0.5)).toBe(0.75);
    expect(mineIncomingProxyScale(1)).toBe(1);
  });
});

describe("mineIncomingProxyRotateDeg", () => {
  it("maps NEXT +5→0 and PREV −5→0 linearly", () => {
    expect(mineIncomingProxyRotateDeg(0, "next")).toBe(5);
    expect(mineIncomingProxyRotateDeg(0.5, "next")).toBe(2.5);
    expect(mineIncomingProxyRotateDeg(1, "next")).toBe(0);
    expect(mineIncomingProxyRotateDeg(0, "prev")).toBe(-5);
    expect(mineIncomingProxyRotateDeg(0.5, "prev")).toBe(-2.5);
    expect(mineIncomingProxyRotateDeg(1, "prev")).toBe(0);
  });
});

describe("mineMotionProbeAdjacentAtIndex", () => {
  const urls = ["u0", "u1", "u2", "u3"];

  it("resolves neighbors for a mid-deck settled index", () => {
    expect(mineMotionProbeAdjacentAtIndex(urls, 1)).toEqual({
      prevUrl: "u0",
      nextUrl: "u2",
    });
  });

  it("nulls PREVIOUS at first and NEXT at last", () => {
    expect(mineMotionProbeAdjacentAtIndex(urls, 0)).toEqual({
      prevUrl: null,
      nextUrl: "u1",
    });
    expect(mineMotionProbeAdjacentAtIndex(urls, 3)).toEqual({
      prevUrl: "u2",
      nextUrl: null,
    });
  });
});

describe("mine motion probe flight lifecycle", () => {
  const urls = ["u0", "u1", "u2", "u3"];

  function attachResync(
    ctrl: ReturnType<typeof createMineMotionProbeController>,
    getReactIndex: () => number = () => 0
  ) {
    ctrl.resyncAdjacent = (authoritativeIndex?: number) => {
      if (ctrl.flightLocked) return;
      const at =
        typeof authoritativeIndex === "number" &&
        Number.isFinite(authoritativeIndex)
          ? Math.floor(authoritativeIndex)
          : getReactIndex();
      applyMineMotionProbeAdjacentMedia(
        ctrl,
        mineMotionProbeAdjacentAtIndex(urls, at)
      );
    };
  }

  it("ignores live adjacent updates while flight is locked", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    beginMineMotionProbeFlight(ctrl, {
      departureIndex: 0,
      destinationIndex: 1,
    });
    expect(
      applyMineMotionProbeAdjacentMedia(ctrl, {
        prevUrl: "prev-x",
        nextUrl: "next-y",
      })
    ).toBe(false);
    expect(ctrl.nextUrl).toBe("u1");
  });

  it("preserves readiness for unchanged URL across live resync", () => {
    const ctrl = createMineMotionProbeController("proxy");
    applyMineMotionProbeAdjacentMedia(ctrl, {
      prevUrl: "prev-a",
      nextUrl: "next-b",
    });
    markMineMotionProbeSideReady(
      ctrl,
      "next",
      "next-b",
      ctrl.mediaGeneration
    );
    applyMineMotionProbeAdjacentMedia(ctrl, {
      prevUrl: "prev-a",
      nextUrl: "next-b",
    });
    expect(ctrl.nextReady).toBe(true);
  });

  it("K: rejects stale ready callbacks after generation bump", () => {
    const ctrl = createMineMotionProbeController("proxy");
    applyMineMotionProbeAdjacentMedia(ctrl, {
      prevUrl: null,
      nextUrl: "next-b",
    });
    const staleGen = ctrl.mediaGeneration;
    applyMineMotionProbeAdjacentMedia(ctrl, {
      prevUrl: null,
      nextUrl: "next-c",
    });
    markMineMotionProbeSideReady(ctrl, "next", "next-b", staleGen);
    expect(ctrl.nextReady).toBe(false);
    markMineMotionProbeSideReady(
      ctrl,
      "next",
      "next-c",
      ctrl.mediaGeneration
    );
    expect(ctrl.nextReady).toBe(true);
  });

  it("E: duplicate prepare for the SAME flight is idempotent", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    expect(
      prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2)
    ).toBe("begun");
    const epoch = ctrl.flightEpoch;
    const gen = ctrl.mediaGeneration;
    expect(
      prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2)
    ).toBe("duplicate");
    expect(
      beginMineMotionProbeFlight(ctrl, {
        departureIndex: 1,
        destinationIndex: 2,
      })
    ).toBe("duplicate");
    expect(ctrl.flightEpoch).toBe(epoch);
    expect(ctrl.mediaGeneration).toBe(gen);
    expect(ctrl.nextUrl).toBe("u2");
  });

  it("F: new flight preparation is not treated as duplicate", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 0, 1);
    expect(ctrl.nextUrl).toBe("u1");
    expect(
      prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2)
    ).toBe("begun");
    expect(ctrl.nextUrl).toBe("u2");
    expect(ctrl.prevUrl).toBe("u0");
  });

  it("A: NEXT → NEXT before settle does not reuse first destination URL", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 0, 1);
    expect(ctrl.nextUrl).toBe("u1");
    // Second button step from Embla still at 0 would be serialized in Overlay;
    // if a new flight begins at departure 1 (after select), media must update.
    prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2);
    expect(ctrl.nextUrl).toBe("u2");
    expect(ctrl.flightDestinationIndex).toBe(2);
  });

  it("B: PREVIOUS → PREVIOUS before settle rebinds media", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 3, 2);
    expect(ctrl.prevUrl).toBe("u2");
    prepareMineMotionProbeProgrammaticFlight(ctrl, 2, 1);
    expect(ctrl.prevUrl).toBe("u1");
  });

  it("C: NEXT → immediate PREVIOUS rebinds to previous neighbor", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2);
    expect(ctrl.nextUrl).toBe("u2");
    prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 0);
    expect(ctrl.prevUrl).toBe("u0");
    expect(ctrl.nextUrl).toBe("u2");
  });

  it("D: PREVIOUS → immediate NEXT rebinds", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 2, 1);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 2, 3);
    expect(ctrl.nextUrl).toBe("u3");
  });

  it("G: old settle cannot clear a newer active flight", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 0, 1);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 2);
    expect(ctrl.flightDestinationIndex).toBe(2);
    expect(unlockMineMotionProbeFlight(ctrl, 1)).toBe(false);
    expect(ctrl.flightLocked).toBe(true);
    expect(ctrl.nextUrl).toBe("u2");
    expect(unlockMineMotionProbeFlight(ctrl, 2)).toBe(true);
    expect(ctrl.flightLocked).toBe(false);
  });

  it("I: rapid swipe does not mix a new anchor with old media", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    lockMineMotionProbeFlight(ctrl, 0);
    expect(ctrl.nextUrl).toBe("u1");
    expect(ctrl.flightAnimateEdgeCards).toBe(true);
    expect(ctrl.flightDestinationIndex).toBe(MINE_MOTION_PROBE_FLIGHT_DEST_OPEN);
    // New pointerDown at snap 1 while still locked
    lockMineMotionProbeFlight(ctrl, 1);
    expect(ctrl.prevUrl).toBe("u0");
    expect(ctrl.nextUrl).toBe("u2");
    expect(ctrl.flightDepartureIndex).toBe(1);
  });

  it("open swipe settle is ignored until destination is claimed", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    lockMineMotionProbeFlight(ctrl, 1);
    expect(unlockMineMotionProbeFlight(ctrl, 1)).toBe(false);
    claimMineMotionProbeFlightDestination(ctrl, 1);
    expect(unlockMineMotionProbeFlight(ctrl, 1)).toBe(true);
  });

  it("L: cancel returns to original candidate safely", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    lockMineMotionProbeFlight(ctrl, 2);
    claimMineMotionProbeFlightDestination(ctrl, 2);
    expect(unlockMineMotionProbeFlight(ctrl, 2)).toBe(true);
    expect(ctrl.prevUrl).toBe("u1");
    expect(ctrl.nextUrl).toBe("u3");
  });

  it("J: first/last candidate boundaries", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 1, 0);
    expect(ctrl.prevUrl).toBe("u0");
    expect(unlockMineMotionProbeFlight(ctrl, 0)).toBe(true);
    expect(ctrl.prevUrl).toBe(null);
    expect(ctrl.nextUrl).toBe("u1");

    prepareMineMotionProbeProgrammaticFlight(ctrl, 2, 3);
    expect(unlockMineMotionProbeFlight(ctrl, 3)).toBe(true);
    expect(ctrl.nextUrl).toBe(null);
  });

  it("H: rapid button intents serialize via pending target (one-step)", () => {
    // Overlay-level contract: pending accumulates; each settle starts next hop.
    let index = 0;
    let pending: number | null = null;
    let active = false;
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl, () => index);
    const settled: number[] = [];

    const startStep = (dest: number) => {
      active = true;
      const departure = index; // Embla at rest matches React between steps
      prepareMineMotionProbeProgrammaticFlight(ctrl, departure, dest);
      index = dest;
    };

    const onNext = () => {
      if (active) {
        const base = pending ?? index;
        pending = Math.min(3, base + 1);
        return;
      }
      startStep(Math.min(3, index + 1));
    };

    const onSettled = () => {
      active = false;
      const p = pending;
      pending = null;
      if (p == null || p === index) return;
      const step = p > index ? index + 1 : index - 1;
      if (p !== step) pending = p;
      startStep(step);
    };

    ctrl.onFlightSettled = onSettled;

    onNext(); // 0→1
    onNext(); // pending→2
    onNext(); // pending→3
    expect(ctrl.nextUrl).toBe("u1");
    expect(pending).toBe(3);

    unlockMineMotionProbeFlight(ctrl, 1);
    settled.push(1);
    expect(index).toBe(2);
    expect(ctrl.nextUrl).toBe("u2");

    unlockMineMotionProbeFlight(ctrl, 2);
    settled.push(2);
    expect(index).toBe(3);
    expect(ctrl.nextUrl).toBe("u3");

    unlockMineMotionProbeFlight(ctrl, 3);
    settled.push(3);
    expect(pending).toBe(null);
    expect(active).toBe(false);
    expect(ctrl.prevUrl).toBe("u2");
    expect(settled).toEqual([1, 2, 3]);
  });

  it("force unlock clears open swipe (cleanup/reInit)", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    lockMineMotionProbeFlight(ctrl, 1);
    expect(
      unlockMineMotionProbeFlight(ctrl, undefined, { force: true })
    ).toBe(true);
    expect(ctrl.flightLocked).toBe(false);
  });

  it("early React destination apply cannot overwrite flight media", () => {
    const ctrl = createMineMotionProbeController("proxy");
    attachResync(ctrl);
    prepareMineMotionProbeProgrammaticFlight(ctrl, 2, 1);
    expect(
      applyMineMotionProbeAdjacentMedia(
        ctrl,
        mineMotionProbeAdjacentAtIndex(urls, 1)
      )
    ).toBe(false);
    expect(ctrl.prevUrl).toBe("u1");
  });
});
