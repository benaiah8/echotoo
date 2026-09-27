/**
 * PASS B.1 — Create Media UX: validation copy, 3-action picker, replace emphasis, prepare notice.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MediaType, type MediaResult } from "@capacitor/camera";
import { nativeVideoPickFromMediaResult } from "./mediaAcquisitionVideo";
import {
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  REPLACE_VIDEO_CONFIRM_EMPHASIS,
  REPLACE_VIDEO_CONFIRM_LEAD,
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
  VIDEO_READ_FAILED_USER_MESSAGE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  VIDEO_TOO_LONG_USER_MESSAGE,
  isCreateVideoDurationOverLimit,
  messageForCreateVideoAcquisitionFailure,
} from "./createDraftVideo/createVideoConstraints";
import { applyPreparationDecisionAfterSourceReady } from "./createDraftVideo/videoPreparationState";
import { resolveVideoPreparationPolicy } from "./createDraftVideo/createVideoPreparationPolicy";
import type { DraftVideo } from "./createDraftVideo/types";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MB = 1024 * 1024;

/**
 * Complete MediaResult fixture. Callers may pass Partial overrides;
 * required plugin fields (type, saved) always come from defaults.
 * `path` is accepted for native URI tests but is not part of MediaResult.
 */
function videoResult(
  overrides: Partial<MediaResult> & { path?: string } = {},
): MediaResult {
  const { metadata: metadataOverrides, path: _path, ...rest } = overrides;
  return {
    type: MediaType.Video,
    saved: true,
    uri: "content://media/external/video/42",
    webPath: "capacitor://localhost/_capacitor_file_/clip.mp4",
    metadata: {
      format: "mp4",
      size: 5 * MB,
      duration: 30,
      ...(metadataOverrides ?? {}),
    },
    ...rest,
  };
}

describe("PASS B.1 — Create Media UX", () => {
  it("A: native metadata duration 240 sec → TOO_LONG", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({ metadata: { format: "mp4", size: 40 * MB, duration: 240 } }),
      "library",
      {
        isNativePlatform: true,
        statNativeVideoUri: async () => {
          throw new Error("stat must not run after duration reject");
        },
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("too_long");
    expect(outcome.message).toBe(VIDEO_TOO_LONG_USER_MESSAGE);
  });

  it("B: native metadata duration 360 sec → TOO_LONG", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({ metadata: { format: "mp4", size: 80 * MB, duration: 360 } }),
      "library",
      { isNativePlatform: true, statNativeVideoUri: async () => 80 * MB },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("too_long");
    expect(outcome.message).toBe(
      "Video is too long. Maximum 90 seconds.",
    );
  });

  it("C: >90 sec never becomes generic read_failed when duration is known", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({ metadata: { format: "mp4", duration: 91 } }),
      "library",
      { isNativePlatform: true, statNativeVideoUri: async () => null },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).not.toBe("read_failed");
    expect(outcome.reason).toBe("too_long");
    expect(outcome.message).not.toBe(VIDEO_READ_FAILED_USER_MESSAGE);
  });

  it("D: exactly 90 sec accepted", async () => {
    expect(MAX_CREATE_VIDEO_DURATION_SECONDS).toBe(90);
    expect(isCreateVideoDurationOverLimit(90)).toBe(false);
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({ metadata: { format: "mp4", size: 10 * MB, duration: 90 } }),
      "library",
      { isNativePlatform: true, statNativeVideoUri: async () => 10 * MB },
    );
    expect(outcome.ok).toBe(true);
  });

  it("E: >200 MB maps to TOO_LARGE", async () => {
    const over = MAX_CREATE_VIDEO_SOURCE_BYTES + 1;
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({
        metadata: { format: "mp4", size: over, duration: 60 },
      }),
      "library",
      { isNativePlatform: true, statNativeVideoUri: async () => over },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("too_large");
    expect(outcome.message).toBe(VIDEO_TOO_LARGE_USER_MESSAGE);
  });

  it("F: unsupported format maps correctly", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({ metadata: { format: "webm", size: 5 * MB, duration: 30 } }),
      "library",
      { isNativePlatform: true, statNativeVideoUri: async () => 5 * MB },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("unsupported_format");
    expect(outcome.message).toBe(VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE);
  });

  it("G: genuine read failure keeps generic read copy", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoResult({
        uri: undefined,
        path: undefined,
        webPath: undefined,
        metadata: {
          format: "mp4",
          duration: 20,
        },
      }),
      "library",
      {
        isNativePlatform: true,
        statNativeVideoUri: async () => null,
        fetchBlobFromWebPath: async () => null,
        readBlobViaFilesystemUri: async () => null,
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("read_failed");
    expect(outcome.message).toBe(VIDEO_READ_FAILED_USER_MESSAGE);
    expect(messageForCreateVideoAcquisitionFailure("read_failed")).toBe(
      VIDEO_READ_FAILED_USER_MESSAGE,
    );
  });

  it("H: Android preparation starts only at Publish (no ingest auto-prepare)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toContain("VIDEO_WILL_PREPARE_USER_MESSAGE");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("ensurePublishVideoPreparation");
    expect(provider).toContain('onPhase?.("preparing_video")');
  });

  it("I: passthrough gets no preparation notice", () => {
    const draft: DraftVideo = {
      localId: "1",
      fileName: "a.mp4",
      mimeType: "video/mp4",
      size: 8 * MB,
      localStorageKind: "native-fs",
      localReference: "create-drafts/p/1.mp4",
      width: 1280,
      height: 720,
      duration: 30,
    };
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

  it("J: preparation orchestrated via Publish gate (not ingest fire-and-forget)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("ensurePublishVideoPreparation");
    expect(provider).toContain("cancelActiveDraftVideoPreparation");
    expect(provider).not.toContain("VIDEO_WILL_PREPARE_USER_MESSAGE");
  });

  it("K: Add Media shows Library + Photo + Video directly", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain('data-media-source="library"');
    expect(sheet).toContain('data-media-source="photo"');
    expect(sheet).toContain('data-media-source="video"');
    expect(sheet).toContain("data-add-media-actions");
  });

  it("L: Camera submenu removed", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).not.toContain("data-camera-kind-choice");
    expect(sheet).not.toContain("cameraPanel");
    expect(sheet).not.toContain('setCameraPanel');
  });

  it("M: Library remains wider than Photo/Video", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain("flex-[2]");
    expect(sheet).toContain("flex-1 flex-col");
  });

  it("N: Photo calls existing photo path", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain("onTakePhoto?.()");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("onTakePhoto={() => void handleTakePhoto()}");
    expect(picker).toContain("captureImageFromCamera");
  });

  it("O: Video calls existing record path", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain("onRecordVideo?.()");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("onRecordVideo={() => void handleRecordVideo()}");
    expect(picker).toContain("recordVideoFromCamera");
  });

  it("P: info icon stays beside Add media title", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet.indexOf("data-add-media-title")).toBeLessThan(
      sheet.indexOf("data-video-requirements-info"),
    );
  });

  it("Q: close visual is smaller but hit target remains mobile-safe", () => {
    const sheet = read("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain("data-add-media-close");
    expect(sheet).toContain("h-10 w-10");
    expect(sheet).toContain("h-[28px] w-[28px]");
  });

  it("R: Replace dialog emphasizes ONE VIDEO PER POST", () => {
    expect(REPLACE_VIDEO_CONFIRM_LEAD).toBe("You can only add");
    expect(REPLACE_VIDEO_CONFIRM_EMPHASIS).toBe("ONE VIDEO PER POST");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("data-replace-video-emphasis");
    expect(picker).toContain("REPLACE_VIDEO_CONFIRM_EMPHASIS");
  });

  it("S: failed long replacement preserves existing video", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("commitMeta: false");
    expect(provider).toContain("showCreateVideoValidationToast");
    expect(provider).toContain('"too_long"');
    expect(provider).toContain("deleteDraftVideoStorageBytes(draftVideo)");
  });

  it("T: no Bunny activity", () => {
    const video = read("src/lib/mediaAcquisitionVideo.ts");
    expect(video).not.toContain("invokeBunny");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("videoFailure");
    expect(picker).not.toContain("invokeBunnyUploadInit");
  });
});
