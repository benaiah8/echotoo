import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolvePreparedUploadAsset,
  resolveVideoPublishPreparationState,
} from "./createDraftVideo";
import type { DraftVideo } from "./createDraftVideo/types";
import { createPublishVideoUpload } from "./createPublishVideoUpload";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const baseDraft = (over: Partial<DraftVideo> = {}): DraftVideo => ({
  localId: "vid-1",
  fileName: "clip.mp4",
  mimeType: "video/mp4",
  size: 12_000_000,
  localStorageKind: "native-fs",
  localReference: "create-drafts/pub-1/vid-1.mp4",
  ...over,
});

describe("PASS P2 — prepare gate + native publish routing", () => {
  it("A: ready_source → source asset", () => {
    const draft = baseDraft({
      preparationStatus: "prepared",
      preparationStrategy: "passthrough",
    });
    expect(resolveVideoPublishPreparationState(draft)).toBe("ready_source");
    const asset = resolvePreparedUploadAsset(draft);
    expect(asset?.isSourcePassthrough).toBe(true);
    expect(asset?.reference).toBe(draft.localReference);
  });

  it("B: ready_prepared → prepared asset", () => {
    const draft = baseDraft({
      preparationStatus: "prepared",
      preparationStrategy: "transcode",
      preparedReference: "create-drafts/pub-1/vid-1.prepared.mp4",
      preparedStorageKind: "native-fs",
      preparedMimeType: "video/mp4",
      preparedSizeBytes: 4_000_000,
    });
    expect(resolveVideoPublishPreparationState(draft)).toBe("ready_prepared");
    const asset = resolvePreparedUploadAsset(draft);
    expect(asset?.isSourcePassthrough).toBe(false);
    expect(asset?.reference).toContain(".prepared.mp4");
  });

  it("C/E: wait_preparing + prepare_failed states", () => {
    expect(
      resolveVideoPublishPreparationState(
        baseDraft({ preparationStatus: "preparing" }),
      ),
    ).toBe("wait_preparing");
    expect(
      resolveVideoPublishPreparationState(
        baseDraft({ preparationStatus: "prepare_failed" }),
      ),
    ).toBe("blocked_prepare_failed");
  });

  it("D: needs_prepare when transcode not finished", () => {
    expect(
      resolveVideoPublishPreparationState(
        baseDraft({
          preparationStatus: "local_ready",
          preparationStrategy: "transcode",
        }),
      ),
    ).toBe("needs_prepare");
  });

  it("G/H/I: Android publish routes EchoVideoUpload; no loadNativeDraftVideoFile", () => {
    const publish = read("src/lib/createPublishVideoUpload.ts");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");

    expect(publish).toContain("uploadNativeVideoToBunnyTus");
    expect(publish).toContain("uploadFileToBunnyTus");
    expect(native).toContain("EchoVideoUpload");
    expect(native).toContain("startVideoUpload");
    expect(provider).toContain("EchoVideoUpload");
    expect(provider).toContain("ensurePublishVideoPreparation");
    expect(provider).toContain("resolvePublishVideoBytesSource");

    // Android/iOS path must not materialize full video for Bunny (native-path + stat only).
    expect(resolveBytes).toContain('kind: "native-path"');
    expect(resolveBytes).toContain("statNativeDraftVideoBytes");
    expect(resolveBytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(resolveBytes).not.toContain("loadNativeDraftVideoFile");
    expect(native).not.toContain("Filesystem.readFile");
    expect(native).not.toContain("atob");
    expect(native).not.toContain("new Blob");
    expect(native).not.toContain("new File");
  });

  it("J: web still uses tus-js-client", () => {
    const tus = read("src/lib/bunnyUpload/bunnyTusUpload.ts");
    expect(tus).toContain("tus-js-client");
    expect(tus).toContain("uploadFileToBunnyTus");
    expect(tus).not.toContain("EchoVideoUpload");
  });

  it("K: native uploadCreated persists uploadUrl", () => {
    const publish = read("src/lib/createPublishVideoUpload.ts");
    const meta = read("src/lib/createDraftVideo/draftVideoMeta.ts");
    const types = read("src/lib/createDraftVideo/types.ts");
    expect(types).toContain("nativeTusUploadUrl");
    expect(meta).toContain("updateDraftVideoNativeTusUploadUrl");
    expect(publish).toContain("updateDraftVideoNativeTusUploadUrl");
    expect(publish).toContain("onUploadCreated");
  });

  it("L/M: progress + processing phase wiring", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(provider).toContain("onProcessing");
    expect(provider).toContain("processing_video");
    expect(finalize).toContain("Preparing video…");
    expect(finalize).toContain("Processing video…");
    expect(finalize).toContain("preparing_video");
  });

  it("N: abort calls native cancellation", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("cancelVideoUpload");
    expect(provider).toContain("publishNativeUploadJobIdRef");
  });

  it("R/S/T: passthrough vs prepared selection helpers", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain('assetKind: "source" | "prepared"');
    expect(resolveBytes).toContain("ready_prepared");
    expect(resolveBytes).toContain(".prepared.mp4");
  });

  it("U/V: success cleanup clears draft meta including upload URL", () => {
    const cleanup = read("src/lib/createDraftVideo/index.ts");
    const discard = read("src/lib/createDraftVideo/discardCleanup.ts");
    expect(discard).toContain("cleanupDraftVideoAfterSuccessfulPublish");
    expect(cleanup).toContain("writeDraftVideoMeta(null)");
    const meta = read("src/lib/createDraftVideo/draftVideoMeta.ts");
    expect(meta).toContain("nativeTusUploadUrl: null");
  });

  it("W/X/Y: no DB/backend/media_order/image redesign in P2", () => {
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).not.toContain("media_order");
    expect(publish).not.toContain("owner_create_post");
    expect(publish).not.toContain("functions.invoke(\"bunny");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    // Images still use existing startPostImageUploads path.
    expect(provider).toContain("startPostImageUploads");
    expect(provider).toContain("uploadNormalizedPostImage");
  });

  it("prep gate module exists", () => {
    const gate = read("src/lib/createDraftVideo/ensurePublishVideoPreparation.ts");
    expect(gate).toContain("ensurePublishVideoPreparation");
    expect(gate).toContain("awaitActiveDraftVideoPreparation");
    expect(gate).toContain("ensureDraftVideoPreparationStarted");
    expect(gate).toContain("blocked_prepare_failed");
  });
});

vi.mock("./bunnyUpload/invokeBunnyUploadInit", () => ({
  invokeBunnyUploadInit: vi.fn(),
}));

vi.mock("./bunnyUpload/bunnyTusUpload", () => ({
  uploadFileToBunnyTus: vi.fn(),
  assertUploadRequiredInit: vi.fn(),
}));

vi.mock("./bunnyUpload/uploadNativeVideoToBunnyTus", () => ({
  uploadNativeVideoToBunnyTus: vi.fn(),
}));

vi.mock("./bunnyUpload/bunnyTusSingleFlight", () => ({
  runBunnyTusSingleFlight: vi.fn((_id: string, fn: () => Promise<void>) => fn()),
  clearBunnyTusSingleFlight: vi.fn(),
}));

vi.mock("./createDraftVideo/draftVideoMeta", () => ({
  updateDraftVideoRemoteIds: vi.fn(),
  updateDraftVideoNativeTusUploadUrl: vi.fn(),
}));

vi.mock("./postMediaRow", () => ({
  fetchPostMediaById: vi.fn(),
}));

vi.mock("./postMediaPublishReady", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./postMediaPublishReady")>();
  return {
    ...actual,
    waitForPostMediaPublishReady: vi.fn(),
  };
});

import { invokeBunnyUploadInit } from "./bunnyUpload/invokeBunnyUploadInit";
import { uploadFileToBunnyTus } from "./bunnyUpload/bunnyTusUpload";
import { uploadNativeVideoToBunnyTus } from "./bunnyUpload/uploadNativeVideoToBunnyTus";
import { fetchPostMediaById } from "./postMediaRow";
import { waitForPostMediaPublishReady } from "./postMediaPublishReady";
import { updateDraftVideoNativeTusUploadUrl } from "./createDraftVideo/draftVideoMeta";

describe("PASS P2 — createPublishVideoUpload byte abstraction", () => {
  beforeEach(() => {
    vi.mocked(fetchPostMediaById).mockReset();
    vi.mocked(invokeBunnyUploadInit).mockReset();
    vi.mocked(uploadFileToBunnyTus).mockReset();
    vi.mocked(uploadNativeVideoToBunnyTus).mockReset();
    vi.mocked(waitForPostMediaPublishReady).mockReset();
    vi.mocked(updateDraftVideoNativeTusUploadUrl).mockReset();
  });

  it("web file path still calls uploadFileToBunnyTus", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue({
      ok: true,
      data: {
        mediaId: "media-1",
        videoId: "vid-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://tus",
        authorizationExpire: 1,
        authorizationSignature: "sig",
      },
    });
    vi.mocked(uploadFileToBunnyTus).mockResolvedValue(undefined);
    vi.mocked(waitForPostMediaPublishReady).mockResolvedValue({
      id: "media-1",
      publish_post_id: "pub-1",
      owner_user_id: "u1",
      post_id: null,
      bunny_video_id: "vid-1",
      video_status: "processing",
      poster_url: null,
    });

    const file = new File(["v"], "clip.mp4", { type: "video/mp4" });
    const onProcessing = vi.fn();
    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file },
      onProcessing,
    });

    expect(result.ok).toBe(true);
    expect(uploadFileToBunnyTus).toHaveBeenCalledTimes(1);
    expect(uploadNativeVideoToBunnyTus).not.toHaveBeenCalled();
    expect(onProcessing).toHaveBeenCalled();
  });

  it("Q: Android native path calls EchoVideoUpload wrapper", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue({
      ok: true,
      data: {
        mediaId: "media-1",
        videoId: "vid-1",
        libraryId: "lib",
        videoStatus: "pending",
        uploadRequired: true,
        tusEndpoint: "https://tus",
        authorizationExpire: 1,
        authorizationSignature: "sig",
      },
    });
    vi.mocked(uploadNativeVideoToBunnyTus).mockResolvedValue(undefined);
    vi.mocked(waitForPostMediaPublishReady).mockResolvedValue({
      id: "media-1",
      publish_post_id: "pub-1",
      owner_user_id: "u1",
      post_id: null,
      bunny_video_id: "vid-1",
      video_status: "processing",
      poster_url: null,
    });

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: {
        kind: "native-path",
        filePath: "create-drafts/pub-1/vid-1.prepared.mp4",
        fileName: "vid-1.prepared.mp4",
        mimeType: "video/mp4",
        fileSize: 4_000_000,
        uploadUrl: "https://tus/existing",
        uploadJobId: "job-1",
      },
    });

    expect(result.ok).toBe(true);
    expect(uploadNativeVideoToBunnyTus).toHaveBeenCalledTimes(1);
    expect(uploadFileToBunnyTus).not.toHaveBeenCalled();
    const call = vi.mocked(uploadNativeVideoToBunnyTus).mock.calls[0][0];
    expect(call.uploadUrl).toBe("https://tus/existing");
    expect(call.filePath).toContain(".prepared.mp4");
  });

  it("Q: retry with processing remote skips re-upload", async () => {
    vi.mocked(fetchPostMediaById).mockResolvedValue({
      id: "media-existing",
      publish_post_id: "pub-1",
      owner_user_id: "u1",
      post_id: null,
      bunny_video_id: "vid-1",
      video_status: "processing",
      poster_url: null,
    });

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: {
        kind: "file",
        file: new File(["v"], "clip.mp4", { type: "video/mp4" }),
      },
      draftVideo: baseDraft({
        remoteMediaId: "media-existing",
        remoteVideoId: "vid-1",
        localStorageKind: "idb-blob",
        localReference: "pub-1",
      }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skippedUpload).toBe(true);
    expect(invokeBunnyUploadInit).not.toHaveBeenCalled();
    expect(uploadFileToBunnyTus).not.toHaveBeenCalled();
    expect(uploadNativeVideoToBunnyTus).not.toHaveBeenCalled();
  });
});
