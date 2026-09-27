import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MediaResult } from "@capacitor/camera";
import {
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
  VIDEO_INACCESSIBLE_USER_MESSAGE,
  VIDEO_INGEST_UNEXPECTED_USER_MESSAGE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  VIDEO_TOO_LONG_USER_MESSAGE,
  VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
  messageForCreateVideoAcquisitionFailure,
  validateCreateVideoSource,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  MAX_CREATE_VIDEO_DURATION_SECONDS,
} from "./createDraftVideo/createVideoConstraints";
import { ADD_VIDEO_FAILED_USER_MESSAGE } from "./createDraftVideo/localVideoAsset";
import {
  buildNativeVideoCopySourceCandidates,
  classifyNativeVideoPersistError,
  saveNativeDraftVideoFromUri,
} from "./createDraftVideo/nativeDraftVideoStorage";
import {
  nativeVideoPickFromMediaResult,
  resolveNativeVideoSourceUri,
  videoMimeFromFormat,
} from "./mediaAcquisitionVideo";
import { partitionNativePickedMedia } from "./createPostMediaRouting";
import {
  logAndroidVideoIngestOutcome,
  ANDROID_VIDEO_DIAG_PREFIX,
} from "./devAndroidVideoDiagnostics";

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

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const mp4 = (name = "clip.mp4", size = 1024) =>
  new File([new Uint8Array(size)], name, { type: "video/mp4" });

function videoMediaResult(overrides: Partial<MediaResult> = {}): MediaResult {
  return {
    type: 1,
    uri: "content://media/external/video/42",
    path: "/storage/emulated/0/DCIM/clip.mp4",
    webPath: "capacitor://localhost/_capacitor_file_/clip.mp4",
    format: "mp4",
    metadata: { format: "mp4", size: 5_000_000, duration: 12 },
    ...overrides,
  } as MediaResult;
}

describe("Android video ingest reliability", () => {
  beforeEach(() => {
    copyMock.mockReset();
    writeMock.mockReset();
    mkdirMock.mockReset();
    statMock.mockReset();
    deleteFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
  });

  it("A: valid Android URI persists via Filesystem.copy (uri-copy)", async () => {
    copyMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 5_000_000 });
    const emptyMeta = new File([], "clip.mp4", { type: "video/mp4" });
    const result = await saveNativeDraftVideoFromUri(
      "post-a",
      "local-a",
      "content://media/external/video/1",
      emptyMeta,
    );
    expect(result.strategy).toBe("uri-copy");
    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("B: URI copy failure refuses File/base64 recovery (inaccessible)", async () => {
    copyMock
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"));
    const file = mp4();
    await expect(
      saveNativeDraftVideoFromUri(
        "post-b",
        "local-b",
        "file:///data/local/tmp/clip.mp4",
        file,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");
    expect(writeMock).not.toHaveBeenCalled();
    expect(buildNativeVideoCopySourceCandidates("file:///data/local/tmp/clip.mp4"))
      .toHaveLength(2);
  });

  it("C: unrecoverable inaccessible copy maps to clear user message", () => {
    expect(classifyNativeVideoPersistError(new Error("NATIVE_VIDEO_INACCESSIBLE")))
      .toBe("inaccessible");
    expect(messageForCreateVideoAcquisitionFailure("file_inaccessible")).toBe(
      VIDEO_INACCESSIBLE_USER_MESSAGE,
    );
    expect(VIDEO_INACCESSIBLE_USER_MESSAGE).toContain("Download it to your device");
  });

  it("D: unsupported container is rejected clearly (no silent MP4 default)", () => {
    expect(videoMimeFromFormat("webm")).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
    expect(videoMimeFromFormat("xyz")).toEqual({
      ok: false,
      reason: "format_unknown",
    });
    expect(videoMimeFromFormat("")).toEqual({
      ok: false,
      reason: "format_unknown",
    });
    expect(messageForCreateVideoAcquisitionFailure("unsupported_format")).toBe(
      VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
    );
    const bad = validateCreateVideoSource({
      name: "clip.webm",
      type: "video/webm",
      size: 1000,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("unsupported");
  });

  it("E: size / duration / resolution product limits remain", () => {
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_CREATE_VIDEO_DURATION_SECONDS).toBe(90);
    expect(messageForCreateVideoAcquisitionFailure("too_large")).toBe(
      VIDEO_TOO_LARGE_USER_MESSAGE,
    );
    expect(messageForCreateVideoAcquisitionFailure("too_long")).toBe(
      VIDEO_TOO_LONG_USER_MESSAGE,
    );
    expect(messageForCreateVideoAcquisitionFailure("too_high_resolution")).toBe(
      VIDEO_RESOLUTION_TOO_HIGH_USER_MESSAGE,
    );
    const huge = validateCreateVideoSource({
      name: "big.mp4",
      type: "video/mp4",
      size: MAX_CREATE_VIDEO_SOURCE_BYTES + 1,
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.reason).toBe("too-large");
  });

  it("F: unknown metadata format does not invent MP4 for metadata-only path", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      {
        ...videoMediaResult({
          metadata: { format: "mystery", size: 1_000_000 },
          webPath: undefined,
          uri: undefined,
        }),
        path: undefined,
      } as MediaResult,
      "library",
      { isNativePlatform: true },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("unsupported_format");
  });

  it("G: provider keeps video on poster failure (preview ≠ ingest rollback)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain(
      "Poster failure never rolls back ingest",
    );
    expect(provider).toContain("enrichLocalVideoPresentation");
    expect(provider).toContain("statNativeDraftVideoBytes");
    expect(provider).toMatch(/hasPreview[\s\S]*knownSize/);
  });

  it("H: mixed selection preserves images when video fails at pick", () => {
    const partitioned = partitionNativePickedMedia(
      [{ kind: "image", file: new File(["i"], "a.jpg", { type: "image/jpeg" }) }],
      { hasActiveVideo: false, imageSlotsRemaining: 10 },
    );
    expect(partitioned.images).toHaveLength(1);
    expect(partitioned.video).toBeNull();
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("if (videoFailure)");
    expect(picker).toContain("routeAndUploadSelectionRef.current");
  });

  it("I: library cancel remains empty / harmless", () => {
    const acquisition = read("src/lib/mediaAcquisition.ts");
    expect(acquisition).toContain("isCameraUserCancellation");
    expect(acquisition).toContain(
      "if (isCameraUserCancellation(error)) return empty;",
    );
    expect(acquisition).toContain("export async function pickMediaFromLibrary");
  });

  it("J: stale async selection cannot overwrite a newer selection", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("videoIngestGenerationRef");
    expect(provider).toContain("isStale");
    expect(provider).toContain("stale_selection");
  });

  it("K: failed ingestion clears loading when generation is current", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("setLocalVideoIngestPending(true)");
    expect(provider).toMatch(
      /finally \{[\s\S]*ingestGeneration === videoIngestGenerationRef\.current[\s\S]*setLocalVideoIngestPending\(false\)/,
    );
  });

  it("L: no duplicate copies — same destination path; empty-file refuses write", async () => {
    copyMock.mockRejectedValue(new Error("denied"));
    const empty = new File([], "clip.mp4", { type: "video/mp4" });
    await expect(
      saveNativeDraftVideoFromUri(
        "post-l",
        "local-l",
        "content://video/x",
        empty,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");
    expect(writeMock).not.toHaveBeenCalled();
    const candidates = buildNativeVideoCopySourceCandidates(
      "content://video/x",
    );
    expect(candidates).toEqual(["content://video/x"]);
  });

  it("M: photo gallery processing options stay off mixed/video pickers", () => {
    const acquisition = read("src/lib/mediaAcquisition.ts");
    const mixed = acquisition.slice(
      acquisition.indexOf("export async function pickMediaFromLibrary"),
      acquisition.indexOf("export async function recordVideoFromCamera"),
    );
    const videoOnly = acquisition.slice(
      acquisition.indexOf("export async function pickVideoFromLibrary"),
      acquisition.indexOf("export async function pickMediaFromLibrary"),
    );
    expect(mixed).not.toContain("NATIVE_GALLERY_PROCESSING");
    expect(mixed).not.toContain("targetWidth");
    expect(mixed).not.toContain("quality:");
    expect(videoOnly).not.toContain("NATIVE_GALLERY_PROCESSING");
    expect(acquisition).toMatch(
      /pickImagesFromLibrary[\s\S]*\.\.\.NATIVE_GALLERY_PROCESSING/,
    );
  });

  it("N: Publish/TUS path unchanged by ingest reliability files", () => {
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(storage).not.toContain("bunny-upload-init");
    expect(storage).not.toContain("invokeBunnyUploadInit");
    expect(storage).not.toMatch(/from ["'].*echoVideoUpload/);
    expect(publish).toContain("EchoVideoUpload");
    expect(messageForCreateVideoAcquisitionFailure("unexpected")).toBe(
      VIDEO_INGEST_UNEXPECTED_USER_MESSAGE,
    );
    expect(messageForCreateVideoAcquisitionFailure("persist_failed")).toBe(
      ADD_VIDEO_FAILED_USER_MESSAGE,
    );
  });

  it("path preference: content:// + absolute path prefers path", () => {
    expect(
      resolveNativeVideoSourceUri({
        uri: "content://media/external/video/9",
        path: "/storage/emulated/0/DCIM/a.mp4",
      }),
    ).toBe("/storage/emulated/0/DCIM/a.mp4");
  });

  it("ingest outcome logs safe fields via console.info (always-on)", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAndroidVideoIngestOutcome({
      stage: "persist",
      ok: false,
      reasonCode: "file_inaccessible",
      uriScheme: "content",
      persistStrategy: "uri-copy",
      hasSize: true,
      hasDuration: false,
    });
    expect(info).toHaveBeenCalledWith(
      `${ANDROID_VIDEO_DIAG_PREFIX} ANDROID_VIDEO_INGEST_OUTCOME`,
      expect.objectContaining({
        stage: "persist",
        ok: false,
        reasonCode: "file_inaccessible",
        uriScheme: "content",
        hasSize: true,
        hasDuration: false,
      }),
    );
    info.mockRestore();
  });

  it("pick failure with URI present is file_inaccessible", async () => {
    const outcome = await nativeVideoPickFromMediaResult(
      videoMediaResult({
        metadata: { format: "mp4", size: 1_000_000 },
        webPath: undefined,
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
    expect(outcome.reason).toBe("file_inaccessible");
    expect(outcome.message).toBe(VIDEO_INACCESSIBLE_USER_MESSAGE);
  });
});
