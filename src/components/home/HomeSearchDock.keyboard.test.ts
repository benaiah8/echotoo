/**
 * Home search dock keyboard clearance. Positioning is a pure function;
 * vitest here is node (no DOM).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getHomeSearchDockBottom,
  getHomeSearchOverlayPaddingBottom,
} from "./HomeSearchDock";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const CLOSED_WEB_SEAT = "8px";
const OPEN_GAP = "12px";

describe("Home search dock keyboard seat", () => {
  it("keeps the closed seat when the keyboard is closed and inset is ~0", () => {
    expect(getHomeSearchDockBottom(0, false)).toBe(CLOSED_WEB_SEAT);
    expect(getHomeSearchDockBottom(0.4, false)).toBe(CLOSED_WEB_SEAT);
  });

  it("keeps the legacy closed-path lift when inset is positive but the keyboard flag is closed", () => {
    expect(getHomeSearchDockBottom(100, false)).toBe("calc(100px + 0.375rem)");
    expect(getHomeSearchOverlayPaddingBottom(0, false)).toBe(
      "calc(64px + var(--safe-area-bottom-layout, 0px))",
    );
  });

  it("opens with a 12px gap when the inset is ~0", () => {
    expect(getHomeSearchDockBottom(0, true)).toBe(`calc(0px + ${OPEN_GAP})`);
    expect(getHomeSearchDockBottom(0.2, true)).toBe(`calc(0px + ${OPEN_GAP})`);
    expect(getHomeSearchOverlayPaddingBottom(0, true)).toBe(
      `calc(64px + calc(0px + ${OPEN_GAP}))`,
    );
  });

  it("opens at inset plus the 12px gap", () => {
    expect(getHomeSearchDockBottom(280, true)).toBe(`calc(280px + ${OPEN_GAP})`);
    expect(getHomeSearchDockBottom(280.6, true)).toBe(
      `calc(281px + ${OPEN_GAP})`,
    );
    expect(getHomeSearchOverlayPaddingBottom(280, true)).toBe(
      `calc(64px + calc(280px + ${OPEN_GAP}))`,
    );
  });

  it("returns to the closed seat after the keyboard closes", () => {
    expect(getHomeSearchDockBottom(320, true)).toBe(`calc(320px + ${OPEN_GAP})`);
    expect(getHomeSearchDockBottom(0, false)).toBe(CLOSED_WEB_SEAT);
    expect(getHomeSearchOverlayPaddingBottom(0, false)).toBe(
      "calc(64px + var(--safe-area-bottom-layout, 0px))",
    );
  });
});

describe("Home search dock keyboard wiring", () => {
  it("does not branch the open seat by platform or device", () => {
    const src = read("src/components/home/HomeSearchDock.tsx");
    const openFn = src.slice(
      src.indexOf("function keyboardOpenDockBottom"),
      src.indexOf("export function getHomeSearchDockBottom"),
    );
    expect(openFn).toContain("SEARCH_DOCK_KEYBOARD_OPEN_GAP_PX");
    expect(openFn).not.toMatch(
      /isIOS|isAndroid|iPhone|safe-area|userAgent|getPlatform/,
    );
    expect(src).toContain("if (keyboardOpen) return keyboardOpenDockBottom");
  });

  it("still wires Posts, Users, and Back on the dock", () => {
    const src = read("src/components/home/HomeSearchDock.tsx");
    expect(src).toContain('onClick={() => onSearchModeChange("posts")}');
    expect(src).toContain('onClick={() => onSearchModeChange("users")}');
    expect(src).toContain("Search posts");
    expect(src).toContain("Search users");
    expect(src).toContain("onClick={onBack}");
    expect(src).toContain('aria-label="Back"');
    expect(src).toContain("aria-pressed={searchMode === \"posts\"}");
    expect(src).toContain("aria-pressed={searchMode === \"users\"}");
  });

  it("still hides the bottom tab while Home search is active", () => {
    const page = read("src/pages/HomePage.tsx");
    expect(page).toContain(
      "const hide = isHomeTabActive && homePostSearchActive;",
    );
    expect(page).toContain("setHomeSearchTabChromeHidden(hide);");
  });

  it("does not change useCreateKeyboardInset", () => {
    const hook = read("src/hooks/useCreateKeyboardInset.ts");
    expect(hook).toContain("export function useCreateKeyboardInset");
    expect(hook).toContain("if (vvInset > OPEN_THRESHOLD_PX) return vvInset;");
    expect(hook).not.toContain("HomeSearch");
    expect(hook).not.toContain("SEARCH_DOCK_KEYBOARD_OPEN_GAP");
    const dock = read("src/components/home/HomeSearchDock.tsx");
    expect(dock).toContain(
      "const { keyboardInsetPx, keyboardOpen } = useCreateKeyboardInset();",
    );
  });
});
