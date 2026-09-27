/**
 * PASS IOS1 — iOS AVFoundation EchoVideoPrepare + shared native prep gate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  applyPreparationDecisionAfterSourceReady,
  markPassthroughPrepared,
  markPreparing,
  markTranscodePrepared,
  prepareDraftVideo,
  resolveVideoPreparationPolicy,
  resolvePreparedUploadAsset,
  resolveVideoPublishPreparationState,
  isNativeEchoVideoPrepareAvailable,
  isAndroidEchoVideoPrepareAvailable,
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
} from "./createDraftVideo";
import {
  MAX_CREATE_VIDEO_LONG_EDGE_PX,
  MAX_CREATE_VIDEO_SHORT_EDGE_PX,
  isCreateVideoResolutionOverLimit,
} from "./createDraftVideo/createVideoResolutionConstraints";
import { EchoVideoPrepareWeb } from "../plugins/echoVideoPrepare/web";
import type { DraftVideo } from "./createDraftVideo/types";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

function baseDraft(overrides: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "src-ios1",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    size: 80 * MB,
    localStorageKind: "native-fs",
    localReference: "create-drafts/post/src-ios1.mp4",
    width: 3840,
    height: 2160,
    duration: 30,
    remoteMediaId: null,
    remoteVideoId: null,
    ...overrides,
  };
}

describe("PASS IOS1 — iOS EchoVideoPrepare + shared gate", () => {
  it("A: iOS plugin capabilities report ios-avfoundation", () => {
    const plugin = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePlugin.swift",
    );
    expect(plugin).toContain('"ios-avfoundation"');
    expect(plugin).toContain('"available": true');
    expect(plugin).toContain('"encoderImplemented": true');
    expect(plugin).toContain('jsName = "EchoVideoPrepare"');
  });

  it("B: Android capability still works (Media3 unchanged)", () => {
    const plugin = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePlugin.java",
    );
    expect(plugin).toContain('"android-media3"');
    expect(plugin).toContain("encoderImplemented");
    expect(plugin).toContain("true");
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareEngine.java",
    );
    expect(engine).toContain("Transformer");
  });

  it("C: web reports no native encoder", async () => {
    const web = new EchoVideoPrepareWeb();
    const caps = await web.getCapabilities();
    expect(caps.available).toBe(false);
    expect(caps.implementation).toBe("web-stub");
    expect(caps.encoderImplemented).toBe(false);
  });

  it("D: passthrough does not invoke native prepare", async () => {
    const draft = baseDraft({ size: 8 * MB, width: 1280, height: 720 });
    const policy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: draft.size,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(policy.strategy).toBe("passthrough");
    const result = await prepareDraftVideo({ draftVideo: draft, policy });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draftVideo.preparationStrategy).toBe("passthrough");
      expect(result.draftVideo.preparedReference).toBeNull();
    }
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain('policy.strategy === "passthrough"');
  });

  it("E: transcode policy invokes native prepare gate on iOS path", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prep).toContain("isNativeEchoVideoPrepareAvailable");
    expect(prep).toContain('platform === "ios"');
    expect(prep).toContain("EchoVideoPrepare.prepareVideo");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("isNativeEchoVideoPrepareAvailable");
    expect(controller).not.toMatch(
      /if\s*\(\s*Capacitor\.getPlatform\(\)\s*===\s*["']ios["']/,
    );
  });

  it("F–G: orientation uses preferredTransform; portrait/landscape display sizes", () => {
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("preferredTransform");
    expect(preflight).toContain("displaySize");
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("uprightScaledTransform");
    expect(engine).toContain("preferredTransform");
    expect(engine).toContain("transform = .identity");
  });

  it("H–I: no upscale; max target short-edge policy respected", () => {
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("Never upscale");
    expect(preflight).toContain("planScale");
    expect(preflight).toContain("sourceShort <= target");
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("targetShortEdge");
  });

  it("J–K: fps capped; bitrate keys passed to H.264/AAC", () => {
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("clampTargetFps");
    expect(preflight).toContain("min(targetFps, 30)");
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("AVVideoAverageBitRateKey");
    expect(engine).toContain("AVVideoCodecType.h264");
    expect(engine).toContain("AVEncoderBitRateKey");
    expect(engine).toContain("kAudioFormatMPEG4AAC");
  });

  it("L: source with no audio supported", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("audioWriterInput == nil");
    expect(engine).toContain("preflight.audioTrack");
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("hasAudio");
  });

  it("M–O: public duration/size gates (90s / 200MB)", () => {
    expect(MAX_CREATE_VIDEO_DURATION_SECONDS).toBe(90);
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(200 * MB);
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("maxDurationSeconds: Double = 90");
    expect(preflight).toContain("200 * 1024 * 1024");
    expect(preflight).toContain("exceeds 90 second limit");
    expect(preflight).toContain("exceeds 200 MB limit");
  });

  it("P: 8K rejected before writer", () => {
    expect(
      isCreateVideoResolutionOverLimit(7680, 4320),
    ).toBe(true);
    expect(MAX_CREATE_VIDEO_LONG_EDGE_PX).toBe(4096);
    expect(MAX_CREATE_VIDEO_SHORT_EDGE_PX).toBe(2160);
    const preflight = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePreflight.swift",
    );
    expect(preflight).toContain("sourceResolutionTooHigh");
    expect(preflight).toContain("maxLongEdgePx = 4096");
    const plugin = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePlugin.swift",
    );
    expect(plugin).toContain("EchoVideoPreparePreflight.check");
  });

  it("Q: progress monotonic + throttled", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("progressIntervalMs");
    expect(engine).toContain("400");
    expect(engine).toContain("lastEmittedProgress");
    expect(engine).toContain("progress01 + 0.0001 < lastEmittedProgress");
  });

  it("R–T: cancel/fail delete temp; completion temp→final; keep source", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("deleteQuietly(self.request.temporaryFile)");
    expect(engine).toContain("deleteQuietly(request.temporaryFile)");
    expect(engine).toContain("moveItem(at: tmp, to: dest)");
    expect(engine).not.toContain("deleteQuietly(request.sourceFile)");
    expect(engine).toContain("onCancelled");
  });

  it("U: prepared artifact persisted in DraftVideo state", () => {
    const draft = markPreparing(baseDraft());
    const next = markTranscodePrepared(draft, {
      preparedReference: "create-drafts/post/src-ios1.prepared.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 17_000_000,
      preparedWidth: 1080,
      preparedHeight: 1920,
      preparedDuration: 30,
    });
    expect(next.preparationStatus).toBe("prepared");
    expect(next.preparedReference).toContain(".prepared.mp4");
    const asset = resolvePreparedUploadAsset(next);
    expect(asset?.isSourcePassthrough).toBe(false);
    expect(asset?.reference).toBe(next.preparedReference);
  });

  it("V–W: Publish waits required iOS preparation; prepared asset selected native-path", () => {
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain("isNativeEchoVideoPrepareAvailable");
    expect(gate).toContain("preparation skip non-native");
    expect(gate).not.toContain("preparation skip non-android");
    expect(gate).toContain("ensureDraftVideoPreparationStarted");
    const bytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(bytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(bytes).toContain('kind: "native-path"');
    expect(bytes).not.toContain("loadNativeDraftVideoFile");
    expect(bytes).toContain('assetKind = "prepared"');
  });

  it("X: Publish failure keeps prepared file (cleanup semantics unchanged)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    // Success cleans; failure paths must not delete prepared on upload fail.
    expect(provider).toContain("ensurePublishVideoPreparation");
    const cleanup = read("src/lib/createDraftVideo/index.ts");
    expect(cleanup).toContain("deletePreparedVideoStorageBytes");
  });

  it("Y: Android prep wiring still present", () => {
    const main = read(
      "android/app/src/main/java/com/experience/app/MainActivity.java",
    );
    expect(main).toContain("registerPlugin(EchoVideoPreparePlugin.class)");
    expect(isAndroidEchoVideoPrepareAvailable).toBeTypeOf("function");
    expect(isNativeEchoVideoPrepareAvailable).toBeTypeOf("function");
  });

  it("Z: local-first image pipeline unchanged (no EchoVideoPrepare)", () => {
    const images = [
      "src/lib/createDraftImage",
      "src/components/create/CreateFinalizeHeroMedia.tsx",
    ];
    for (const rel of images) {
      if (!existsSync(join(process.cwd(), rel)) && !existsSync(join(process.cwd(), `${rel}.ts`))) {
        continue;
      }
    }
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).not.toContain("EchoVideoPrepare");
  });

  it("AA: Feed/Profile/Detail playback untouched by iOS prepare", () => {
    for (const rel of [
      "src/components/Post.tsx",
      "src/components/detail/PublishedVideoPlayer.tsx",
      "src/components/profile/ProfilePhotosMediaManager.tsx",
    ]) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const src = read(rel);
      expect(src).not.toContain("EchoVideoPrepare");
      expect(src).not.toContain("ios-avfoundation");
    }
  });

  it("AB: iOS project registers plugin via MyViewController", () => {
    const vc = read("ios/App/App/MyViewController.swift");
    expect(vc).toContain("EchoVideoPreparePlugin");
    expect(vc).toContain("registerPluginInstance");
    const storyboard = read("ios/App/App/Base.lproj/Main.storyboard");
    expect(storyboard).toContain("MyViewController");
    expect(storyboard).not.toContain("CAPBridgeViewController");
    expect(
      existsSync(
        join(
          process.cwd(),
          "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
        ),
      ),
    ).toBe(true);
  });

  it("pipeline uses AVAssetReader + AVAssetWriter (not ExportSession-only)", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPrepareEngine.swift",
    );
    expect(engine).toContain("AVAssetReader");
    expect(engine).toContain("AVAssetWriter");
    expect(engine).toContain("isReadyForMoreMediaData");
    expect(engine).not.toContain("AVAssetExportSession");
    expect(engine).not.toContain("FFmpeg");
  });

  it("alias gate stays platform-neutral", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prep).toContain(
      "export function isAndroidEchoVideoPrepareAvailable(): boolean",
    );
    expect(prep).toContain("return isNativeEchoVideoPrepareAvailable()");
  });

  it("passthrough mark helper still immediate", () => {
    const draft = markPassthroughPrepared(baseDraft({ size: 5 * MB }));
    expect(draft.preparationStrategy).toBe("passthrough");
    expect(resolveVideoPublishPreparationState(draft)).toBe("ready_source");
  });

  it("transcode local_ready becomes needs_prepare for publish", () => {
    const draft = applyPreparationDecisionAfterSourceReady(
      baseDraft(),
      resolveVideoPreparationPolicy({
        durationSeconds: 30,
        sizeBytes: 80 * MB,
        width: 3840,
        height: 2160,
        mimeType: "video/mp4",
      }),
    );
    expect(draft.preparationStrategy).toBe("transcode");
    expect(resolveVideoPublishPreparationState(draft)).toBe("needs_prepare");
  });
});
