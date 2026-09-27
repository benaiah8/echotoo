/**
 * List video speculative warm — connection gate + earlier warm ratio.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO,
  PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO,
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC,
  PUBLISHED_HLS_WARM_BUFFER,
  shouldAllowPublishedListVideoSpeculativeWarm,
  evaluatePublishedListVideoVisibilityPolicy,
} from "./publishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function policy(partial: {
  effectiveRatio: number;
  ownsPlayback?: boolean;
  dwellOk?: boolean;
  visibilityOk?: boolean;
  readyActiveVideo?: boolean;
  userPaused?: boolean;
}) {
  return evaluatePublishedListVideoVisibilityPolicy({
    effectiveRatio: partial.effectiveRatio,
    dwellOk: partial.dwellOk ?? true,
    visibilityOk: partial.visibilityOk ?? true,
    readyActiveVideo: partial.readyActiveVideo ?? true,
    userPaused: partial.userPaused ?? false,
    ownsPlayback: partial.ownsPlayback ?? false,
    manualForce: false,
  });
}

describe("published list video warm tune", () => {
  it("I: warm eligible at ~0.15", () => {
    expect(PUBLISHED_LIST_VIDEO_WARM_RATIO).toBe(0.15);
    expect(policy({ effectiveRatio: 0.15 }).warmEligible).toBe(true);
    expect(policy({ effectiveRatio: 0.14 }).warmEligible).toBe(false);
  });

  it("J/K/L: active enter/exit/dwell unchanged", () => {
    expect(PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO).toBe(0.7);
    expect(PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO).toBe(0.4);
    expect(PUBLISHED_LIST_VIDEO_DWELL_MS).toBe(350);
    expect(policy({ effectiveRatio: 0.69 }).activeEnterEligible).toBe(false);
    expect(policy({ effectiveRatio: 0.7 }).activeEnterEligible).toBe(true);
    expect(policy({ effectiveRatio: 0.39 }).belowActiveExit).toBe(true);
    expect(policy({ effectiveRatio: 0.4 }).belowActiveExit).toBe(false);
  });

  it("M/N: one warm + ~4s buffer unchanged", () => {
    expect(PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC).toBe(4);
    expect(PUBLISHED_HLS_WARM_BUFFER.maxBufferLength).toBe(5);
    expect(PUBLISHED_HLS_WARM_BUFFER.maxMaxBufferLength).toBe(6);
    const coord = read("src/lib/publishedMedia/publishedListVideoCoordinator.ts");
    expect(coord).toContain("At most one ACTIVE stream + one WARM candidate");
    expect(coord).toContain("requestPublishedListVideoWarmOwnership");
  });

  it("O: warm→active reuse preserved in player", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain('purpose === "active"');
    expect(player).toContain("hls-reuse");
    expect(player).toContain("hls.startLoad()");
  });

  it("P/Q/R: connection gate", () => {
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "4g",
        saveData: true,
      }),
    ).toBe(false);
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "slow-2g",
        saveData: false,
      }),
    ).toBe(false);
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "2g",
        saveData: false,
      }),
    ).toBe(false);
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "3g",
        saveData: false,
      }),
    ).toBe(true);
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "4g",
        saveData: false,
      }),
    ).toBe(true);
    expect(
      shouldAllowPublishedListVideoSpeculativeWarm({
        effectiveType: "unknown",
        saveData: false,
      }),
    ).toBe(true);
  });

  it("S: surface gates warm claim only (not active ownership)", () => {
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("shouldAllowPublishedListVideoSpeculativeWarm");
    expect(surface).toMatch(
      /!shouldAllowPublishedListVideoSpeculativeWarm\(\)/,
    );
    // Only one runtime call site.
    expect(
      surface.split("shouldAllowPublishedListVideoSpeculativeWarm()").length,
    ).toBe(2);
    // Gate sits in the warm claim effect, not the active claim callback.
    const warmClaim = surface.indexOf("requestPublishedListVideoWarmOwnership({");
    const gateCall = surface.indexOf(
      "!shouldAllowPublishedListVideoSpeculativeWarm()",
    );
    expect(warmClaim).toBeGreaterThan(-1);
    expect(gateCall).toBeGreaterThan(-1);
    expect(gateCall).toBeLessThan(warmClaim);
    const activeClaim = surface.indexOf(
      "const { release } = requestPublishedListVideoOwnership({",
    );
    expect(activeClaim).toBeGreaterThan(-1);
    expect(gateCall).toBeGreaterThan(activeClaim);
  });

  it("U/V: shared surface policy; continuity untouched", () => {
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      "shouldAllowPublishedListVideoSpeculativeWarm",
    );
    for (const f of [
      "src/lib/publishedMedia/publishedVideoFeedDetailHandoff.ts",
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
      "src/lib/publishedMedia/publishedVideoPlaybackSnapshot.ts",
    ]) {
      expect(read(f)).not.toContain("shouldAllowPublishedListVideoSpeculativeWarm");
      expect(read(f)).not.toContain("PUBLISHED_LIST_VIDEO_WARM_RATIO");
    }
  });
});
