import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  REPLACE_VIDEO_CONFIRM_BODY,
  REPLACE_VIDEO_CONFIRM_TITLE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  validateCreateVideoSource,
} from "./createDraftVideo/createVideoConstraints";
import { MAX_BUNNY_VIDEO_FILE_BYTES } from "./bunnyUpload/bunnyVideoConstraints";
import {
  bootstrapMediaOrder,
  imageOrderItem,
  reconcileMediaOrder,
  videoOrderItem,
} from "./createDraftMediaOrder";
import {
  getCreateVideoMutedPreference,
  resetCreateVideoMutedPreference,
  setCreateVideoMutedPreference,
} from "./createFinalizeVideoMutePreference";
import { routeWebLibraryFiles } from "./createPostMediaRouting";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS A.1 — default audio", () => {
  it("A: new video initializes unmuted", () => {
    resetCreateVideoMutedPreference();
    expect(getCreateVideoMutedPreference()).toBe(false);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("getCreateVideoMutedPreference()");
    expect(player).toContain(
      "useState(() => getCreateVideoMutedPreference())",
    );
  });

  it("B: autoplay failure leaves video unmuted + paused", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("el.muted = mutedRef.current");
    expect(player).not.toContain("setMuted(true)");
    expect(player).toContain("Prefer sound-on");
    expect(player).toMatch(/catch\s*\{\s*setPlaying\(false\);/);
  });

  it("C: user mute state does not unexpectedly reset", () => {
    resetCreateVideoMutedPreference();
    setCreateVideoMutedPreference(true);
    expect(getCreateVideoMutedPreference()).toBe(true);
    setCreateVideoMutedPreference(false);
    expect(getCreateVideoMutedPreference()).toBe(false);
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("setCreateVideoMutedPreference(next)");
  });
});

describe("PASS A.1 — duration + size limits", () => {
  it("D/E: public duration limit restored in B0.2 (90s) — A.1 replace flow still safe", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("commitMeta: false");
    expect(provider).toContain("showCreateVideoValidationToast");
    expect(provider).toContain('"too_long"');
  });

  it("F: oversize copy is concise (B0.2 wording)", () => {
    expect(VIDEO_TOO_LARGE_USER_MESSAGE).toBe(
      "Video is too large. Maximum 200 MB.",
    );
  });

  it("G: source 200MB limit unchanged", () => {
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(MAX_BUNNY_VIDEO_FILE_BYTES);
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(200 * 1024 * 1024);
    const over = validateCreateVideoSource({
      name: "big.mp4",
      type: "video/mp4",
      size: MAX_CREATE_VIDEO_SOURCE_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.reason).toBe("too-large");
      expect(over.message).toBe(VIDEO_TOO_LARGE_USER_MESSAGE);
    }
  });
});

describe("PASS A.1 — replace video UX + safe lifecycle", () => {
  it("H: second video opens Replace confirmation", () => {
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("REPLACE_VIDEO_CONFIRM_TITLE");
    expect(picker).toContain("ConfirmDialog");
    expect(REPLACE_VIDEO_CONFIRM_TITLE).toBe("Replace video?");
    expect(REPLACE_VIDEO_CONFIRM_BODY).toContain("ONE VIDEO PER POST");
    expect(picker).toContain('confirmLabel="Replace"');
    expect(picker).toContain('cancelLabel="Cancel"');
  });

  it("I: Cancel preserves existing video", () => {
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("handleReplaceConfirmClose");
    expect(picker).toContain("setPendingReplace(null)");
    expect(picker).not.toMatch(
      /handleReplaceConfirmClose[\s\S]{0,200}startPostVideoUpload/,
    );
  });

  it("J: picker cancel after Replace preserves existing (no early delete)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    // Safe replace: persist with commitMeta false until job is ready.
    expect(provider).toContain("commitMeta: false");
    expect(provider).toContain(
      "Never overwrite draft meta until the replacement/add is validated",
    );
    // Old delete-before-persist path removed.
    expect(provider).not.toMatch(
      /if \(currentJob && isLocalDraftVideoJob\(currentJob\)\) \{\s*await deleteDraftVideo/,
    );
  });

  it("K/L: invalid replacement / persistence failure preserves existing", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("deleteDraftVideoStorageBytes(draftVideo)");
    expect(provider).toContain("uncommitted");
    expect(provider).toContain("ADD_VIDEO_FAILED_USER_MESSAGE");
  });

  it("M: successful replacement swaps only after new video ready", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    const writeMetaIdx = startFn.indexOf("writeDraftVideoMeta(withPreparation)");
    const setJobIdx = startFn.indexOf("setVideoJob(hydrated)");
    const cleanupOldIdx = startFn.indexOf(
      "deleteDraftVideoStorageBytes(previousDraft,",
    );
    expect(writeMetaIdx).toBeGreaterThan(0);
    expect(setJobIdx).toBeGreaterThan(writeMetaIdx);
    expect(cleanupOldIdx).toBeGreaterThan(setJobIdx);
  });

  it("N/O: replacement inherits mediaOrder position / cover", () => {
    const boot = bootstrapMediaOrder({
      images: ["a.jpg", "b.jpg"],
      videoLocalId: "vid-old",
      clientIdMap: {},
    });
    // Force order: image | video | image
    const currentOrder = [
      imageOrderItem("a.jpg", "img-a"),
      videoOrderItem("vid-old"),
      imageOrderItem("b.jpg", "img-b"),
    ];
    const rec = reconcileMediaOrder({
      currentOrder,
      images: ["a.jpg", "b.jpg"],
      videoLocalId: "vid-new",
      clientIdMap: boot.clientIdMap,
    });
    expect(rec.order).toEqual([
      imageOrderItem("a.jpg", "img-a"),
      videoOrderItem("vid-new"),
      imageOrderItem("b.jpg", "img-b"),
    ]);

    const cover = reconcileMediaOrder({
      currentOrder: [videoOrderItem("vid-old"), imageOrderItem("a.jpg", "img-a")],
      images: ["a.jpg"],
      videoLocalId: "vid-new",
      clientIdMap: {},
    });
    expect(cover.order[0]).toEqual(videoOrderItem("vid-new"));
  });

  it("P: active selection preserved via clientId resolve (carousel)", () => {
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).toContain("resolveHeroIndexForClientId");
    expect(carousel).toContain("selectedClientIdRef");
  });

  it("Q: old native asset cleaned only after successful swap", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("deleteDraftVideoStorageBytes(previousDraft,");
    const index = read("src/lib/createDraftVideo/index.ts");
    expect(index).toContain("deleteDraftVideoStorageBytes");
    expect(index).toContain("protectLocalId");
  });

  it("R: no Bunny activity during add/replace", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("createPublishVideoUpload");
    expect(startFn).not.toContain("bunny-upload-init");
  });

  it("routing treats active-video pick as replace candidate", () => {
    const routed = routeWebLibraryFiles(
      [new File(["v"], "clip.mp4", { type: "video/mp4" })],
      { hasActiveVideo: true, imageSlotsRemaining: 5 },
    );
    expect(routed.video).not.toBeNull();
    expect(routed.replaceExistingVideo).toBe(true);
    expect(routed.rejectedExtraVideo).toBe(false);
  });

  it("Camera.recordVideo has no maxDuration option — post-validate only", () => {
    const defs = read(
      "node_modules/@capacitor/camera/dist/esm/definitions.d.ts",
    );
    const recordBlock = defs.slice(
      defs.indexOf("export interface RecordVideoOptions"),
      defs.indexOf("export interface PlayVideoOptions"),
    );
    expect(recordBlock).not.toMatch(/maxDuration|maximumDuration|durationLimit/i);
    const acquisition = read("src/lib/mediaAcquisition.ts");
    expect(acquisition).toContain("Camera.recordVideo({");
    expect(acquisition).not.toMatch(/maxDuration/);
  });
});
