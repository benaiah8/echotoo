/**
 * Published immersive fullscreen — native status-bar hide/restore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedImmersiveStatusBarForTests,
  __setPublishedImmersiveStatusBarApiForTests,
  enterPublishedImmersiveStatusBar,
  exitPublishedImmersiveStatusBar,
  flushPublishedImmersiveStatusBarForTests,
  getPublishedImmersiveStatusBarDesired,
  isPublishedImmersiveStatusBarSessionActive,
} from "./publishedImmersiveStatusBar";
import { shouldUsePublishedImmersiveFullscreenChrome } from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("publishedImmersiveStatusBar", () => {
  let hideCalls: number;
  let showCalls: number;
  let hideReject: boolean;
  let showReject: boolean;
  let hideDelayMs: number;
  let showDelayMs: number;

  beforeEach(() => {
    __resetPublishedImmersiveStatusBarForTests();
    hideCalls = 0;
    showCalls = 0;
    hideReject = false;
    showReject = false;
    hideDelayMs = 0;
    showDelayMs = 0;
    __setPublishedImmersiveStatusBarApiForTests({
      hide: async () => {
        if (hideDelayMs > 0) {
          await new Promise((r) => setTimeout(r, hideDelayMs));
        }
        hideCalls += 1;
        if (hideReject) throw new Error("hide rejected");
      },
      show: async () => {
        if (showDelayMs > 0) {
          await new Promise((r) => setTimeout(r, showDelayMs));
        }
        showCalls += 1;
        if (showReject) throw new Error("show rejected");
      },
    });
  });

  afterEach(() => {
    __resetPublishedImmersiveStatusBarForTests();
  });

  it("B: open immersive → hide once", async () => {
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(hideCalls).toBe(1);
    expect(showCalls).toBe(0);
    expect(getPublishedImmersiveStatusBarDesired()).toBe("hidden");
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(true);
  });

  it("C: close → restore once", async () => {
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(hideCalls).toBe(1);
    expect(showCalls).toBe(1);
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(false);
  });

  it("F: rapid open/close → final desired visible", async () => {
    hideDelayMs = 30;
    showDelayMs = 30;
    enterPublishedImmersiveStatusBar();
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(false);
    expect(showCalls).toBeGreaterThanOrEqual(1);
  });

  it("G: repeated open/close sessions stay balanced", async () => {
    for (let i = 0; i < 3; i++) {
      enterPublishedImmersiveStatusBar();
      await flushPublishedImmersiveStatusBarForTests();
      exitPublishedImmersiveStatusBar();
      await flushPublishedImmersiveStatusBarForTests();
    }
    expect(hideCalls).toBe(3);
    expect(showCalls).toBe(3);
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
  });

  it("H: hide rejection does not throw / leaves session bookkeeping intact", async () => {
    hideReject = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(true);
    expect(getPublishedImmersiveStatusBarDesired()).toBe("hidden");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
  });

  it("I: restore rejection does not throw / close still completes", async () => {
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    showReject = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(false);
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("J: web / no api → safe no-op", async () => {
    __setPublishedImmersiveStatusBarApiForTests(null);
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(getPublishedImmersiveStatusBarDesired()).toBe("hidden");
    expect(isPublishedImmersiveStatusBarSessionActive()).toBe(true);
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(getPublishedImmersiveStatusBarDesired()).toBe("visible");
  });

  it("idempotent enter/exit", async () => {
    enterPublishedImmersiveStatusBar();
    enterPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(hideCalls).toBe(1);
    exitPublishedImmersiveStatusBar();
    exitPublishedImmersiveStatusBar();
    await flushPublishedImmersiveStatusBarForTests();
    expect(showCalls).toBe(1);
  });

  it("K: image-only immersive chrome is false → no hide policy", () => {
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({ containsVideo: false }),
    ).toBe(false);
  });

  it("L: mixed/video immersive chrome is true for session", () => {
    expect(
      shouldUsePublishedImmersiveFullscreenChrome({ containsVideo: true }),
    ).toBe(true);
  });
});

describe("published immersive status-bar architecture", () => {
  it("A/D/E: viewer owns open+immersive lifecycle (not per close path)", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("enterPublishedImmersiveStatusBar");
    expect(viewer).toContain("exitPublishedImmersiveStatusBar");
    expect(viewer).toMatch(
      /if\s*\(\s*!open\s*\|\|\s*!immersiveChrome\s*\)\s*return/,
    );
    expect(viewer).toMatch(
      /enterPublishedImmersiveStatusBar\(\);\s*return\s*\(\)\s*=>\s*\{\s*exitPublishedImmersiveStatusBar\(\);/,
    );
    // No scattered show/hide on close handlers
    expect(viewer).not.toContain("StatusBar.hide");
    expect(viewer).not.toContain("StatusBar.show");
  });

  it("M: PublishedVideoPlayer does not own status-bar", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("publishedImmersiveStatusBar");
    expect(player).not.toContain("enterPublishedImmersiveStatusBar");
    expect(player).not.toContain("@capacitor/status-bar");
  });

  it("N: continuity files unchanged (no status-bar imports)", () => {
    const files = [
      "src/lib/publishedMedia/publishedVideoFeedDetailHandoff.ts",
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
      "src/lib/publishedMedia/publishedVideoPlaybackSnapshot.ts",
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).not.toContain("publishedImmersiveStatusBar");
      expect(src).not.toContain("@capacitor/status-bar");
    }
  });

  it("O: Create fullscreen path unchanged (navigationUI, no StatusBar)", () => {
    const fs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(fs).toContain('navigationUI: "hide"');
    expect(fs).not.toMatch(/from\s+["']@capacitor\/status-bar["']/);
    expect(fs).not.toContain("enterPublishedImmersiveStatusBar");
    expect(fs).not.toContain("StatusBar.hide");
    expect(fs).not.toContain("StatusBar.show");
    const createPlayer = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(createPlayer).toContain("requestCreateFinalizeVideoFullscreen");
    expect(createPlayer).not.toContain("enterPublishedImmersiveStatusBar");
  });

  it("dependency present", () => {
    expect(read("package.json")).toContain("@capacitor/status-bar");
  });
});
