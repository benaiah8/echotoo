import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublishVideoUpload } from "./createPublishVideoUpload";

const mp4 = () => new File(["v"], "clip.mp4", { type: "video/mp4" });

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
  const actual = await importOriginal<typeof import("./postMediaPublishReady")>();
  return {
    ...actual,
    waitForPostMediaPublishReady: vi.fn(),
  };
});

import { invokeBunnyUploadInit } from "./bunnyUpload/invokeBunnyUploadInit";
import { uploadFileToBunnyTus } from "./bunnyUpload/bunnyTusUpload";
import { fetchPostMediaById } from "./postMediaRow";
import { waitForPostMediaPublishReady } from "./postMediaPublishReady";

describe("createPublishVideoUpload", () => {
  beforeEach(() => {
    vi.mocked(fetchPostMediaById).mockReset();
    vi.mocked(invokeBunnyUploadInit).mockReset();
    vi.mocked(uploadFileToBunnyTus).mockReset();
    vi.mocked(waitForPostMediaPublishReady).mockReset();
  });

  it("G: runs init → TUS → wait before returning success", async () => {
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

    const onProgress = vi.fn();
    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
      onProgress,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mediaId).toBe("media-1");
    }
    expect(invokeBunnyUploadInit).toHaveBeenCalledTimes(1);
    expect(uploadFileToBunnyTus).toHaveBeenCalledTimes(1);
    expect(waitForPostMediaPublishReady).toHaveBeenCalledWith(
      "media-1",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("H: does not wait for publish ready if TUS fails", async () => {
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
    vi.mocked(uploadFileToBunnyTus).mockRejectedValue(new Error("tus failed"));

    const result = await createPublishVideoUpload({
      publishPostId: "pub-1",
      bytes: { kind: "file", file: mp4() },
    });

    expect(result.ok).toBe(false);
    expect(waitForPostMediaPublishReady).not.toHaveBeenCalled();
  });

  it("skips TUS when uploadRequired=false and status is processing", async () => {
    vi.mocked(invokeBunnyUploadInit).mockResolvedValue({
      ok: true,
      data: {
        mediaId: "media-1",
        videoId: "vid-1",
        libraryId: "lib",
        videoStatus: "processing",
        uploadRequired: false,
        reused: true,
      },
    });
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
      draftVideo: {
        localId: "l1",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        size: 3,
        localStorageKind: "idb-blob",
        localReference: "pub-1",
        remoteMediaId: "media-1",
        remoteVideoId: "vid-1",
      },
    });

    expect(result.ok).toBe(true);
    expect(uploadFileToBunnyTus).not.toHaveBeenCalled();
  });

  it("N: reuses existing processing slot without re-init when already publish-ready", async () => {
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

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skippedUpload).toBe(true);
    expect(invokeBunnyUploadInit).not.toHaveBeenCalled();
    expect(uploadFileToBunnyTus).not.toHaveBeenCalled();
  });
});
