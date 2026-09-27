/**
 * Crash-safe video replace + draft recovery — source/behavioral contracts.
 * Does not require a device, production DB, or Bunny.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VIDEO_ELEMENT_LOAD_TIMEOUT_MS,
  VideoElementLoadError,
  isVideoElementLoadError,
} from "./createDraftVideo/extractVideoPosterFrame";
import {
  classifyNativeVideoPersistError,
  saveNativeDraftVideoFile,
  saveNativeDraftVideoFromUri,
} from "./createDraftVideo/nativeDraftVideoStorage";
import { DRAFT_VIDEO_MISSING_MESSAGE } from "./createDraftVideo/types";
import { mapLocalDraftVideoToJob } from "./createPostVideoUpload";
import { deriveOwnerEditVideoOp } from "./editPublishedMedia";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const copyMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());
const deleteFileMock = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    mkdir: mkdirMock,
    copy: copyMock,
    writeFile: writeMock,
    stat: statMock,
    deleteFile: deleteFileMock,
  },
  Directory: { Data: "DATA" },
}));

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => true,
}));

describe("crash-safe video replace + draft recovery", () => {
  beforeEach(() => {
    copyMock.mockReset();
    writeMock.mockReset();
    mkdirMock.mockReset();
    statMock.mockReset();
    deleteFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
  });

  it("hydrate never auto-deletes draft video on missing preview or catch", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const hydrate = provider.slice(
      provider.indexOf("const hydrateLocalDraftVideo"),
      provider.indexOf("const hydrateLegacyRemoteVideo"),
    );
    expect(hydrate).not.toContain("deleteDraftVideo(");
    expect(hydrate).toContain("mapLocalDraftVideoToJob(draftVideo, null, null)");
    expect(hydrate).toContain(
      "Never auto-delete draft video meta/images on hydrate failure",
    );
  });

  it("missing preview maps to recoverable local_error without wiping meta", () => {
    const job = mapLocalDraftVideoToJob(
      {
        localId: "local-1",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        size: 1_000_000,
        localStorageKind: "native-fs",
        localReference: "create-drafts/post/local-1.mp4",
      },
      null,
      null,
    );
    expect(job.status).toBe("local_error");
    expect(job.errorMessage).toBe(DRAFT_VIDEO_MISSING_MESSAGE);
    expect(DRAFT_VIDEO_MISSING_MESSAGE).toMatch(/draft is safe/i);
  });

  it("native File persist forbids arrayBuffer/btoa path", async () => {
    const file = new File([new Uint8Array(64)], "clip.mp4", {
      type: "video/mp4",
    });
    const spy = vi.spyOn(file, "arrayBuffer");
    await expect(
      saveNativeDraftVideoFile("post-1", "local-1", file),
    ).rejects.toThrow("NATIVE_VIDEO_JS_PERSIST_FORBIDDEN");
    expect(spy).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    expect(classifyNativeVideoPersistError(new Error("NATIVE_VIDEO_JS_PERSIST_FORBIDDEN")))
      .toBe("js_persist_forbidden");
    spy.mockRestore();
  });

  it("URI copy failure never materializes File bytes in JS", async () => {
    copyMock.mockRejectedValue(new Error("copy failed"));
    const file = new File([new Uint8Array(1024)], "clip.mp4", {
      type: "video/mp4",
    });
    const spy = vi.spyOn(file, "arrayBuffer");
    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-1",
        "content://video/1",
        file,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");
    expect(spy).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("replace commits meta only after validation; cancels prep before overlap", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(start).toContain('cancelActiveDraftVideoPreparation("replace-start")');
    expect(start).toContain("commitMeta: false");
    expect(start.indexOf("writeDraftVideoMeta(withPreparation)")).toBeGreaterThan(
      start.indexOf("commitMeta: false"),
    );
    expect(start.indexOf("setVideoJob(hydrated)")).toBeGreaterThan(
      start.indexOf("writeDraftVideoMeta(withPreparation)"),
    );
    expect(start.indexOf("deleteDraftVideoStorageBytes(previousDraft,")).toBeGreaterThan(
      start.indexOf("setVideoJob(hydrated)"),
    );
    expect(start.indexOf("waitForCreatePreviewConsumerSwitch()")).toBeGreaterThan(
      start.indexOf("setVideoJob(hydrated)"),
    );
    expect(start.indexOf("deleteDraftVideoStorageBytes(previousDraft,")).toBeGreaterThan(
      start.indexOf("waitForCreatePreviewConsumerSwitch()"),
    );
    expect(start).toContain("protectLocalId: withPreparation.localId");
    expect(start).toContain(
      "protectLocalReference: withPreparation.localReference",
    );
    // Failed validation deletes only the uncommitted new bytes.
    expect(start).toContain("deleteDraftVideoStorageBytes(draftVideo)");
  });

  it("probe/poster load has a bounded timeout", () => {
    expect(VIDEO_ELEMENT_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(VIDEO_ELEMENT_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    const src = read("src/lib/createDraftVideo/extractVideoPosterFrame.ts");
    expect(src).toContain("Video metadata load timed out");
    expect(src).toContain("VIDEO_ELEMENT_LOAD_TIMEOUT_MS");
    const err = new VideoElementLoadError("timeout", "Video metadata load timed out");
    expect(isVideoElementLoadError(err)).toBe(true);
    expect(err.kind).toBe("timeout");
  });

  it("Owner Edit video mutations are derived; unsupported-gate stubs removed", () => {
    const gates = read("src/lib/editPublishedMedia.ts");
    expect(gates).toContain("deriveOwnerEditVideoOp");
    expect(gates).toContain("buildOwnerEditVideoEditPayload");
    expect(gates).not.toContain("editHasUnsupportedVideoMutation");
    expect(gates).not.toContain("EDIT_VIDEO_REPLACE_UNSUPPORTED_MESSAGE");
    expect(gates).not.toContain("EDIT_VIDEO_REMOVE_UNSUPPORTED_MESSAGE");
    expect(
      deriveOwnerEditVideoOp({
        videoJob: {
          mediaId: "draft-local",
          videoId: "draft-local",
          status: "local",
          progress: 0,
          videoStatus: "pending",
          localId: "x",
        },
        bootstrapPublishedVideo: {
          mediaId: "pub-1",
          bunnyVideoId: "bunny-1",
          status: "ready",
          posterUrl: null,
          width: null,
          height: null,
          durationSec: null,
        },
      }),
    ).toBe("REPLACE");
  });

  it("Create publish path still separate from local ingest", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(start).not.toContain("invokeBunnyUploadInit");
    expect(start).not.toContain("createPublishVideoUpload");
    expect(provider).toContain("const uploadVideoForPublish");
  });
});
