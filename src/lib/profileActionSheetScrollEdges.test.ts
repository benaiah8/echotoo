import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROFILE_ACTION_SHEET_SCROLL_EDGE_THRESHOLD_PX,
  deriveProfileActionSheetScrollEdges,
} from "./profileActionSheetScrollEdges";

describe("deriveProfileActionSheetScrollEdges", () => {
  const t = PROFILE_ACTION_SHEET_SCROLL_EDGE_THRESHOLD_PX;

  it("non-scrollable → false / false", () => {
    expect(deriveProfileActionSheetScrollEdges(0, 200, 200)).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    });
    expect(deriveProfileActionSheetScrollEdges(0, 200, 198)).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    });
  });

  it("at top with overflow → false / true", () => {
    expect(deriveProfileActionSheetScrollEdges(0, 500, 200)).toEqual({
      canScrollUp: false,
      canScrollDown: true,
    });
  });

  it("in middle → true / true", () => {
    expect(deriveProfileActionSheetScrollEdges(120, 500, 200)).toEqual({
      canScrollUp: true,
      canScrollDown: true,
    });
  });

  it("at bottom → true / false", () => {
    expect(deriveProfileActionSheetScrollEdges(300, 500, 200)).toEqual({
      canScrollUp: true,
      canScrollDown: false,
    });
  });

  it("tiny fractional values inside threshold do not flicker", () => {
    expect(deriveProfileActionSheetScrollEdges(t, 500, 200).canScrollUp).toBe(
      false,
    );
    expect(
      deriveProfileActionSheetScrollEdges(t + 0.1, 500, 200).canScrollUp,
    ).toBe(true);
    // Near bottom within threshold
    const nearBottom = 500 - 200 - t;
    expect(
      deriveProfileActionSheetScrollEdges(nearBottom, 500, 200).canScrollDown,
    ).toBe(false);
    expect(
      deriveProfileActionSheetScrollEdges(nearBottom - 0.5, 500, 200)
        .canScrollDown,
    ).toBe(true);
  });
});

describe("ProfileTopBar own action sheet scroll-edge source", () => {
  const hero = readFileSync(
    join(process.cwd(), "src/components/profile/ProfileTopBar.tsx"),
    "utf8",
  );

  it("uses pointer-events-none on top and bottom fades", () => {
    expect(hero).toContain('data-profile-action-sheet-fade="top"');
    expect(hero).toContain('data-profile-action-sheet-fade="bottom"');
    expect(hero).toMatch(
      /data-profile-action-sheet-fade="top"[\s\S]{0,220}pointer-events-none/,
    );
    expect(hero).toMatch(
      /data-profile-action-sheet-fade="bottom"[\s\S]{0,220}pointer-events-none/,
    );
  });

  it("does not alter overlay background scroll lock wiring", () => {
    expect(hero).toContain(
      "useOverlayBackgroundScrollLock(ownProfileActionSheetOpen)",
    );
  });

  it("keeps Other Profile compact menu path separate", () => {
    expect(hero).toContain("!useOwnProfileActionSheet");
  });
});
