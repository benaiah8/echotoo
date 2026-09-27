import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/backgroundScrollLock", () => ({
  scrollDocumentByWhileLocked: vi.fn((delta: number) => delta),
}));

import { scrollDocumentByWhileLocked } from "../../lib/backgroundScrollLock";
import {
  computeSocialScrollDelta,
  ensureSocialTargetInSafeViewport,
  socialTargetNeedsSafeViewportMove,
  type SocialSafeViewport,
} from "./homeTourSocialViewport";

function rect(partial: {
  top: number;
  height?: number;
  bottom?: number;
}): DOMRect {
  const height = partial.height ?? 40;
  const top = partial.top;
  const bottom = partial.bottom ?? top + height;
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

const vp: SocialSafeViewport = {
  top: 100,
  bottom: 700,
  tabTop: 720,
};

function stubSocialChrome() {
  const chrome = {
    getBoundingClientRect: () =>
      ({
        ...rect({ top: 0, height: 84 }),
        bottom: 84,
      }) as DOMRect,
  };
  const tab = {
    getBoundingClientRect: () =>
      ({
        ...rect({ top: 720, height: 80 }),
        top: 720,
        bottom: 800,
      }) as DOMRect,
  };
  vi.stubGlobal("window", { innerHeight: 800 });
  vi.stubGlobal("document", {
    querySelector: (sel: string) =>
      sel.includes("home-search-filters") ? chrome : null,
    getElementById: (id: string) => (id === "bottom-tab" ? tab : null),
  });
}

describe("homeTourSocialViewport", () => {
  beforeEach(() => {
    vi.mocked(scrollDocumentByWhileLocked).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A: target below safe band yields positive scroll delta (center band)", () => {
    const delta = computeSocialScrollDelta(rect({ top: 880, height: 40 }), vp);
    expect(delta).toBeGreaterThan(200);
  });

  it("C: already-centered cluster needs no move", () => {
    expect(computeSocialScrollDelta(rect({ top: 380, height: 40 }), vp)).toBe(
      0
    );
  });

  it("G: tall-media / under-tab prefers clearing BottomTab", () => {
    const delta = computeSocialScrollDelta(rect({ top: 690, height: 40 }), vp);
    expect(delta).toBeGreaterThanOrEqual(30);
  });

  it("D/E: lock-aware scroll when below band; skip when already centered", () => {
    stubSocialChrome();

    const pillTop = { current: 380 };
    const pill = {
      getBoundingClientRect: () => rect({ top: pillTop.current, height: 40 }),
    };
    const cluster = {
      querySelector: (sel: string) =>
        String(sel).includes('duo"]') || String(sel).includes("duo")
          ? (pill as unknown as Element)
          : null,
      getBoundingClientRect: () =>
        rect({ top: pillTop.current, height: 40 }),
    } as unknown as Element;

    const good = ensureSocialTargetInSafeViewport(cluster, "duo");
    expect(good.didScroll).toBe(false);
    expect(scrollDocumentByWhileLocked).not.toHaveBeenCalled();
    expect(socialTargetNeedsSafeViewportMove(cluster, "duo")).toBe(false);

    pillTop.current = 900;
    const bad = ensureSocialTargetInSafeViewport(cluster, "duo");
    expect(bad.didScroll).toBe(true);
    expect(scrollDocumentByWhileLocked).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(scrollDocumentByWhileLocked).mock.calls[0]![0]
    ).toBeGreaterThan(100);
  });
});
