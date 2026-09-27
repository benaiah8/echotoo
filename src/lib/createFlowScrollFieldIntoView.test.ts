import { describe, expect, it } from "vitest";
import {
  computeFinalizeSectionChromePx,
  computeFinalizeSectionSafeBottomPx,
} from "./createFlowScrollFieldIntoView";

describe("Finalize section scroll chrome", () => {
  it("uses actions-total + keyboard + gap without double-counting toolbar height", () => {
    expect(
      computeFinalizeSectionChromePx({
        actionsTotalBottomPx: 72,
        keyboardInsetPx: 280,
        gapPx: 12,
      }),
    ).toBe(72 + 280 + 12);
  });

  it("treats missing keyboard as closed chrome only", () => {
    expect(
      computeFinalizeSectionChromePx({
        actionsTotalBottomPx: 96,
        keyboardInsetPx: 0,
      }),
    ).toBe(96 + 12);
  });

  it("computes safe bottom from visual viewport band", () => {
    expect(
      computeFinalizeSectionSafeBottomPx({
        viewportTop: 0,
        viewportHeight: 700,
        actionsTotalBottomPx: 72,
        keyboardInsetPx: 280,
        gapPx: 12,
      }),
    ).toBe(700 - (72 + 280 + 12));
  });

  it("respects visualViewport offsetTop", () => {
    expect(
      computeFinalizeSectionSafeBottomPx({
        viewportTop: 40,
        viewportHeight: 600,
        actionsTotalBottomPx: 80,
        keyboardInsetPx: 0,
        gapPx: 12,
      }),
    ).toBe(40 + 600 - (80 + 12));
  });
});
