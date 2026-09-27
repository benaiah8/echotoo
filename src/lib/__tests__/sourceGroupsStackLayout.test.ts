import { describe, expect, it } from "vitest";
import {
  shouldTopAlignGroupStack,
  SOURCE_GROUPS_STACK_TOP_ALIGN_RATIO,
} from "../sourceGroupsStackLayout";

describe("shouldTopAlignGroupStack", () => {
  it("centers when stack is under 90% of viewport", () => {
    expect(shouldTopAlignGroupStack(500, 700)).toBe(false);
    expect(shouldTopAlignGroupStack(620, 700)).toBe(false);
  });

  it("top-aligns at exactly 90%", () => {
    expect(shouldTopAlignGroupStack(630, 700)).toBe(true);
    expect(630 / 700).toBeCloseTo(SOURCE_GROUPS_STACK_TOP_ALIGN_RATIO);
  });

  it("top-aligns when stack exceeds viewport", () => {
    expect(shouldTopAlignGroupStack(800, 700)).toBe(true);
  });

  it("stays centered for invalid or empty geometry", () => {
    expect(shouldTopAlignGroupStack(0, 700)).toBe(false);
    expect(shouldTopAlignGroupStack(100, 0)).toBe(false);
    expect(shouldTopAlignGroupStack(Number.NaN, 700)).toBe(false);
  });
});
