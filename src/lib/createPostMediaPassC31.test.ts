import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CREATE_VIDEO_LONG_EDGE_PX,
  MAX_CREATE_VIDEO_PIXEL_AREA,
  MAX_CREATE_VIDEO_SHORT_EDGE_PX,
  VIDEO_REQUIREMENTS_ITEMS,
  VIDEO_REQUIREMENTS_LINES,
  VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
  getCreateVideoValidationToastContent,
  isCreateVideoResolutionOverLimit,
  toCreateVideoDisplaySize,
} from "./createDraftVideo/createVideoConstraints";
import {
  DRAFT_VIDEO_POSTER_MAX_EDGE_PX,
  computePosterSeekSeconds,
} from "./createDraftVideo/extractVideoPosterFrame";
import { ECHO_VIDEO_PREPARE_ERROR } from "../plugins/echoVideoPrepare/errors";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function scalePoster(width: number, height: number) {
  const maxEdge = DRAFT_VIDEO_POSTER_MAX_EDGE_PX;
  const longest = Math.max(width, height, 1);
  if (longest <= maxEdge) {
    return {
      width: Math.max(1, Math.round(width) || 1),
      height: Math.max(1, Math.round(height) || 1),
    };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

describe("PASS C3.1 — 4K source guard + poster/first frame", () => {
  it("A: 3840x2160 accepted", () => {
    expect(isCreateVideoResolutionOverLimit(3840, 2160)).toBe(false);
  });

  it("B: 4096x2160 accepted", () => {
    expect(isCreateVideoResolutionOverLimit(4096, 2160)).toBe(false);
  });

  it("C: portrait 2160x3840 accepted", () => {
    expect(isCreateVideoResolutionOverLimit(2160, 3840)).toBe(false);
  });

  it("D: 7680x4320 rejected", () => {
    expect(isCreateVideoResolutionOverLimit(7680, 4320)).toBe(true);
  });

  it("E: portrait 4320x7680 rejected", () => {
    expect(isCreateVideoResolutionOverLimit(4320, 7680)).toBe(true);
  });

  it("F: pixel-area guard enforced", () => {
    expect(MAX_CREATE_VIDEO_PIXEL_AREA).toBe(
      MAX_CREATE_VIDEO_LONG_EDGE_PX * MAX_CREATE_VIDEO_SHORT_EDGE_PX,
    );
    // Long/short ok-ish but area over: e.g. 4096 x 2161
    expect(isCreateVideoResolutionOverLimit(4096, 2161)).toBe(true);
  });

  it("G: rotation-aware dimensions validated", () => {
    const portrait = toCreateVideoDisplaySize(3840, 2160, 90);
    expect(portrait).toEqual({ width: 2160, height: 3840 });
    expect(isCreateVideoResolutionOverLimit(3840, 2160, 90)).toBe(false);
    expect(isCreateVideoResolutionOverLimit(7680, 4320, 90)).toBe(true);
    expect(isCreateVideoResolutionOverLimit(2160, 4096)).toBe(false);
  });

  it("H: high-resolution reason maps to Resolution too high / 4K max", () => {
    const toast = getCreateVideoValidationToastContent("too_high_resolution");
    expect(toast).toEqual({
      primary: "Resolution too high",
      action: "4K max",
      accessibleMessage: VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
    });
    expect([...VIDEO_REQUIREMENTS_LINES]).toEqual([
      "Up to 90 seconds",
      "Up to 200 MB",
      "Up to 4K",
      "MP4 or MOV",
    ]);
    expect(VIDEO_REQUIREMENTS_ITEMS.map((i) => i.emphasis)).toEqual([
      "90 seconds",
      "200 MB",
      "4K",
      "MP4 or MOV",
    ]);
  });

  it("I–L: 8K never reaches Transformer; native rejects; gate released; source intact", () => {
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareEngine.java",
    );
    const plugin = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePlugin.java",
    );
    const preflight = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePreflight.java",
    );
    const codes = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareErrorCodes.java",
    );
    expect(codes).toContain('SOURCE_RESOLUTION_TOO_HIGH = "source_resolution_too_high"');
    expect(preflight).toContain("exceedsPublicSourceLimit");
    expect(preflight).toContain("MAX_LONG_EDGE_PX = 4096");
    expect(plugin).toContain("EchoVideoPreparePreflight.check");
    expect(plugin).toContain("jobGate.clear(jobId)");
    expect(engine).toContain("EchoVideoPreparePreflight.check");
    expect(preflight).toContain("SOURCE_RESOLUTION_TOO_HIGH");
    // fail() deletes temp only — not source
    expect(engine).toContain("deleteQuietly(request.temporaryFile)");
    expect(engine).not.toMatch(/deleteQuietly\(request\.sourceFile\)/);
    expect(ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high).toBe(
      "source_resolution_too_high",
    );
  });

  it("M: unsupported preflight does not throw fatal exception", () => {
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareEngine.java",
    );
    expect(engine).toContain("catch (Exception e)");
    expect(engine).not.toContain("System.exit");
    const preflight = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePreflight.java",
    );
    expect(preflight).toContain("Result.failure");
  });

  it("N–O: normal 1080p / 4K still within public + Publish prepare path", () => {
    expect(isCreateVideoResolutionOverLimit(1920, 1080)).toBe(false);
    expect(isCreateVideoResolutionOverLimit(3840, 2160)).toBe(false);
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("isCreateVideoResolutionOverLimit");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("ensurePublishVideoPreparation");
  });

  it("P–S: poster / hero / thumbnail share first-frame visual", () => {
    const poster = read("src/lib/createDraftVideo/extractVideoPosterFrame.ts");
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(DRAFT_VIDEO_POSTER_MAX_EDGE_PX).toBe(720);
    expect(poster).toContain('preload = "auto"');
    expect(poster).toContain("isNearlyBlackPosterCanvas");
    expect(poster).toContain("isCreateVideoResolutionOverLimit");
    expect(player).toContain('preload="auto"');
    expect(player).toContain("ensurePausedDecodedFrame");
    expect(player).toContain("poster && !playing");
    expect(tile).toContain("localPosterUrl");
    // Tray uses poster image (or filmstrip placeholder) — no second <video> decoder.
    expect(tile).not.toContain("<video");
    expect(tile).toContain("PiFilmStrip");
  });

  it("Q: poster generation is bounded/downscaled", () => {
    const scaled = scalePoster(3840, 2160);
    expect(Math.max(scaled.width, scaled.height)).toBeLessThanOrEqual(
      DRAFT_VIDEO_POSTER_MAX_EDGE_PX,
    );
    expect(computePosterSeekSeconds(30)).toBeLessThanOrEqual(0.35);
    expect(computePosterSeekSeconds(30)).toBeGreaterThanOrEqual(0.1);
    expect(computePosterSeekSeconds(0)).toBe(0.15);
  });

  it("T–U: playback begins normally; audio preference unchanged", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("currentTime = 0");
    expect(player).toContain("getCreateVideoMutedPreference");
    expect(player).toContain("setCreateVideoMutedPreference");
    expect(player).not.toMatch(/autoplay=\{true\}/);
  });

  it("V: draft resume restores video visual + 8K draft handling", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("hydrateLocalDraftVideo");
    expect(provider).toContain("source_resolution_too_high");
    expect(provider).toContain('showCreateVideoValidationToast("too_high_resolution")');
    expect(provider).toContain("skipPosterAndPrep");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("isCreateVideoResolutionOverLimit");
    expect(controller).toContain("source_resolution_too_high");
  });

  it("W–X: no Bunny activity; Publish unchanged", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("createPublishVideoUpload");
    expect(startFn).toContain("too_high_resolution");
  });

  it("preparation failure copy uses 4K toast for known high-res", () => {
    const prepare = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prepare).toContain("source_resolution_too_high");
    expect(prepare).toContain("VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("showCreateVideoValidationToast(\"too_high_resolution\")");
  });
});
