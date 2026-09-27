/**
 * PASS C3 — wire Android Media3 preparation into Create flow.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPreparationDecisionAfterSourceReady,
  encoderSettingsFromPreparationPolicy,
  markPreparing,
  markTranscodePrepared,
  markPrepareFailed,
  prepareDraftVideo,
  resolveVideoPreparationPolicy,
  PREPARE_FAILED_USER_MESSAGE,
  PREPARING_VIDEO_USER_MESSAGE,
} from "./createDraftVideo";
import { formatCreateMediaStatusLabel } from "./createPostMediaUploadLabel";
import type { DraftVideo } from "./createDraftVideo/types";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

function baseDraft(overrides: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "src-1",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    size: 80 * MB,
    localStorageKind: "native-fs",
    localReference: "create-drafts/post/src-1.mp4",
    width: 3840,
    height: 2160,
    duration: 30,
    remoteMediaId: null,
    remoteVideoId: null,
    ...overrides,
  };
}

describe("PASS C3 — Create preparation wiring", () => {
  it("A: passthrough does not call EchoVideoPrepare", async () => {
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
    expect(controller).toContain("return;");
  });

  it("B–C: Publish-only — provider does not auto-start encoder; controller still owns prepare", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("ensurePublishVideoPreparation");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("markPreparing");
    expect(controller).toContain("prepareDraftVideo");
    expect(controller).toContain("isNativeEchoVideoPrepareAvailable");
  });

  it("D: Preparing video… status label", () => {
    expect(
      formatCreateMediaStatusLabel({
        imageUploadingCount: 0,
        videoPreparingCount: 1,
      }),
    ).toBe(PREPARING_VIDEO_USER_MESSAGE);
  });

  it("E: will-prepare toast removed; Publish gate is sole prepare starter", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toContain("VIDEO_WILL_PREPARE_USER_MESSAGE");
    expect(provider).toContain("ensurePublishVideoPreparation");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
  });

  it("F: source preview remains localReference", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain(
      "Preview continues on SOURCE — never switches to prepared artifact",
    );
    expect(provider).toContain(
      "Preview always uses SOURCE localReference — never prepared artifact",
    );
  });

  it("G–H: progress mapping contract", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prep).toContain("Math.max(0, Math.min(1, event.progress))");
    expect(prep).toContain("input.onProgress?.(progress)");
    expect(prep).toContain("input.onProgress?.(null)");
  });

  it("I–K: completion persists prepared metadata quietly", () => {
    const draft = markPreparing(baseDraft());
    const next = markTranscodePrepared(draft, {
      preparedReference: "create-drafts/post/src-1.prepared.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 17_000_000,
      preparedWidth: 1920,
      preparedHeight: 1080,
      preparedDuration: 30,
    });
    expect(next.preparationStatus).toBe("prepared");
    expect(next.preparationStrategy).toBe("transcode");
    expect(next.preparedReference).toContain(".prepared.mp4");
    expect(next.prepareProgress).toBeNull();
    expect(next.prepareErrorCode).toBeNull();
    expect(next.localReference).toBe(draft.localReference);
  });

  it("L–N: failure prepare_failed + source preserved + user copy", () => {
    const draft = markPreparing(baseDraft());
    const failed = markPrepareFailed(draft, "encode_failed");
    expect(failed.preparationStatus).toBe("prepare_failed");
    expect(failed.localReference).toBe(draft.localReference);
    expect(failed.preparedReference).toBeNull();
    expect(PREPARE_FAILED_USER_MESSAGE).toBe(
      "Couldn't prepare the video. Try a shorter or smaller video.",
    );
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("onPrepareFailedUserMessage");
    expect(provider).toContain("toast.error");
  });

  it("O: duplicate-job protection", () => {
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("startingLocalIds");
    expect(controller).toContain("activeJob");
    expect(controller).toContain("activeJob?.localId === draftVideo.localId");
  });

  it("P–T: remove/replace/discard cancel", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain('cancelActiveDraftVideoPreparation("remove")');
    expect(provider).toContain('cancelActiveDraftVideoPreparation("replace-start")');
    expect(provider).toContain("isDraftVideoPreparationActiveFor(previousDraft.localId)");
    const discard = read("src/lib/createDraftVideo/discardCleanup.ts");
    expect(discard).toContain('cancelActiveDraftVideoPreparation("discard")');
  });

  it("U–X: resume reconciles preparing; does not auto-start prepare on hydrate", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("reconcileDraftVideoPreparation");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("Publish-only prepare: do NOT start Media3/AVFoundation on draft reopen");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain('preparationStatus === "prepare_failed"');
    expect(controller).toContain('preparationStatus === "prepared"');
  });

  it("Y: no Bunny during preparation", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(prep).not.toContain("bunny-upload-init");
    expect(prep).not.toContain("uploadFileToBunnyTus");
    expect(controller).not.toContain("createPublishVideoUpload");
  });

  it("encoder settings from policy (no 20MB force)", () => {
    const policy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 80 * MB,
      width: 3840,
      height: 2160,
      mimeType: "video/mp4",
    });
    expect(policy.strategy).toBe("prepare");
    const settings = encoderSettingsFromPreparationPolicy(
      policy,
      baseDraft(),
    );
    expect(settings.targetLongEdge).toBe(1080);
    expect(settings.targetVideoBitrate).toBeGreaterThanOrEqual(3_200_000);
    expect(settings.targetFps).toBe(30);
    expect(settings.audioBitrate).toBe(128_000);
    const src = read("src/lib/createDraftVideo/encoderSettingsFromPolicy.ts");
    expect(src).not.toContain("20 * 1024 * 1024");
  });

  it("web prepare stays unsupported without fake success", async () => {
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
    expect(draft.preparationStatus).toBe("local_ready");
    const result = await prepareDraftVideo({
      draftVideo: draft,
      policy: resolveVideoPreparationPolicy({
        durationSeconds: 30,
        sizeBytes: 80 * MB,
        width: 3840,
        height: 2160,
        mimeType: "video/mp4",
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.draftVideo.preparationStatus).not.toBe("prepared");
  });

  it("Finalize / notice show preparing after ingest", () => {
    expect(
      formatCreateMediaStatusLabel({
        imageUploadingCount: 0,
        videoAddingCount: 1,
        videoPreparingCount: 1,
      }),
    ).toBe("Adding video…");
    expect(
      formatCreateMediaStatusLabel({
        imageUploadingCount: 0,
        videoAddingCount: 0,
        videoPreparingCount: 1,
      }),
    ).toBe("Preparing video…");
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("previewVideoPreparingCount");
    expect(finalize).toContain("videoPreparingCount");
  });
});
