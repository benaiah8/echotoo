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

  it("A/B: own sheet keeps the scrim blur and drops per-pill backdrop-filter", () => {
    const pillStart = hero.indexOf("const ownSheetGlassPill =");
    const pill = hero.slice(pillStart, hero.indexOf(";", pillStart));
    expect(pill).toContain("bg-[var(--glass-bg)]");
    expect(pill).toContain("border-[var(--bottom-tab-border)]");
    expect(pill).toContain("rounded-full");
    expect(pill).toContain(
      "shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]",
    );
    expect(pill).not.toContain("backdrop-blur");
    expect(pill).not.toContain("backdrop-filter");
    expect(hero).toContain("bg-black/50 backdrop-blur-md");
    expect(hero).toContain("[backdrop-filter:blur(12px)]");
    expect(hero).toContain("[-webkit-backdrop-filter:blur(12px)]");

    const scrollStart = hero.indexOf('data-profile-action-sheet-scroll="true"');
    const fadeStart = hero.indexOf('data-profile-action-sheet-fade="top"');
    const scrollingPills = hero.slice(scrollStart, fadeStart);
    expect(scrollingPills).not.toContain("backdrop-blur");
    expect(scrollingPills).not.toContain("backdrop-filter");
    expect(scrollingPills).toContain("ownSheetGlassPill");
    expect(scrollingPills).toContain("ownSheetRowClass");
  });

  it("C/D: Other Profile menu and header search keep their blur", () => {
    expect(hero).toContain('backdropFilter: "blur(var(--glass-blur))"');
    expect(hero).toContain('WebkitBackdropFilter: "blur(var(--glass-blur))"');
    expect(hero).toContain("style={glassMenuSurface}");
    expect(hero).toContain(
      '"bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]"',
    );
  });

  it("E/F/G/H: row size, type, actions, and no device branch on the pill", () => {
    expect(hero).toContain("const ownSheetRowClass = `${ownSheetRowBase} h-10`");
    expect(hero).toContain(
      "text-[11px] font-medium leading-none",
    );
    expect(hero).toContain("onRequestEditProfile?.()");
    expect(hero).toContain("onRequestLogout?.()");
    expect(hero).toContain("onRequestDeleteAccount?.()");
    expect(hero).toContain("onRequestBlockList?.()");
    expect(hero).toContain("navigate(Paths.privacy)");
    expect(hero).toContain("navigate(Paths.terms)");
    const pillStart = hero.indexOf("const ownSheetGlassPill =");
    const pill = hero.slice(pillStart, hero.indexOf(";", pillStart));
    expect(pill).not.toMatch(/iPhone|isIOS|isAndroid|Android|slow phone/i);
  });
});
