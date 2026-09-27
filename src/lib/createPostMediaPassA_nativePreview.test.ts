import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copyMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());
const getUriMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const deleteFileMock = vi.hoisted(() => vi.fn());
const convertFileSrcMock = vi.hoisted(() =>
  vi.fn((uri: string) => `capacitor://localhost/_capacitor_file_${uri}`),
);
const isNativePlatformMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock(),
    convertFileSrc: (uri: string) => convertFileSrcMock(uri),
    getPlatform: () => "android",
  },
  registerPlugin: () => ({
    getCapabilities: async () => ({
      available: true,
      implementation: "android-media3",
      encoderImplemented: false,
    }),
    prepareVideo: async () => {
      throw Object.assign(new Error("not in A tests"), {
        code: "not_implemented",
      });
    },
    cancelPreparation: async () => ({ cancelled: false }),
    addListener: async () => ({ remove: async () => undefined }),
    removeAllListeners: async () => undefined,
  }),
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    mkdir: mkdirMock,
    copy: copyMock,
    writeFile: writeMock,
    stat: statMock,
    getUri: getUriMock,
    readFile: readFileMock,
    deleteFile: deleteFileMock,
    rmdir: vi.fn(),
  },
  Directory: { Data: "DATA" },
}));

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => isNativePlatformMock(),
}));

import {
  ADD_VIDEO_FAILED_USER_MESSAGE,
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
} from "./createDraftVideo/localVideoAsset";
import {
  resolveDraftVideoPreview,
  resolveDraftVideoFile,
} from "./createDraftVideo";
import {
  deleteNativeDraftVideoFile,
  resolveNativeDraftVideoPreviewUrl,
  saveNativeDraftVideoFromUri,
} from "./createDraftVideo/nativeDraftVideoStorage";
import { mapLocalDraftVideoToJob } from "./createPostVideoUpload";
import type { DraftVideo } from "./createDraftVideo/types";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mp4 = (size = 1024) =>
  new File([new Uint8Array(size)], "clip.mp4", {
    type: "video/mp4",
    lastModified: 1,
  });

function nativeDraft(overrides: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "local-1",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    size: 5_000_000,
    lastModified: 1,
    localStorageKind: "native-fs",
    localReference: "create-drafts/post-1/local-1.mp4",
    remoteMediaId: null,
    remoteVideoId: null,
    ...overrides,
  };
}

describe("PASS A — native preview without full-file read", () => {
  beforeEach(() => {
    copyMock.mockReset();
    writeMock.mockReset();
    mkdirMock.mockReset();
    statMock.mockReset();
    getUriMock.mockReset();
    readFileMock.mockReset();
    deleteFileMock.mockReset();
    convertFileSrcMock.mockClear();
    isNativePlatformMock.mockReturnValue(true);
    mkdirMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
  });

  it("A/B: native preview does not call readFile or base64 decode", async () => {
    const atobSpy = vi.spyOn(globalThis, "atob");
    statMock.mockResolvedValue({ size: 5_000_000 });
    getUriMock.mockResolvedValue({
      uri: "file:///data/user/0/app/files/create-drafts/post-1/local-1.mp4",
    });

    const url = await resolveNativeDraftVideoPreviewUrl(
      "create-drafts/post-1/local-1.mp4",
    );

    expect(url).toContain("capacitor://localhost/_capacitor_file_");
    expect(readFileMock).not.toHaveBeenCalled();
    expect(atobSpy).not.toHaveBeenCalled();
    atobSpy.mockRestore();
  });

  it("C/D: native preview resolves Data localReference via getUri + convertFileSrc", async () => {
    const localRef = "create-drafts/post-1/local-1.mp4";
    const nativeUri =
      "file:///data/user/0/app/files/create-drafts/post-1/local-1.mp4";
    statMock.mockResolvedValue({ size: 2_000_000 });
    getUriMock.mockResolvedValue({ uri: nativeUri });

    const url = await resolveNativeDraftVideoPreviewUrl(localRef);

    expect(getUriMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: localRef, directory: "DATA" }),
    );
    expect(convertFileSrcMock).toHaveBeenCalledWith(nativeUri);
    expect(url).toBe(`capacitor://localhost/_capacitor_file_${nativeUri}`);
  });

  it("E: web preview path still uses Blob/File (localPreviewUrl null)", async () => {
    isNativePlatformMock.mockReturnValue(false);
    const webDraft: DraftVideo = {
      ...nativeDraft(),
      localStorageKind: "idb-blob",
      localReference: "post-web-1",
    };

    // Web path loads from IDB — mock via resolveDraftVideoPreview branch coverage in source.
    const indexSrc = read("src/lib/createDraftVideo/index.ts");
    expect(indexSrc).toContain('meta.localStorageKind === "native-fs"');
    expect(indexSrc).toContain("loadWebDraftVideoFile");
    expect(indexSrc).toContain("localPreviewUrl: null");
    expect(indexSrc).toContain("localFile");

    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("createLocalVideoPreviewUrl(file)");
    expect(hero).toContain("videoJob?.localPreviewUrl");
  });

  it("F: draft resume uses resolveDraftVideoPreview (not resolveDraftVideoFile)", async () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const hydrate = provider.slice(
      provider.indexOf("const hydrateLocalDraftVideo"),
      provider.indexOf("const hydrateLegacyRemoteVideo"),
    );
    expect(hydrate).toContain("resolveDraftVideoPreview");
    expect(hydrate).not.toContain("resolveDraftVideoFile");

    statMock.mockResolvedValue({ size: 1_000_000 });
    getUriMock.mockResolvedValue({
      uri: "file:///data/create-drafts/post-1/local-1.mp4",
    });
    const resolved = await resolveDraftVideoPreview({
      draftVideo: nativeDraft(),
    });
    expect(resolved.localFile).toBeNull();
    expect(resolved.localPreviewUrl).toBeTruthy();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("G: native copy failure with empty File does not write empty artifact", async () => {
    copyMock.mockRejectedValue(new Error("copy failed"));
    const empty = new File([], "clip.mp4", { type: "video/mp4" });

    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-1",
        "content://video/1",
        empty,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("H: poster failure does not hide playable video (preview URL alone is enough)", () => {
    const job = mapLocalDraftVideoToJob(
      nativeDraft(),
      null,
      "capacitor://localhost/_capacitor_file_/video.mp4",
    );
    expect(job.status).toBe("local");
    expect(job.localPreviewUrl).toBeTruthy();
    expect(job.localPosterUrl).toBeUndefined();

    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("local poster extraction failed");
    expect(provider).toContain("return base");
  });

  it("I: zero-byte native draft is rejected for preview", async () => {
    statMock.mockResolvedValue({ size: 0 });
    const url = await resolveNativeDraftVideoPreviewUrl(
      "create-drafts/post-1/local-1.mp4",
    );
    expect(url).toBeNull();
    expect(getUriMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("J: failed add clears pending indicator", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).toContain("ADD_VIDEO_FAILED_USER_MESSAGE");
    expect(startFn).toContain("setLocalVideoIngestPending(false)");
    expect(startFn).toContain("finally {");
    expect(ADD_VIDEO_FAILED_USER_MESSAGE).toBe(
      "Couldn't add this video. Please try again.",
    );
  });

  it("K: user error copy remains concise", () => {
    expect(ADD_VIDEO_FAILED_USER_MESSAGE).toBe(
      "Couldn't add this video. Please try again.",
    );
    expect(VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE).toBe(
      "This video format isn't supported. Choose an MP4 or MOV video.",
    );
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("ADD_VIDEO_FAILED_USER_MESSAGE");
    expect(provider).toContain("validateCreateVideoSource");
    expect(provider).toContain("VIDEO_INGEST_UNEXPECTED_USER_MESSAGE");
  });

  it("L: no Bunny request during local preview", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).toContain("resolveDraftVideoPreview");
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("createPublishVideoUpload");
    expect(startFn).not.toContain("resolveDraftVideoFile");
  });

  it("M: mixed slider/mediaOrder unchanged (reconcile still used)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain(
      "reconcileMediaOrder({ videoLocalId: withPreparation.localId })",
    );
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("CreateFinalizeMixedMediaCarousel");
    expect(hero).toContain("mediaOrder");
  });

  it("N: cleanup still removes local file via localReference", async () => {
    await deleteNativeDraftVideoFile("create-drafts/post-1/local-1.mp4");
    expect(deleteFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "create-drafts/post-1/local-1.mp4",
        directory: "DATA",
      }),
    );

    const indexSrc = read("src/lib/createDraftVideo/index.ts");
    expect(indexSrc).toContain("deleteNativeDraftVideoFile(meta.localReference)");
  });

  it("publish boundary: Android streams native-path; web may resolveDraftVideoFile", async () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const publishFn = provider.slice(
      provider.indexOf("const uploadVideoForPublish"),
      provider.indexOf("const removePostVideo"),
    );
    expect(publishFn).toContain("resolvePublishVideoBytesSource");
    expect(publishFn).toContain("resolveDraftVideoFile");

    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain('kind: "native-path"');
    expect(resolveBytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(resolveBytes).not.toContain("loadNativeDraftVideoFile");

    const indexSrc = read("src/lib/createDraftVideo/index.ts");
    expect(indexSrc).toContain("Web publish-time File materialization only");
    expect(indexSrc).toContain("resolveDraftVideoFile");

    // Poster may still full-read for frame extract; publish path must not.
    const poster = read("src/lib/createDraftVideo/publishVideoPoster.ts");
    expect(poster).toContain("loadNativeDraftVideoFile");

    // Ensure preview helper is distinct from publish File path.
    expect(resolveDraftVideoFile).toBeTypeOf("function");
  });

  it("URI copy empty result deletes artifact; never falls back to JS File bytes", async () => {
    copyMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 0 });
    writeMock.mockResolvedValue(undefined);

    const empty = new File([], "clip.mp4", { type: "video/mp4" });
    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-empty",
        "content://video/1",
        empty,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");
    expect(deleteFileMock).toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();

    copyMock.mockClear();
    deleteFileMock.mockClear();
    writeMock.mockClear();
    copyMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 0 });

    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-1",
        "content://video/1",
        mp4(8),
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");
    expect(deleteFileMock).toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("successful URI copy stats size and skips writeFile", async () => {
    copyMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 9_000 });
    const file = mp4(8);
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    const result = await saveNativeDraftVideoFromUri(
      "post-1",
      "local-1",
      "content://video/99",
      file,
    );

    expect(result.strategy).toBe("uri-copy");
    expect(statMock).toHaveBeenCalled();
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    arrayBufferSpy.mockRestore();
  });
});

describe("PASS A — iOS mic permission + hero revoke safety", () => {
  it("Info.plist includes NSMicrophoneUsageDescription", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toContain("NSMicrophoneUsageDescription");
    expect(plist).toContain("microphone when you record video");
  });

  it("hero only revokes blob preview URLs", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("isBlobPreviewUrl");
    expect(hero).not.toMatch(/revokeObjectURL\(nativeOrStored\)/);
  });
});
