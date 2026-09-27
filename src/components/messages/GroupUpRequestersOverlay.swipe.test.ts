import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Mirrors useOverlayContentSwipeDismiss start-zone + lock/commit rules used by
 * GroupUpRequestersOverlay, so desktop panel-center swipes can be asserted
 * without a jsdom React harness.
 */
function startZoneMaxClientX(
  innerWidth: number,
  startZoneMaxXVw: number,
  startZoneMaxPx: number,
  leftInsetPx: number
): number {
  return leftInsetPx + Math.min(innerWidth * startZoneMaxXVw, startZoneMaxPx);
}

function centeredMaxLgPanelLeft(innerWidth: number): number {
  const contentPad = 12;
  const panelWidth = Math.min(512, innerWidth - contentPad * 2);
  return contentPad + (innerWidth - contentPad * 2 - panelWidth) / 2;
}

const VERTICAL_SLOP_PX = 20;
const VERTICAL_DOMINANCE_OVER_DX = 1.5;
const LEFTWARD_CANCEL_DX = 8;

type Pointer = { x: number; y: number; target: "panel" | "button" };

function simulateRequesterSwipe(opts: {
  innerWidth: number;
  startZoneMaxXVw: number;
  startZoneMaxPx: number;
  leftInsetPx: number;
  commitThresholdPx: number;
  horizontalLockPx: number;
  down: Pointer;
  moves: Array<{ x: number; y: number }>;
  up: { x: number; y: number };
}): "committed" | "ignored" | "cancelled" | "snapback" {
  if (opts.down.target === "button") return "ignored";
  const maxX = startZoneMaxClientX(
    opts.innerWidth,
    opts.startZoneMaxXVw,
    opts.startZoneMaxPx,
    opts.leftInsetPx
  );
  if (opts.down.x > maxX) return "ignored";

  let mode: "undecided" | "horizontal" | "cancelled" = "undecided";
  const startX = opts.down.x;
  const startY = opts.down.y;
  const points = [...opts.moves, opts.up];

  for (const point of points) {
    const dx = point.x - startX;
    const dy = point.y - startY;
    if (mode !== "undecided") continue;
    if (dx < -LEFTWARD_CANCEL_DX) {
      mode = "cancelled";
      continue;
    }
    if (dx >= opts.horizontalLockPx && dx > Math.abs(dy)) {
      mode = "horizontal";
      continue;
    }
    if (
      Math.abs(dy) > VERTICAL_SLOP_PX &&
      Math.abs(dy) >= Math.abs(dx) * VERTICAL_DOMINANCE_OVER_DX &&
      dx < opts.horizontalLockPx
    ) {
      mode = "cancelled";
    }
  }

  if (mode !== "horizontal") {
    return mode === "cancelled" ? "cancelled" : "ignored";
  }
  const releaseDx = opts.up.x - startX;
  return releaseDx >= opts.commitThresholdPx ? "committed" : "snapback";
}

const OLD = {
  startZoneMaxXVw: 0.45,
  startZoneMaxPx: 180,
  leftInsetPx: 12,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

const NEW = {
  startZoneMaxXVw: 1,
  startZoneMaxPx: 10000,
  leftInsetPx: 0,
  commitThresholdPx: 48,
  horizontalLockPx: 12,
} as const;

describe("GroupUpRequestersOverlay swipe start zone", () => {
  it("uses a panel-wide start zone instead of Post Detail's viewport-left 180px cap", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/messages/GroupUpRequestersOverlay.tsx"),
      "utf8"
    );
    expect(src).toContain("startZoneMaxXVw: 1");
    expect(src).toContain("startZoneMaxPx: 10000");
    expect(src).toContain("leftInsetPx: 0");
    expect(src).not.toContain("startZoneMaxXVw: 0.45");
    expect(src).not.toContain("startZoneMaxPx: 180");
  });

  it("old Post Detail zone misses a centered drawer panel on a desktop-width viewport", () => {
    const innerWidth = 849;
    const panelLeft = centeredMaxLgPanelLeft(innerWidth);
    const panelCenter = panelLeft + 256;
    const oldMax = startZoneMaxClientX(
      innerWidth,
      OLD.startZoneMaxXVw,
      OLD.startZoneMaxPx,
      OLD.leftInsetPx
    );
    expect(oldMax).toBe(192);
    expect(panelLeft).toBeGreaterThan(160);
    expect(panelCenter).toBeGreaterThan(oldMax);
  });

  it("pointerdown at panel center + 60px right + pointerup commits with the overlay zone", () => {
    const innerWidth = 849;
    const panelCenterX = centeredMaxLgPanelLeft(innerWidth) + 256;
    const down = { x: panelCenterX, y: 400, target: "panel" as const };
    const up = { x: panelCenterX + 60, y: 400 };
    expect(
      simulateRequesterSwipe({
        innerWidth,
        ...OLD,
        down,
        moves: [{ x: panelCenterX + 20, y: 400 }],
        up,
      })
    ).toBe("ignored");
    expect(
      simulateRequesterSwipe({
        innerWidth,
        ...NEW,
        down,
        moves: [{ x: panelCenterX + 20, y: 400 }],
        up,
      })
    ).toBe("committed");
  });

  it("does not dismiss a short swipe, a leftward swipe, or a vertical scroll", () => {
    const innerWidth = 390;
    const start = { x: 80, y: 400, target: "panel" as const };
    expect(
      simulateRequesterSwipe({
        innerWidth,
        ...NEW,
        down: start,
        moves: [{ x: 100, y: 400 }],
        up: { x: 110, y: 400 },
      })
    ).toBe("snapback");
    expect(
      simulateRequesterSwipe({
        innerWidth,
        ...NEW,
        down: start,
        moves: [{ x: 60, y: 400 }],
        up: { x: 40, y: 400 },
      })
    ).toBe("cancelled");
    expect(
      simulateRequesterSwipe({
        innerWidth,
        ...NEW,
        down: start,
        moves: [{ x: 84, y: 440 }],
        up: { x: 86, y: 480 },
      })
    ).toBe("cancelled");
  });

  it("ignores gestures that start on Accept/Decline/profile buttons", () => {
    expect(
      simulateRequesterSwipe({
        innerWidth: 390,
        ...NEW,
        down: { x: 80, y: 500, target: "button" },
        moves: [{ x: 140, y: 500 }],
        up: { x: 160, y: 500 },
      })
    ).toBe("ignored");
  });

  it("does not commit if the pointer is cancelled before horizontal lock", () => {
    expect(
      simulateRequesterSwipe({
        innerWidth: 390,
        ...NEW,
        down: { x: 80, y: 400, target: "panel" },
        moves: [{ x: 81, y: 400 }],
        up: { x: 81, y: 400 },
      })
    ).toBe("ignored");
  });
});
