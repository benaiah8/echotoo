import { describe, expect, it } from "vitest";
import {
  socialDuoFaceStableWidthClassName,
  socialGroupFaceStableWidthClassName,
  socialCountClassName,
} from "../socialActionUi";

describe("social shelf stable footprints", () => {
  it("Duo face uses a stable min-width slot", () => {
    expect(socialDuoFaceStableWidthClassName("feed")).toContain("min-w-");
    expect(socialDuoFaceStableWidthClassName("compact")).toContain("min-w-");
    expect(socialDuoFaceStableWidthClassName("dock")).toBe(
      socialDuoFaceStableWidthClassName("feed")
    );
  });

  it("Group face min-width is compact (word-only; count adds width when present)", () => {
    const duo = socialDuoFaceStableWidthClassName("feed");
    const group = socialGroupFaceStableWidthClassName("feed");
    expect(group).toContain("min-w-");
    expect(group).toBe("min-w-[3.25rem]");
    expect(duo).toBe("min-w-[2.75rem]");
  });

  it("count badge classes stay circular without placeholder reservation", () => {
    const shown = socialCountClassName({ tone: "inactive", value: 3 });
    expect(shown).toContain("h-[18px]");
    expect(shown).toContain("w-[18px]");
    expect(shown).not.toContain("invisible");
  });
});
