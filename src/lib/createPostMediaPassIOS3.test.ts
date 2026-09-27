/**
 * PASS IOS3 — remove legacy iOS JS full-memory video publish fallback.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ECHO_VIDEO_UPLOAD_ERROR } from "../plugins/echoVideoUpload";
import type { BunnyUploadInitUploadRequired } from "./bunnyUpload/types";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

vi.mock("../plugins/echoVideoUpload", async () => {
  const actual = await vi.importActual<
    typeof import("../plugins/echoVideoUpload")
  >("../plugins/echoVideoUpload");
  return {
    ...actual,
    EchoVideoUpload: {
      getCapabilities: vi.fn(),
      startVideoUpload: vi.fn(),
      cancelVideoUpload: vi.fn(),
      addListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});

import { EchoVideoUpload } from "../plugins/echoVideoUpload";
import { uploadNativeVideoToBunnyTus } from "./bunnyUpload/uploadNativeVideoToBunnyTus";

const uploadRequiredInit = (): BunnyUploadInitUploadRequired => ({
  uploadRequired: true,
  tusEndpoint: "https://example.test/tus",
  authorizationSignature: "sig",
  authorizationExpire: 1,
  videoId: "v1",
  libraryId: "l1",
  mediaId: "m1",
  videoStatus: "uploading",
});

describe("PASS IOS3 — native-only Capacitor video publish", () => {
  beforeEach(() => {
    vi.mocked(EchoVideoUpload.getCapabilities).mockReset();
    vi.mocked(EchoVideoUpload.startVideoUpload).mockReset();
    vi.mocked(EchoVideoUpload.addListener).mockReset();
    vi.mocked(EchoVideoUpload.cancelVideoUpload).mockReset();
  });

  it("A: Web video → tus-js still present", () => {
    const tus = read("src/lib/bunnyUpload/bunnyTusUpload.ts");
    expect(tus).toContain("tus-js-client");
    expect(tus).toContain("uploadFileToBunnyTus");
    expect(tus).not.toContain("EchoVideoUpload");
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain('uploader: "web-tus-js"');
    expect(publish).toContain("uploadFileToBunnyTus");
  });

  it("B/C: Android + iOS video → native EchoVideoUpload", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(resolveBytes).toContain('kind: "native-path"');
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain("uploadNativeVideoToBunnyTus");
    expect(publish).toContain('uploader: "native-tus"');
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain('platform === "android" || platform === "ios"');
  });

  it("D/E: native unavailable → explicit failure; no legacy JS loader", async () => {
    vi.mocked(EchoVideoUpload.getCapabilities).mockResolvedValue({
      available: false,
      implementation: "web-stub",
      streaming: false,
    });

    await expect(
      uploadNativeVideoToBunnyTus({
        jobId: "j1",
        filePath: "create-drafts/x/y.mp4",
        fileSize: 100,
        fileName: "y.mp4",
        mimeType: "video/mp4",
        init: uploadRequiredInit(),
      }),
    ).rejects.toMatchObject({
      code: ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable,
    });

    expect(EchoVideoUpload.startVideoUpload).not.toHaveBeenCalled();
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).not.toContain("loadNativeDraftVideoFile");
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(native).toContain("native_video_upload_unavailable");
    expect(native).not.toContain("loadNativeDraftVideoFile");
    expect(native).not.toContain("Filesystem.readFile");
  });

  it("F/G/H/I: no native iOS video JS fallback; loader removed from publish path", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).not.toContain("loadNativeDraftVideoFile");
    expect(resolveBytes).not.toContain("Filesystem.readFile");
    expect(resolveBytes).not.toContain("atob");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("isNativeEchoVideoUploadPlatform()");
    expect(provider).toContain(
      "Capacitor native never materializes video File for publish",
    );
    const resolveDraft = read("src/lib/createDraftVideo/index.ts");
    expect(resolveDraft).toContain('localStorageKind === "native-fs"');
    expect(resolveDraft).toContain("return null");
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    expect(storage).toContain("Poster / frame-extract compatibility only");
    expect(storage).toContain("loadNativeDraftVideoFile");
  });

  it("J/K: prepared + original remain native-path", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain('assetKind = "prepared"');
    expect(resolveBytes).toContain("ready_prepared");
    expect(resolveBytes).toContain("ready_source");
    expect(resolveBytes).toContain("draft.localReference");
    expect(resolveBytes).toContain('kind: "native-path"');
  });

  it("L/M: resume + retry metadata preserved", () => {
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain("updateDraftVideoNativeTusUploadUrl");
    expect(publish).toContain("onUploadCreated");
    expect(publish).toContain("uploadUrl: bytes.uploadUrl");
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain("nativeTusUploadUrl");
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(native).toContain("uploadUrl");
    expect(native).toContain("stale uploadUrl");
    const types = read("src/lib/createDraftVideo/types.ts");
    expect(types).toContain("nativeTusUploadUrl");
    expect(types).toContain("remoteVideoId");
    expect(types).toContain("remoteMediaId");
  });

  it("N/O: poster + image upload unchanged", () => {
    const poster = read("src/lib/createDraftVideo/publishVideoPoster.ts");
    expect(poster).toContain("loadNativeDraftVideoFile");
    expect(poster).toContain("ensurePublishVideoPoster");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("startPostImageUploads");
    expect(provider).toContain("uploadNormalizedPostImage");
  });

  it("capabilities failure also typed unavailable", async () => {
    vi.mocked(EchoVideoUpload.getCapabilities).mockRejectedValue(
      new Error("plugin missing"),
    );
    await expect(
      uploadNativeVideoToBunnyTus({
        jobId: "j2",
        filePath: "create-drafts/x/y.mp4",
        fileSize: 100,
        fileName: "y.mp4",
        mimeType: "video/mp4",
        init: uploadRequiredInit(),
      }),
    ).rejects.toMatchObject({
      code: ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable,
    });
  });

  it("error code stable in plugin errors module", () => {
    expect(ECHO_VIDEO_UPLOAD_ERROR.native_video_upload_unavailable).toBe(
      "native_video_upload_unavailable",
    );
  });

  it("IOS2 plugin registration still present", () => {
    const vc = read("ios/App/App/MyViewController.swift");
    expect(vc).toContain("EchoVideoUploadPlugin");
    expect(vc).toContain("EchoVideoPreparePlugin");
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("EchoVideoUploadEngine.swift");
    expect(pbx).toContain("EchoVideoUploadPlugin.swift");
    expect(
      existsSync(
        join(
          process.cwd(),
          "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadPlugin.swift",
        ),
      ),
    ).toBe(true);
  });
});
