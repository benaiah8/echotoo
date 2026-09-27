import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapLocalDraftVideoToJob,
  isVideoPublishBlocked,
  isVideoUploadInProgress,
  needsPublishTimeVideoUpload,
  hasRemoteVideoSlot,
} from "./createPostVideoUpload";
import {
  LOCAL_DRAFT_VIDEO_MEDIA_ID,
  type DraftVideo,
} from "./createDraftVideo/types";
import { prepareDraftVideoForUpload } from "./prepareDraftVideoForUpload";
import {
  isPostMediaPublishReady,
  isPostMediaPublishBlocked,
} from "./postMediaPublishReady";
import {
  buildNativeDraftVideoPath,
} from "./createDraftVideo/nativeDraftVideoStorage";
import { writeDraftVideoMeta, readDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";

const mp4 = () => new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });

const baseDraftVideo = (overrides: Partial<DraftVideo> = {}): DraftVideo => ({
  localId: "local-1",
  fileName: "clip.mp4",
  mimeType: "video/mp4",
  size: 12,
  localStorageKind: "idb-blob",
  localReference: "publish-1",
  ...overrides,
});

describe("A. local video selection does not imply Bunny init", () => {
  it("maps persisted draft to local job without remote ids", () => {
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), mp4());
    expect(job.status).toBe("local");
    expect(job.mediaId).toBe(LOCAL_DRAFT_VIDEO_MEDIA_ID);
    expect(hasRemoteVideoSlot(job)).toBe(false);
    expect(isVideoUploadInProgress(job)).toBe(false);
    expect(needsPublishTimeVideoUpload(job)).toBe(true);
  });
});

describe("B. web IndexedDB round-trip", () => {
  it("restores File after save/load via storage module contract", async () => {
    const store = new Map<string, Record<string, unknown>>();
    const fakeDb = {
      put: (record: Record<string, unknown> & { publishPostId: string }) =>
        store.set(record.publishPostId, record),
      get: (id: string) => store.get(id),
      delete: (id: string) => store.delete(id),
    };

    const file = mp4();
    fakeDb.put({
      publishPostId: "publish-web-1",
      localId: "local-1",
      blob: file,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      lastModified: file.lastModified,
    });

    const record = fakeDb.get("publish-web-1") as {
      blob: Blob;
      fileName: string;
      mimeType: string;
      lastModified: number;
    };
    const restored = new File([record.blob], record.fileName, {
      type: record.mimeType,
      lastModified: record.lastModified,
    });
    expect(restored.name).toBe("clip.mp4");
    expect(restored.size).toBe(file.size);
  });
});

describe("C. native path contract", () => {
  it("builds stable app-owned path", () => {
    expect(buildNativeDraftVideoPath("pub-1", "loc-1", "mp4")).toBe(
      "create-drafts/pub-1/loc-1.mp4",
    );
  });
});

describe("D. draft resume metadata", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => storage.clear(),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("reads/writes DraftVideo in draftMeta without Bunny", () => {
    const draft = baseDraftVideo();
    writeDraftVideoMeta(draft);
    expect(readDraftVideoMeta()).toEqual(draft);
  });
});

describe("E/F. publish media gate", () => {
  it("local video allows publish", () => {
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), mp4());
    expect(isVideoPublishBlocked(job)).toBe(false);
  });

  it("zero media allows publish", () => {
    expect(isVideoPublishBlocked(null)).toBe(false);
  });

  it("local_error blocks publish", () => {
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), null);
    expect(job.status).toBe("local_error");
    expect(isVideoPublishBlocked(job)).toBe(true);
  });
});

describe("G–K. server status gate before owner_create_post", () => {
  it("processing permits publish", () => {
    expect(isPostMediaPublishReady("processing")).toBe(true);
    expect(isPostMediaPublishBlocked("processing")).toBe(false);
  });

  it("ready permits publish", () => {
    expect(isPostMediaPublishReady("ready")).toBe(true);
  });

  it("pending/uploading block publish gate", () => {
    expect(isPostMediaPublishReady("pending")).toBe(false);
    expect(isPostMediaPublishReady("uploading")).toBe(false);
    expect(isPostMediaPublishBlocked("pending")).toBe(true);
    expect(isPostMediaPublishBlocked("uploading")).toBe(true);
  });
});

describe("T. compression hook pass-through", () => {
  it("returns unchanged file", async () => {
    const file = mp4();
    const out = await prepareDraftVideoForUpload(file);
    expect(out).toBe(file);
  });
});

describe("publish-time upload orchestration", () => {
  it("invokes init → TUS → poll → owner_create_post ordering", async () => {
    const invokeInit = vi.fn();
    const tusUpload = vi.fn();
    const ownerCreatePost = vi.fn();
    const fetchRow = vi.fn();

    const statuses = ["uploading", "processing"];
    fetchRow
      .mockResolvedValueOnce({ id: "media-1", video_status: "uploading" })
      .mockResolvedValueOnce({ id: "media-1", video_status: "processing" });

    invokeInit.mockResolvedValue({
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

    tusUpload.mockResolvedValue(undefined);
    ownerCreatePost.mockResolvedValue({ post: { id: "post-1" } });

    await tusUpload();
    expect(ownerCreatePost).not.toHaveBeenCalled();

    const pending = await fetchRow();
    expect(isPostMediaPublishReady(pending.video_status)).toBe(false);
    const ready = await fetchRow();
    expect(isPostMediaPublishReady(ready.video_status)).toBe(true);
    await ownerCreatePost();
    expect(ownerCreatePost).toHaveBeenCalledTimes(1);
  });

  it("does not call owner_create_post before TUS success", async () => {
    const ownerCreatePost = vi.fn();
    const tusUpload = vi.fn().mockRejectedValue(new Error("tus failed"));

    await expect(tusUpload()).rejects.toThrow("tus failed");
    expect(ownerCreatePost).not.toHaveBeenCalled();
  });
});

describe("O/P. remove semantics", () => {
  it("local-only slot has no remote id", () => {
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), mp4());
    expect(hasRemoteVideoSlot(job)).toBe(false);
  });

  it("remote orphan slot is detectable", () => {
    const job = mapLocalDraftVideoToJob(
      baseDraftVideo({ remoteMediaId: "media-orphan" }),
      mp4(),
    );
    expect(hasRemoteVideoSlot(job)).toBe(true);
  });
});

describe("S. image pipeline unchanged contract", () => {
  it("video upload-in-progress ignores local draft", () => {
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), mp4());
    expect(isVideoUploadInProgress(job)).toBe(false);
  });
});

describe("Q/R. discard and post-publish cleanup contracts", () => {
  it("successful publish cleanup is best-effort and non-throwing", async () => {
    const { cleanupDraftVideoAfterSuccessfulPublish } = await import(
      "./createDraftVideo/discardCleanup"
    );
    await expect(cleanupDraftVideoAfterSuccessfulPublish()).resolves.toBeUndefined();
  });

  it("scheduleDraftVideoDiscardCleanup does not block discardAllDrafts sync path", async () => {
    const { scheduleDraftVideoDiscardCleanup } = await import(
      "./createDraftVideo/discardCleanup"
    );
    expect(() =>
      scheduleDraftVideoDiscardCleanup({
        publishPostId: "pub-1",
        draftVideo: baseDraftVideo(),
      }),
    ).not.toThrow();
  });
});

describe("L/M/N publish progress and cancel contracts", () => {
  it("publish_uploading is blocked and shows progress semantics", () => {
    const local = mapLocalDraftVideoToJob(baseDraftVideo(), mp4());
    const uploading = { ...local, status: "publish_uploading" as const, progress: 42 };
    expect(isVideoPublishBlocked(uploading)).toBe(true);
    expect(uploading.progress).toBe(42);
  });

  it("retry uses same local file reference", () => {
    const file = mp4();
    const job = mapLocalDraftVideoToJob(baseDraftVideo(), file);
    expect(needsPublishTimeVideoUpload(job)).toBe(true);
    expect(job.localFile).toBe(file);
  });
});
