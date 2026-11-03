import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyHomeBrowseScrollRestore,
  clampHomeBrowseScrollY,
  getHomeBrowseScrollPosition,
  homeBrowseScrollStorageKey,
  resolveHomeBrowseScrollYForLeave,
  resolveHomeBrowseScrollYForRestore,
  saveHomeBrowseScrollPosition,
  shouldTrackHomeBrowseWindowScroll,
} from "./homeBrowseScrollPosition";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("homeBrowseScrollPosition", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores and reads per feed-key scroll Y", () => {
    saveHomeBrowseScrollPosition("feed-a", 420);
    saveHomeBrowseScrollPosition("feed-b", 80);
    expect(getHomeBrowseScrollPosition("feed-a")).toBe(420);
    expect(getHomeBrowseScrollPosition("feed-b")).toBe(80);
    expect(homeBrowseScrollStorageKey("feed-a")).toBe("home_scroll:feed-a");
  });

  it("leaving Home prefers tracked Y over collapsed window Y", () => {
    expect(
      resolveHomeBrowseScrollYForLeave({ latestY: 640, windowY: 0 })
    ).toBe(640);
    expect(
      resolveHomeBrowseScrollYForLeave({ latestY: 0, windowY: 120 })
    ).toBe(120);
    expect(
      resolveHomeBrowseScrollYForLeave({ latestY: 0, windowY: 0 })
    ).toBe(0);
  });

  it("does not let rapid zero window overwrite a valid tracked Y", () => {
    const saved = resolveHomeBrowseScrollYForLeave({
      latestY: 900,
      windowY: 0,
    });
    expect(saved).toBe(900);
    saveHomeBrowseScrollPosition("feed-rapid", saved);
    // Simulated hidden-tab scroll noise must not be treated as Home tracking.
    expect(
      shouldTrackHomeBrowseWindowScroll({
        isHomeTabActive: false,
        homePostSearchActive: false,
      })
    ).toBe(false);
    expect(getHomeBrowseScrollPosition("feed-rapid")).toBe(900);
  });

  it("restore prefers in-memory Y then storage", () => {
    expect(
      resolveHomeBrowseScrollYForRestore({ latestY: 300, storedY: 10 })
    ).toBe(300);
    expect(
      resolveHomeBrowseScrollYForRestore({ latestY: 0, storedY: 250 })
    ).toBe(250);
  });

  it("intentional clear to 0 is authoritative for a feed key", () => {
    saveHomeBrowseScrollPosition("feed-reset", 500);
    saveHomeBrowseScrollPosition("feed-reset", 0);
    expect(getHomeBrowseScrollPosition("feed-reset")).toBe(0);
    expect(
      resolveHomeBrowseScrollYForRestore({ latestY: 0, storedY: 0 })
    ).toBe(0);
  });

  it("clamps restore to available document range", () => {
    expect(clampHomeBrowseScrollY(500, 200)).toBe(200);
    expect(clampHomeBrowseScrollY(50, 200)).toBe(50);
    expect(clampHomeBrowseScrollY(50, 0)).toBe(0);
  });

  it("apply restore skips when document height is not ready", () => {
    const scrollTo = vi.fn();
    expect(applyHomeBrowseScrollRestore(400, scrollTo, 0)).toBe(-1);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(applyHomeBrowseScrollRestore(400, scrollTo, 250)).toBe(250);
    expect(scrollTo).toHaveBeenCalledWith(250);
  });

  it("tracks window scroll only while Home browse is visible", () => {
    expect(
      shouldTrackHomeBrowseWindowScroll({
        isHomeTabActive: true,
        homePostSearchActive: false,
      })
    ).toBe(true);
    expect(
      shouldTrackHomeBrowseWindowScroll({
        isHomeTabActive: false,
        homePostSearchActive: false,
      })
    ).toBe(false);
    expect(
      shouldTrackHomeBrowseWindowScroll({
        isHomeTabActive: true,
        homePostSearchActive: true,
      })
    ).toBe(false);
  });
});
