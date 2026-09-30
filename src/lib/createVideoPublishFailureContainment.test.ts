import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ECHO_VIDEO_UPLOAD_ERROR } from "../plugins/echoVideoUpload/errors";
import {
  classifyEchoVideoUploadErrorCode,
  userFacingUploadError,
  VIDEO_UPLOAD_AUTH_FAILED_USER_MESSAGE,
  VIDEO_UPLOAD_FILE_INACCESSIBLE_USER_MESSAGE,
  VIDEO_UPLOAD_GENERIC_USER_MESSAGE,
  VIDEO_UPLOAD_NETWORK_USER_MESSAGE,
} from "./bunnyUpload/uploadNativeVideoToBunnyTus";
import {
  mapWaitForPostMediaPublishReadyError,
  VIDEO_PROCESSING_FAILED_USER_MESSAGE,
  VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE,
  waitForPostMediaPublishReadySettled,
} from "./postMediaPublishReady";

vi.mock("./reportVideoPublishFailure", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./reportVideoPublishFailure")>();
  return {
    ...actual,
    reportVideoPublishFailure: vi.fn(),
  };
});

import {
  createPublishVideoUpload,
  logPublishFailureOutcome,
} from "./createPublishVideoUpload";
import { updateDraftVideoRemoteIds } from "./createDraftVideo/draftVideoMeta";

const mp4 = () => new File(["v"], "clip.mp4", { type: "video/mp4" });

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

vi.mock("./bunnyUpload/invokeBunnyUploadInit", () => ({
  invokeBunnyUploadInit: vi.fn(),
}));

vi.mock("./bunnyUpload/bunnyTusUpload", () => ({
  uploadFileToBunnyTus: vi.fn(),
  assertUploadRequiredInit: vi.fn(),
}));

vi.mock("./bunnyUpload/uploadNativeVideoToBunnyTus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./bunnyUpload/uploadNativeVideoToBunnyTus")>();
  return {
    ...actual,
    uploadNativeVideoToBunnyTus: vi.fn(),
  };
});

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
import { fetchPostMediaById } from "./postMediaRow";
import { waitForPostMediaPublishReady } from "./postMediaPublishReady";

function uploadRequiredInit(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      mediaId: "media-1",
      videoId: "vid-1",
      libraryId: "lib",
      videoStatus: "pending" as const,
      uploadRequired: true as const,
      tusEndpoint: "https://tus.example",
      authorizationExpire: 1,
      authorizationSignature: "sig",
      ...overrides,
    },
  };
}

describe("Create video publish failure containment", () => {
  beforeEach(() => {
    vi.mocked(fetchPostMediaById).mockReset();
    vi.mocked(invokeBunnyUploadInit).mockReset();
    vi.mocked(uploadFileToBunnyTus).mockReset();
    vi.mocked(waitForPostMediaPublishReady).mockReset();
    vi.mocked(updateDraftVideoRemoteIds).mockReset();
  });

  it("A: processing rejection returns a typed failure Result", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue(uploadRequiredInit());
    vi.mocked(uploadFileToBunnyTus).mockResolvedValue(undefined);
    vi.mocked(waitForPostMediaPublishReady).mockRejectedValue(
      new Error(VIDEO_PROCESSING_FAILED_USER_MESSAGE),
    );

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
    });

    expect(result).toEqual({
      ok: false,
      error: VIDEO_PROCESSING_FAILED_USER_MESSAGE,
    });
    expect(updateDraftVideoRemoteIds).toHaveBeenCalledWith("media-1", "vid-1");
  });

  it("B: processing timeout does not report success", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue(uploadRequiredInit());
    vi.mocked(uploadFileToBunnyTus).mockResolvedValue(undefined);
    vi.mocked(waitForPostMediaPublishReady).mockRejectedValue(
      new Error(VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE),
    );

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE);
    }
  });

  it("mapWaitForPostMediaPublishReadyError covers abort / failed / timeout", () => {
    expect(mapWaitForPostMediaPublishReadyError(new DOMException("x", "AbortError")))
      .toMatchObject({ ok: false, code: "cancelled" });
    expect(
      mapWaitForPostMediaPublishReadyError(
        new Error(VIDEO_PROCESSING_FAILED_USER_MESSAGE),
      ),
    ).toMatchObject({ ok: false, code: "processing_failed" });
    expect(
      mapWaitForPostMediaPublishReadyError(
        new Error(VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE),
      ),
    ).toMatchObject({ ok: false, code: "timeout" });
  });

  it("waitForPostMediaPublishReadySettled never rejects", async () => {
    // Use real poller + failed row (do not mock waitForPostMediaPublishReady —
    // Settled closes over the unmocked function at module load).
    vi.mocked(fetchPostMediaById).mockResolvedValue({
      id: "media-1",
      publish_post_id: "pub-1",
      owner_user_id: "u1",
      post_id: null,
      bunny_video_id: "vid-1",
      video_status: "failed",
      poster_url: null,
    });
    // Temporarily restore real wait by calling Settled path via map only when
    // the throwing wait is exercised through Settled's own module binding —
    // assert the Result mapper + Settled export shape instead.
    const settled = await waitForPostMediaPublishReadySettled("media-1", {
      maxAttempts: 1,
    });
    // When Ready is mocked to vi.fn() with no implementation, Settled uses the
    // original Ready which fetches the failed row above.
    expect(settled.ok).toBe(false);
    if (!settled.ok) {
      expect(settled.code).toBe("processing_failed");
      expect(settled.error).toBe(VIDEO_PROCESSING_FAILED_USER_MESSAGE);
    }
  });

  it("C: network failure retains remote draft identity (no clear)", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue(uploadRequiredInit());
    const netErr = Object.assign(new Error(VIDEO_UPLOAD_NETWORK_USER_MESSAGE), {
      code: ECHO_VIDEO_UPLOAD_ERROR.network_failed,
    });
    vi.mocked(uploadFileToBunnyTus).mockRejectedValue(netErr);

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
      draftVideo: {
        localId: "l1",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        size: 3,
        localStorageKind: "idb-blob",
        localReference: "pub-1",
        remoteMediaId: null,
        remoteVideoId: null,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(VIDEO_UPLOAD_NETWORK_USER_MESSAGE);
    }
    expect(updateDraftVideoRemoteIds).toHaveBeenCalledWith("media-1", "vid-1");
    const uploadFn = read(
      "src/components/create/CreatePostMediaProvider.tsx",
    ).slice(
      read("src/components/create/CreatePostMediaProvider.tsx").indexOf(
        "const uploadVideoForPublish",
      ),
      read("src/components/create/CreatePostMediaProvider.tsx").indexOf(
        "const cancelPublishVideoUpload",
      ),
    );
    expect(uploadFn).not.toContain("clearDraftVideoRemoteIds");
  });

  it("D: cancellation does not create a post (upload Result cancelled)", async () => {
    const signal = AbortSignal.abort();
    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
      signal,
    });
    expect(result).toEqual({ ok: false, error: "Upload cancelled." });
    expect(invokeBunnyUploadInit).not.toHaveBeenCalled();
  });

  it("E: native error codes map accurately", () => {
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.network_failed))
      .toBe("network");
    expect(userFacingUploadError(ECHO_VIDEO_UPLOAD_ERROR.network_failed)).toBe(
      VIDEO_UPLOAD_NETWORK_USER_MESSAGE,
    );
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.auth_failed))
      .toBe("auth_failed");
    expect(userFacingUploadError(ECHO_VIDEO_UPLOAD_ERROR.auth_failed)).toBe(
      VIDEO_UPLOAD_AUTH_FAILED_USER_MESSAGE,
    );
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.file_missing))
      .toBe("file_inaccessible");
    expect(userFacingUploadError(ECHO_VIDEO_UPLOAD_ERROR.file_missing)).toBe(
      VIDEO_UPLOAD_FILE_INACCESSIBLE_USER_MESSAGE,
    );
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.cancelled))
      .toBe("cancelled");
  });

  it("F: unknown native errors remain recoverable generic", () => {
    expect(classifyEchoVideoUploadErrorCode("totally_made_up")).toBe("unknown");
    expect(userFacingUploadError("totally_made_up")).toBe(
      VIDEO_UPLOAD_GENERIC_USER_MESSAGE,
    );
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.tus_create_failed))
      .toBe("unknown");
    expect(classifyEchoVideoUploadErrorCode(ECHO_VIDEO_UPLOAD_ERROR.server_failed))
      .toBe("unknown");
  });

  it("G/H: skip-if-ready avoids duplicate TUS; processing/ready reuses slot", async () => {
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
      bytes: { kind: "file", file: mp4() },
      draftVideo: {
        localId: "l1",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        size: 3,
        localStorageKind: "idb-blob",
        localReference: "pub-1",
        remoteMediaId: "media-existing",
        remoteVideoId: "vid-1",
      },
    });

    expect(result).toEqual({
      ok: true,
      mediaId: "media-existing",
      skippedUpload: true,
    });
    expect(uploadFileToBunnyTus).not.toHaveBeenCalled();
    expect(invokeBunnyUploadInit).not.toHaveBeenCalled();
  });

  it("I: provider settles progress on failure", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const uploadVideoForPublish"),
      provider.indexOf("const cancelPublishVideoUpload"),
    );
    expect(startFn).toContain("setPublishVideoUploadProgress(null)");
    expect(startFn).toContain("status: \"local\"");
    expect(startFn).toContain("logPublishFailureOutcome");
  });

  it("J: successful publish path still returns ok with mediaId", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue(uploadRequiredInit());
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

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
    });

    expect(result).toEqual({
      ok: true,
      mediaId: "media-1",
      skippedUpload: false,
    });
  });

  it("K: Android library selection reliability suite file still present", () => {
    const ingest = read("src/lib/androidVideoIngestReliability.test.ts");
    expect(ingest).toContain("Android video ingest reliability");
    expect(ingest).toContain("pickMediaFromLibrary");
  });

  it("createPublishVideoUpload contains processing via Result (no bare await throw)", () => {
    const src = read("src/lib/createPublishVideoUpload.ts");
    expect(src).toContain("awaitPublishProcessingGate");
    expect(src).toContain("mapWaitForPostMediaPublishReadyError");
    expect(src).not.toMatch(
      /onProcessing\?\.\(\);\s*await waitForPostMediaPublishReady\(/,
    );
  });

  it("PUBLISH_FAILURE_OUTCOME is always-on via console.info", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPublishFailureOutcome({
      stage: "processing",
      errorCode: "timeout",
      recoverable: true,
    });
    expect(info).toHaveBeenCalledWith(
      "[echotoo video publish] PUBLISH_FAILURE_OUTCOME",
      expect.objectContaining({
        stage: "processing",
        errorCode: "timeout",
        recoverable: true,
      }),
    );
    info.mockRestore();
  });
});
