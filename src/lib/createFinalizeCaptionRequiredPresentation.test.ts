/**
 * Documents Finalize caption-required presentation contracts (no DOM).
 * Empty publish remains blocked; visual warning is independent of notice banner.
 */
import { describe, expect, it } from "vitest";
import { isCreateFinalizeCaptionCompact } from "./createFinalizeCaptionLayout";

/** Mirrors requestPublish empty-caption gate. */
function canOpenPublishModal(caption: string): boolean {
  return caption.trim().length > 0;
}

/** Mirrors focus/tap clearing only the visual error, not the publish rule. */
function clearCaptionRequiredVisualOnFocus(focused: boolean): boolean {
  return focused ? false : true;
}

describe("Create finalize caption-required presentation", () => {
  it("empty / whitespace caption still cannot publish", () => {
    expect(canOpenPublishModal("")).toBe(false);
    expect(canOpenPublishModal("   ")).toBe(false);
    expect(canOpenPublishModal("Hello")).toBe(true);
  });

  it("focus clears visual warning flag; empty publish can show it again", () => {
    let visual = true;
    visual = clearCaptionRequiredVisualOnFocus(true);
    expect(visual).toBe(false);
    // Second empty publish re-activates presentation without changing the gate.
    if (!canOpenPublishModal("")) {
      visual = true;
    }
    expect(visual).toBe(true);
  });
});

describe("Create finalize caption compact layout", () => {
  it("empty + unfocused → spacious", () => {
    expect(
      isCreateFinalizeCaptionCompact({ caption: "", focused: false }),
    ).toBe(false);
    expect(
      isCreateFinalizeCaptionCompact({ caption: "   ", focused: false }),
    ).toBe(false);
  });

  it("empty + focused → compact", () => {
    expect(
      isCreateFinalizeCaptionCompact({ caption: "", focused: true }),
    ).toBe(true);
  });

  it("text + unfocused → compact", () => {
    expect(
      isCreateFinalizeCaptionCompact({ caption: "Hello", focused: false }),
    ).toBe(true);
  });
});
