import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PEOPLE_ACTION_CIRCLE_PX,
  PEOPLE_BACK_EDGE_INSET_PX,
  PEOPLE_BACK_SIZE_PX,
  PEOPLE_CENTER_H_PX,
  PEOPLE_CENTER_PAD_X_PX,
  PEOPLE_CENTER_PAD_Y_PX,
  PEOPLE_CENTER_RING_PX,
  PEOPLE_CENTER_W_CSS,
  PEOPLE_END_BTN_OUTER_H_PX,
  PEOPLE_END_BTN_OUTER_W_PX,
  PEOPLE_END_FACE_W_CSS,
  PEOPLE_END_HOUSING_H_PX,
  PEOPLE_END_HOUSING_PAD_X_PX,
  PEOPLE_END_HOUSING_PAD_Y_PX,
  PEOPLE_END_HOUSING_W_PX,
  PEOPLE_FLUID_CENTER_RAISE_PX,
  PEOPLE_PRIMARY_HOUSING_RADIUS_CSS,
  PEOPLE_PRIMARY_TO_CENTER_GAP_PX,
  PEOPLE_SHELL_ACTION_DETACHED,
  PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX,
  PEOPLE_SHELL_HAS_END_HOUSINGS,
  PEOPLE_SHELL_HAS_PRIMARY_SHELVES,
  PEOPLE_SHELL_MINE_TOP_RECLAIM_PX,
  peopleShellContentTopPad,
  peopleShellMineContentTopPad,
} from "./peopleShellLayout";
import { PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX } from "../../lib/people/peopleCandidateMediaPresentation";
import { SOCIAL_PILL_RADIUS } from "../../lib/socialActionUi";
import {
  peopleNavPrimaryExtrusionClassName,
  peopleNavPrimaryFaceClassName,
  peopleNavPrimaryFaceRadiusToken,
  peopleNavPrimaryHitClassName,
  peopleNavPrimaryHousingClassName,
} from "./peopleNavPrimaryUi";

describe("peopleShellLayout V12 flat primary nav", () => {
  it("keeps shelves/end housings off; flat primary on", () => {
    expect(PEOPLE_SHELL_HAS_PRIMARY_SHELVES).toBe(false);
    expect(PEOPLE_SHELL_HAS_END_HOUSINGS).toBe(false);
  });

  it("Mine content top pad matches Back top; Discover keeps Back-row reserve", () => {
    expect(PEOPLE_SHELL_MINE_TOP_RECLAIM_PX).toBe(
      PEOPLE_BACK_SIZE_PX + PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX
    );
    expect(PEOPLE_SHELL_MINE_TOP_RECLAIM_PX).toBe(
      PEOPLE_MINE_SOURCE_BACK_ALIGN_TOP_PX
    );
    expect(peopleShellMineContentTopPad()).toBe(
      `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px)`
    );
    expect(peopleShellContentTopPad()).toBe(
      `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px + ${PEOPLE_BACK_SIZE_PX}px + ${PEOPLE_SHELL_CONTENT_BELOW_BACK_GAP_PX}px)`
    );
  });

  it("keeps geometry / raise / Connect stable", () => {
    expect(PEOPLE_CENTER_W_CSS).toBe("min(440px, calc(100% - 20px))");
    expect(PEOPLE_CENTER_H_PX).toBe(50);
    expect(PEOPLE_CENTER_PAD_X_PX).toBe(5);
    expect(PEOPLE_CENTER_PAD_Y_PX).toBe(5);
    expect(PEOPLE_SHELL_ACTION_DETACHED).toBe(true);
    expect(PEOPLE_ACTION_CIRCLE_PX).toBe(72);
    expect(PEOPLE_PRIMARY_TO_CENTER_GAP_PX).toBe(6);
    expect(PEOPLE_FLUID_CENTER_RAISE_PX).toBe(0);
    expect(PEOPLE_CENTER_RING_PX).toBe(2);
    expect(PEOPLE_END_HOUSING_PAD_X_PX).toBe(3);
    expect(PEOPLE_END_HOUSING_PAD_Y_PX).toBe(2);
    expect(PEOPLE_END_HOUSING_H_PX).toBe(40);
    expect(PEOPLE_END_HOUSING_W_PX).toBe(81);
    expect(PEOPLE_END_BTN_OUTER_H_PX).toBe(36);
    expect(PEOPLE_END_BTN_OUTER_W_PX).toBe(75);
    expect(PEOPLE_PRIMARY_HOUSING_RADIUS_CSS).toBe("rounded-full");
  });
});

describe("peopleNavPrimaryUi V11.4 outline frames", () => {
  it("uses transparent outline-only cradles with lighter dark borders", () => {
    const duo = peopleNavPrimaryHousingClassName("left");
    const groups = peopleNavPrimaryHousingClassName("right");
    expect(duo).toBe(groups);
    expect(duo).toContain("bg-transparent");
    expect(duo).toContain("rounded-full");
    expect(duo).toContain("border-[rgba(11,11,12,0.22)]");
    expect(duo).toContain("app-dark:border-[rgba(255,255,255,0.42)]");
    expect(duo).not.toContain("color-mix(in_oklab,var(--surface)");
  });

  it("keeps Feed inner button construction unchanged", () => {
    expect(PEOPLE_END_FACE_W_CSS).toBe("4.375rem");
    expect(peopleNavPrimaryFaceRadiusToken()).toBe(SOCIAL_PILL_RADIUS);
    expect(peopleNavPrimaryFaceClassName(true)).toContain("bg-[#F7D047]");
    expect(peopleNavPrimaryFaceClassName(true)).toContain("app-dark:bg-[var(--brand)]");
    expect(peopleNavPrimaryFaceClassName(false)).toContain("bg-[#FFE5A0]");
    expect(peopleNavPrimaryFaceClassName(false)).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--brand)_68%,var(--text))]"
    );
    expect(peopleNavPrimaryExtrusionClassName(true)).toContain("bg-[#21945C]");
    expect(peopleNavPrimaryExtrusionClassName(true)).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--green-text)_90%,#0a0a0a)]"
    );
    expect(peopleNavPrimaryHitClassName()).toContain("w-[calc(4.375rem+5px)]");
  });
});

describe("BottomTab People hide contract", () => {
  it("keeps instant People hide; Create does not hide BottomTab chrome", () => {
    const src = readFileSync(
      resolve(__dirname, "../../components/BottomTab.tsx"),
      "utf8"
    );
    expect(src).toContain(
      "invisible pointer-events-none opacity-0 !transition-none"
    );
    expect(src).toContain("hidePeopleNav");
    expect(src).not.toContain("hideComposerNav");
    expect(src).not.toContain("isCreateFinalizeComposerPath");
    expect(src).not.toContain("chromeVisibilityClass");
  });
});

describe("Create finalize shell layering", () => {
  it("stacks finalize shell above BottomTab z-40", () => {
    const chrome = readFileSync(
      resolve(__dirname, "../../lib/createFlowChrome.ts"),
      "utf8"
    );
    const shell = readFileSync(
      resolve(
        __dirname,
        "../../components/create/CreateFinalizeComposerShell.tsx"
      ),
      "utf8"
    );
    expect(chrome).toContain('CREATE_FINALIZE_SHELL_Z_CLASS = "z-[41]"');
    expect(shell).toContain("CREATE_FINALIZE_SHELL_Z_CLASS");
  });

  it("optimistic exit hides shell only after approved leave go()", () => {
    const page = readFileSync(
      resolve(__dirname, "../../pages/CreateFinalizePage.tsx"),
      "utf8"
    );
    const shell = readFileSync(
      resolve(
        __dirname,
        "../../components/create/CreateFinalizeComposerShell.tsx"
      ),
      "utf8"
    );
    expect(page).toContain("flushSync");
    expect(page).toContain("setIsExiting(true)");
    expect(page).toContain("dispatchCreateFlowLeaveRequest(() => {");
    expect(shell).toContain("exiting");
    expect(shell).toContain(
      "pointer-events-none invisible opacity-0 !transition-none"
    );
  });
});
