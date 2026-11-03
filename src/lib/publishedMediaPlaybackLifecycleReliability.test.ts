/**
 * Published / create video lifecycle reliability — app background + idle manual-play race.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveIdlePublishedVideoCleanup,
  shouldAbortPublishedPlayBecauseNotActive,
  shouldTearDownIdlePublishedVideo,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("idle cleanup + stale async play", () => {
  it("force-pauses and tears down when idle even if manual play is in flight", () => {
    const idleInflight = resolveIdlePublishedVideoCleanup({
      isActive: false,
      isWarm: false,
      manualPlayInFlight: true,
    });
    expect(idleInflight.shouldCleanup).toBe(true);
    expect(idleInflight.forcePause).toBe(true);
    expect(idleInflight.clearPlayIntent).toBe(true);
    expect(idleInflight.tearDown).toBe(true);
    expect(
      shouldTearDownIdlePublishedVideo({ isActive: false, isWarm: false }),
    ).toBe(true);
  });

  it("does not cleanup while active or warm", () => {
    expect(
      resolveIdlePublishedVideoCleanup({
        isActive: true,
        isWarm: false,
        manualPlayInFlight: true,
      }).shouldCleanup,
    ).toBe(false);
    expect(
      resolveIdlePublishedVideoCleanup({
        isActive: false,
        isWarm: true,
        manualPlayInFlight: false,
      }).shouldCleanup,
    ).toBe(false);
  });

  it("aborts async play completion when no longer active", () => {
    expect(
      shouldAbortPublishedPlayBecauseNotActive({ isActive: false }),
    ).toBe(true);
    expect(
      shouldAbortPublishedPlayBecauseNotActive({ isActive: true }),
    ).toBe(false);
  });

  it("PublishedVideoPlayer wires idle force-pause and abort-after-play", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("resolveIdlePublishedVideoCleanup");
    expect(player).toContain("idle-force-pause-manual-inflight");
    expect(player).toContain("shouldAbortPublishedPlayBecauseNotActive");
    expect(player).toContain("idle-after-async-play");
    expect(player).not.toContain("teardown-suppressed-manual-inflight");
  });
});

describe("app background pause — Detail / Fullscreen / Create", () => {
  it("PublishedVideoPlayer listens for Capacitor appStateChange and tears down", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('import("@capacitor/app")');
    expect(player).toContain("appStateChange");
    expect(player).toMatch(
      /appStateChange[\s\S]*?tearDownPlayback\(\)/,
    );
    // Foreground must not auto-restart from appStateChange alone.
    expect(player).toContain(
      "Foreground resume stays on document.visibilitychange",
    );
    const appInactiveBranch = player.slice(
      player.indexOf('await App.addListener(\n          "appStateChange"'),
    );
    expect(appInactiveBranch).toContain("if (appActive) return;");
    expect(appInactiveBranch).toContain("tearDownPlayback()");
  });

  it("Create finalize preview pauses on appStateChange inactive", () => {
    const create = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(create).toContain('import("@capacitor/app")');
    expect(create).toContain("appStateChange");
    expect(create).toMatch(/if \(!appActive\) pauseVideo\(\)/);
  });

  it("Detail and Fullscreen both use PublishedVideoPlayer (inherit app background)", () => {
    const carousel = read(
      "src/components/detail/PublishedMediaCarousel.tsx",
    );
    const fullscreen = read(
      "src/components/PublishedMediaFullscreenViewer.tsx",
    );
    expect(carousel).toContain('mode="detail"');
    expect(carousel).toContain("PublishedVideoPlayer");
    expect(fullscreen).toContain('mode="fullscreen"');
    expect(fullscreen).toContain("PublishedVideoPlayer");
  });
});

describe("preserved list / foreground behavior", () => {
  it("list coordinator still owns Feed/Profile appStateChange release-all", () => {
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(coord).toContain("appStateChange");
    expect(coord).toContain("releaseAllPublishedListVideoOwnership");
    expect(coord).toContain("onPublishedListForeground");
    expect(coord).toContain("visibilityEpoch");
  });

  it("document.visibilitychange foreground autoplay path remains on published player", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("visibilitychange");
    expect(player).toContain("document.hidden");
    expect(player).toMatch(
      /if \(document\.hidden\) \{[\s\S]*tearDownPlayback\(\)/,
    );
    expect(player).toContain("userPausedRef.current");
    expect(player).toContain('playIntentRef.current = "autoplay"');
  });

  it("list visibility thresholds and warm gate markers unchanged", () => {
    const thresholds = read(
      "src/lib/publishedMedia/listVideoVisibilityThresholds.ts",
    );
    expect(thresholds).toContain(
      "PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO = 0.7",
    );
    expect(thresholds).toContain(
      "PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO = 0.4",
    );
    expect(thresholds).toContain("PUBLISHED_LIST_VIDEO_WARM_RATIO = 0.15");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("requestPublishedListVideoWarmOwnership");
    expect(surface).toContain("requestPublishedListVideoOwnership");
  });
});
