/**
 * PASS PV3.8.5 — centralized visibility auto-pause + enter/exit hysteresis.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO,
  PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  evaluatePublishedListVideoVisibilityPolicy,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function policy(
  partial: Partial<
    Parameters<typeof evaluatePublishedListVideoVisibilityPolicy>[0]
  >,
) {
  return evaluatePublishedListVideoVisibilityPolicy({
    effectiveRatio: 0,
    dwellOk: false,
    visibilityOk: true,
    readyActiveVideo: true,
    userPaused: false,
    ownsPlayback: false,
    manualForce: false,
    ...partial,
  });
}

describe("PASS PV3.8.5 — visibility hysteresis + auto-pause", () => {
  it("A–D: enter/exit thresholds and mid-band retain", () => {
    expect(PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO).toBe(0.4);
    expect(PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO).toBe(
      PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO,
    );
    expect(PUBLISHED_LIST_VIDEO_WARM_RATIO).toBe(0.15);

    // A: playing active @0.75 stays
    expect(
      policy({
        effectiveRatio: 0.75,
        dwellOk: true,
        ownsPlayback: true,
      }).shouldOwnActive,
    ).toBe(true);

    // B: 0.75 → 0.55 does NOT pause (hysteresis retain)
    expect(
      policy({
        effectiveRatio: 0.55,
        dwellOk: false,
        ownsPlayback: true,
      }).shouldOwnActive,
    ).toBe(true);

    // C: 0.55 → 0.41 does NOT pause
    expect(
      policy({
        effectiveRatio: 0.41,
        ownsPlayback: true,
      }).shouldOwnActive,
    ).toBe(true);

    // D: ratio <0.40 auto-pauses / releases
    const below = policy({
      effectiveRatio: 0.39,
      ownsPlayback: true,
    });
    expect(below.belowActiveExit).toBe(true);
    expect(below.shouldOwnActive).toBe(false);
  });

  it("E–I: visibility pause ≠ user pause; hysteresis resume rules", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("visibility-below-active-exit");
    expect(surface).toContain("visibility-auto-pause");
    const releaseBlock = surface.slice(
      surface.indexOf("if (!shouldOwnActive || !activeItem"),
      surface.indexOf("requestPublishedListVideoOwnership({"),
    );
    // Release path must not set userPaused on visibility pause; may clear below exit
    expect(releaseBlock).toContain("visibility-below-active-exit");
    expect(releaseBlock).toContain("setUserPausedKey((prev) =>");
    expect(releaseBlock).toContain("setManualForceKey(null)");
    expect(releaseBlock).not.toContain("setUserPausedKey(item.key)");
    expect(releaseBlock).not.toContain("setUserPausedKey(activeMediaKey)");

    // F/G: visibility-paused (ownsPlayback false) does not resume at 0.50 / 0.69
    expect(
      policy({ effectiveRatio: 0.5, ownsPlayback: false, dwellOk: true })
        .shouldOwnActive,
    ).toBe(false);
    expect(
      policy({ effectiveRatio: 0.69, ownsPlayback: false, dwellOk: true })
        .shouldOwnActive,
    ).toBe(false);

    // H: >=0.70 + dwell may resume
    expect(
      policy({
        effectiveRatio: 0.7,
        ownsPlayback: false,
        dwellOk: true,
      }).shouldOwnActive,
    ).toBe(true);

    // I: manually-paused does not autoplay at >=0.70
    const userPausedHigh = policy({
      effectiveRatio: 0.85,
      dwellOk: true,
      userPaused: true,
      ownsPlayback: true,
    });
    expect(userPausedHigh.autoplayEligible).toBe(false);
    expect(userPausedHigh.shouldOwnActive).toBe(true);
    expect(userPausedHigh.holdActiveWhileUserPaused).toBe(true);
  });

  it("J–N: user-paused retain/release + manual play mid-band", () => {
    // J: manually-paused retains while >=0.40
    expect(
      policy({
        effectiveRatio: 0.45,
        userPaused: true,
        ownsPlayback: true,
      }).shouldOwnActive,
    ).toBe(true);

    // K: manually-paused may release once <0.40
    expect(
      policy({
        effectiveRatio: 0.35,
        userPaused: true,
        ownsPlayback: true,
      }).shouldOwnActive,
    ).toBe(false);

    // M/N: manual play at 0.50 can claim without waiting for 0.70
    const midManual = policy({
      effectiveRatio: 0.5,
      manualForce: true,
      ownsPlayback: false,
    });
    expect(midManual.forceManualActive).toBe(true);
    expect(midManual.shouldOwnActive).toBe(true);
    expect(midManual.activeEnterEligible).toBe(false);
  });

  it("O–R: warm retention markers; no resume map", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(
      policy({
        effectiveRatio: 0.35,
        ownsPlayback: false,
      }).warmEligible,
    ).toBe(true);
    expect(
      policy({
        effectiveRatio: 0.15,
        ownsPlayback: false,
      }).warmEligible,
    ).toBe(true);
    expect(
      policy({
        effectiveRatio: 0.1,
        ownsPlayback: false,
      }).warmEligible,
    ).toBe(false);
    expect(surface).toContain("requestPublishedListVideoWarmOwnership");
    expect(surface).not.toContain("resumePosition");
    expect(player).toContain("registerListPlaybackPause");
    expect(player).toContain("pauseForListReason");
    expect(surface).toContain("visibility-below-active-exit");
  });

  it("S–Z: single policy owner; no duplicate viewport pause writer", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const policyFile = read(
      "src/lib/publishedMedia/listVideoVisibilityPolicy.ts",
    );
    expect(policyFile).toContain("evaluatePublishedListVideoVisibilityPolicy");
    expect(surface).toContain("evaluatePublishedListVideoVisibilityPolicy");
    expect(surface).toContain("computeEffectiveIntersectionRatio");
    expect(surface).toContain("IntersectionObserver");
    expect(surface).not.toContain("addEventListener(\"scroll\"");
    expect(player).not.toContain("IntersectionObserver");
    expect(player).not.toContain("addEventListener(\"scroll\"");
    // Only one register / pause path for list revoke
    expect(player).toContain("pauseForListReason");
    expect(surface).toContain("listPlaybackPauseRef");
  });

  it("AA–AF: PV3.8.4 / gestures / sound / images markers", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    const hook = read(
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    );
    expect(surface).toContain("mark user-paused only — keep active ownership");
    expect(player).toContain("manual-paused-active");
    expect(hook).toContain("armHold");
    expect(hook).toContain("Reveal-first");
    expect(hook).not.toContain("ensurePlayingAfterDoubleTap");
    expect(
      read("src/lib/publishedMedia/publishedVideoMutePreference.ts"),
    ).toContain("getPublishedVideoPreferredMuted");
    expect(surface).toContain('fit={singleImage ? "contain" : "cover"}');
  });

  it("DEV logs + background markers", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(surface).toContain("visibility-evaluated");
    expect(surface).toContain("visibility-active-retain");
    expect(surface).toContain("visibility-active-reclaim");
    expect(coord).toContain("appStateChange");
    expect(coord).toContain("document.hidden");
  });
});
