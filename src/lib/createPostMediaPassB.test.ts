/**
 * PASS B — persisted video preparation state + prepared artifact metadata.
 * No encoder / no Bunny.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPreparationDecisionAfterSourceReady,
  clearPreparedArtifactFields,
  markPassthroughPrepared,
  markPreparing,
  markTranscodePrepared,
  PREPARE_ERROR_ARTIFACT_EMPTY,
  PREPARE_ERROR_ARTIFACT_MISSING,
  PREPARE_ERROR_INTERRUPTED,
  reconcileInterruptedPreparing,
} from "./createDraftVideo/videoPreparationState";
import { resolvePreparedUploadAsset } from "./createDraftVideo/resolvePreparedUploadAsset";
import { resolveVideoPublishPreparationState } from "./createDraftVideo/resolveVideoPublishPreparationState";
import {
  invalidatePreparedArtifact,
  validatePreparedArtifactMetadata,
} from "./createDraftVideo/validatePreparedVideoArtifact";
import { reconcileDraftVideoPreparation } from "./createDraftVideo/reconcileDraftVideoPreparation";
import { prepareDraftVideo } from "./createDraftVideo/prepareDraftVideo";
import { resolveVideoPreparationPolicy } from "./createDraftVideo/createVideoPreparationPolicy";
import {
  PREPARING_VIDEO_USER_MESSAGE,
  PREPARE_FAILED_USER_MESSAGE,
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
  INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION,
} from "./createDraftVideo/createVideoPreparationConstants";
import type { DraftVideo } from "./createDraftVideo/types";
import { formatCreateMediaStatusLabel } from "./createPostMediaUploadLabel";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

function baseDraft(overrides: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "src-1",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    size: 8 * MB,
    localStorageKind: "native-fs",
    localReference: "create-drafts/post/src-1.mp4",
    width: 1280,
    height: 720,
    duration: 30,
    remoteMediaId: null,
    remoteVideoId: null,
    ...overrides,
  };
}

describe("PASS B — preparation state", () => {
  it("A: passthrough policy → prepared status", () => {
    const draft = baseDraft({ size: 8 * MB });
    const policy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: draft.size,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(policy.strategy).toBe("passthrough");
    const next = applyPreparationDecisionAfterSourceReady(draft, policy);
    expect(next.preparationStatus).toBe("prepared");
    expect(next.preparationStrategy).toBe("passthrough");
  });

  it("B: passthrough does not duplicate source file", () => {
    const draft = baseDraft();
    const next = markPassthroughPrepared(draft);
    expect(next.preparedReference).toBeNull();
    expect(next.localReference).toBe(draft.localReference);
    expect(next.localReference).toBe("create-drafts/post/src-1.mp4");
  });

  it("C: prepare-required policy does not falsely mark prepared", async () => {
    const draft = baseDraft({
      size: 150 * MB,
      width: 1920,
      height: 1080,
      duration: 30,
    });
    const policy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: draft.size,
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
    });
    expect(policy.strategy).toBe("prepare");
    const next = applyPreparationDecisionAfterSourceReady(draft, policy);
    expect(next.preparationStatus).toBe("local_ready");
    expect(next.preparationStrategy).toBe("transcode");
    expect(next.preparedReference).toBeNull();

    const service = await prepareDraftVideo({ draftVideo: draft, policy });
    expect(service.ok).toBe(false);
    if (!service.ok) {
      expect(service.errorCode).toBe("ENCODER_NOT_IMPLEMENTED");
      expect(service.draftVideo.preparationStatus).not.toBe("prepared");
      expect(service.draftVideo.preparationStatus).not.toBe("preparing");
    }
  });

  it("D: preparation metadata persists on DraftVideo shape", () => {
    const prepared = markPassthroughPrepared(baseDraft());
    const json = JSON.parse(JSON.stringify(prepared)) as DraftVideo;
    expect(json.preparationStatus).toBe("prepared");
    expect(json.preparationStrategy).toBe("passthrough");
    expect(read("src/lib/createDraftVideo/types.ts")).toContain(
      "preparationStatus?",
    );
    expect(read("src/lib/createDraftVideo/draftVideoMeta.ts")).toContain(
      "draftVideo",
    );
  });

  it("E: passthrough survives draft resume", async () => {
    const draft = markPassthroughPrepared(baseDraft());
    const result = await reconcileDraftVideoPreparation(draft);
    expect(result.changed).toBe(false);
    expect(result.draftVideo.preparationStatus).toBe("prepared");
    expect(result.draftVideo.preparationStrategy).toBe("passthrough");
  });

  it("F: valid prepared artifact survives resume", async () => {
    const draft = markTranscodePrepared(baseDraft({ size: 40 * MB }), {
      preparedReference: "create-drafts/post/src-1.prepared.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 18 * MB,
      preparedWidth: 1280,
      preparedHeight: 720,
      preparedDuration: 30,
    });
    expect(validatePreparedArtifactMetadata(draft).ok).toBe(true);

    const validateMod = await import(
      "./createDraftVideo/validatePreparedVideoArtifact"
    );
    const spy = vi
      .spyOn(validateMod, "validatePreparedArtifactExists")
      .mockResolvedValue({ ok: true, sizeBytes: 18 * MB });

    const result = await reconcileDraftVideoPreparation(draft);
    expect(result.changed).toBe(false);
    expect(result.draftVideo.preparationStatus).toBe("prepared");
    expect(result.draftVideo.preparedReference).toBe(
      "create-drafts/post/src-1.prepared.mp4",
    );
    spy.mockRestore();
  });

  it("G: stale preparing state is recoverable/restartable", async () => {
    const draft = markPreparing(baseDraft(), null);
    const next = reconcileInterruptedPreparing(draft);
    expect(next.preparationStatus).toBe("local_ready");
    expect(next.preparationStrategy).toBe("transcode");
    expect(next.prepareErrorCode).toBe(PREPARE_ERROR_INTERRUPTED);
    expect(next.prepareProgress).toBeNull();

    const reconciled = await reconcileDraftVideoPreparation(draft);
    expect(reconciled.changed).toBe(true);
    expect(reconciled.draftVideo.preparationStatus).toBe("local_ready");
  });

  it("H: missing prepared file clears prepared state", () => {
    const draft = markTranscodePrepared(baseDraft(), {
      preparedReference: "",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 10 * MB,
    });
    const meta = validatePreparedArtifactMetadata({
      ...draft,
      preparedReference: null,
    });
    expect(meta.ok).toBe(false);
    if (!meta.ok) {
      expect(meta.errorCode).toBe(PREPARE_ERROR_ARTIFACT_MISSING);
      const cleared = invalidatePreparedArtifact(draft, meta.errorCode);
      expect(cleared.preparationStatus).toBe("local_ready");
      expect(cleared.preparedReference).toBeNull();
    }
  });

  it("I: zero-byte prepared file rejected", () => {
    const draft = markTranscodePrepared(baseDraft(), {
      preparedReference: "create-drafts/post/prep.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 0,
    });
    const meta = validatePreparedArtifactMetadata(draft);
    expect(meta.ok).toBe(false);
    if (!meta.ok) {
      expect(meta.errorCode).toBe(PREPARE_ERROR_ARTIFACT_EMPTY);
    }
  });

  it("J: source retained after preparation success", () => {
    const draft = markPassthroughPrepared(baseDraft());
    expect(draft.localReference).toBeTruthy();
    const transcoded = markTranscodePrepared(baseDraft(), {
      preparedReference: "create-drafts/post/prep.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 12 * MB,
    });
    expect(transcoded.localReference).toBe("create-drafts/post/src-1.mp4");
    expect(transcoded.preparedReference).not.toBe(transcoded.localReference);
  });

  it("K: remove cleans source + prepared", () => {
    const idx = read("src/lib/createDraftVideo/index.ts");
    expect(idx).toContain("deletePreparedVideoStorageBytes");
    const removeBlock = idx.slice(
      idx.indexOf("export async function deleteDraftVideo"),
      idx.indexOf("export async function deletePreparedVideoStorageBytes"),
    );
    expect(removeBlock).toContain("deletePreparedVideoStorageBytes(meta)");
  });

  it("L: replace cleans old prepared only after successful swap", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("commitMeta: !replacingLocal");
    expect(provider).toContain(
      "await deleteDraftVideoStorageBytes(previousDraft)",
    );
    expect(provider).toContain(
      "old source + any old prepared artifact",
    );
  });

  it("M: discard cleans prepared artifact", () => {
    const idx = read("src/lib/createDraftVideo/index.ts");
    const cleanup = idx.slice(
      idx.indexOf("export async function cleanupDraftVideoAssets"),
      idx.indexOf("export function createDraftVideoPreviewSource"),
    );
    expect(cleanup).toContain("deletePreparedVideoStorageBytes(meta)");
    expect(read("src/lib/createDraftVideo/discardCleanup.ts")).toContain(
      "cleanupDraftVideoAssets",
    );
  });

  it("N: resolvePreparedUploadAsset uses source for passthrough", () => {
    const draft = markPassthroughPrepared(baseDraft({ size: 9 * MB }));
    const asset = resolvePreparedUploadAsset(draft);
    expect(asset).not.toBeNull();
    expect(asset!.isSourcePassthrough).toBe(true);
    expect(asset!.reference).toBe(draft.localReference);
    expect(asset!.sizeBytes).toBe(9 * MB);
  });

  it("O: resolvePreparedUploadAsset uses prepared file for transcode", () => {
    const draft = markTranscodePrepared(baseDraft(), {
      preparedReference: "create-drafts/post/prep.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 15 * MB,
    });
    const asset = resolvePreparedUploadAsset(draft);
    expect(asset).not.toBeNull();
    expect(asset!.isSourcePassthrough).toBe(false);
    expect(asset!.reference).toBe("create-drafts/post/prep.mp4");
    expect(asset!.sizeBytes).toBe(15 * MB);
  });

  it("P: publish decision helper returns correct states", () => {
    expect(
      resolveVideoPublishPreparationState(markPassthroughPrepared(baseDraft())),
    ).toBe("ready_source");

    expect(
      resolveVideoPublishPreparationState(
        markTranscodePrepared(baseDraft(), {
          preparedReference: "create-drafts/post/prep.mp4",
          preparedStorageKind: "native-fs",
          preparedMimeType: "video/mp4",
          preparedSizeBytes: 12 * MB,
        }),
      ),
    ).toBe("ready_prepared");

    expect(
      resolveVideoPublishPreparationState(markPreparing(baseDraft())),
    ).toBe("wait_preparing");

    expect(
      resolveVideoPublishPreparationState(
        applyPreparationDecisionAfterSourceReady(
          baseDraft({ size: 150 * MB, width: 1920, height: 1080 }),
          resolveVideoPreparationPolicy({
            durationSeconds: 30,
            sizeBytes: 150 * MB,
            width: 1920,
            height: 1080,
            mimeType: "video/mp4",
          }),
        ),
      ),
    ).toBe("needs_prepare");

    expect(
      resolveVideoPublishPreparationState({
        ...baseDraft(),
        preparationStatus: "prepare_failed",
        preparationStrategy: "transcode",
        prepareErrorCode: "ENCODER_NOT_IMPLEMENTED",
      }),
    ).toBe("blocked_prepare_failed");
  });

  it("Q: prepareProgress null remains indeterminate", () => {
    const draft = markPreparing(baseDraft(), null);
    expect(draft.prepareProgress).toBeNull();
    expect(PREPARING_VIDEO_USER_MESSAGE).toBe("Preparing video…");
  });

  it("R: user copy only says Preparing video…", () => {
    expect(PREPARING_VIDEO_USER_MESSAGE).toBe("Preparing video…");
    expect(PREPARE_FAILED_USER_MESSAGE).toBe(
      "Couldn't prepare the video. Try a shorter or smaller video.",
    );
    const label = formatCreateMediaStatusLabel({
      imageUploadingCount: 0,
      videoPreparingCount: 1,
    });
    expect(label).toBe("Preparing video…");
    expect(label).not.toMatch(/bitrate|Mbps|1080p|codec/i);
  });

  it("S: preparation uses EchoVideoPrepare boundary (no FFmpeg / no Bunny)", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prep).toContain("EchoVideoPrepare");
    expect(prep).toContain("ENCODER_NOT_IMPLEMENTED");
    expect(prep).not.toMatch(/ffmpeg|AVAssetExportSession/i);
    expect(SHORT_VIDEO_PREFERRED_TARGET_BYTES).toBe(20 * MB);
    expect(INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION).toBe(60 * MB);
  });

  it("T: no Bunny activity", () => {
    const prep = read("src/lib/createDraftVideo/prepareDraftVideo.ts");
    expect(prep).not.toContain("invokeBunny");
    expect(prep).not.toContain("createPublishVideoUpload");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).toContain("applyPreparationDecisionAfterSourceReady");
    expect(startFn).not.toContain("invokeBunnyUploadInit");
  });

  it("preview remains on source (not prepared)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain(
      "Preview always uses SOURCE localReference",
    );
    expect(provider).toContain("reconcileDraftVideoPreparation");
  });

  it("clearPreparedArtifactFields keeps source", () => {
    const draft = markTranscodePrepared(baseDraft(), {
      preparedReference: "prep.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 5 * MB,
    });
    const cleared = clearPreparedArtifactFields(draft);
    expect(cleared.localReference).toBe(draft.localReference);
    expect(cleared.preparedReference).toBeNull();
  });
});
