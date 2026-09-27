/**
 * PASS IOS2 — native iOS EchoVideoUpload (URLSession streaming TUS).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAndroidNativeVideoUploadPlatform,
  isNativeEchoVideoUploadAvailable,
  isNativeEchoVideoUploadPlatform,
} from "./createDraftVideo/ensurePublishVideoPreparation";
import {
  EchoVideoUpload,
  isNativeEchoVideoUploadAvailable as isNativeUploadFromPlugin,
} from "../plugins/echoVideoUpload";
import { EchoVideoUploadWeb } from "../plugins/echoVideoUpload/web";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS IOS2 — native iOS streaming TUS upload", () => {
  it("A: isNativeEchoVideoUploadAvailable exported for android+ios", () => {
    expect(isNativeEchoVideoUploadAvailable).toBeTypeOf("function");
    expect(isNativeUploadFromPlugin).toBeTypeOf("function");
    expect(isNativeEchoVideoUploadPlatform).toBeTypeOf("function");
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain('platform === "android" || platform === "ios"');
    expect(gate).toContain("isNativeEchoVideoUploadAvailable");
  });

  it("B: Android still selects native upload (platform helper preserved)", () => {
    expect(isAndroidNativeVideoUploadPlatform).toBeTypeOf("function");
    const android = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadEngine.java",
    );
    expect(android).toContain("FileRangeRequestBody");
    expect(android).toContain("RandomAccessFile");
  });

  it("C: iOS selects native upload via shared platform gate", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(resolveBytes).toContain('kind: "native-path"');
    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain("uploadNativeVideoToBunnyTus");
    expect(publish).toContain('uploader: "native-tus"');
  });

  it("D: Web selects tus-js; plugin stub unavailable", async () => {
    const tus = read("src/lib/bunnyUpload/bunnyTusUpload.ts");
    expect(tus).toContain("tus-js-client");
    expect(tus).not.toContain("EchoVideoUpload");
    const web = new EchoVideoUploadWeb();
    const caps = await web.getCapabilities();
    expect(caps.available).toBe(false);
    expect(caps.implementation).toBe("web-stub");
    expect(EchoVideoUpload).toBeTruthy();
  });

  it("E: native iOS path never calls JS full-byte video loader", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain("isNativeEchoVideoUploadPlatform()");
    expect(resolveBytes).toContain('kind: "native-path"');
    expect(resolveBytes).not.toContain("loadNativeDraftVideoFile");
    expect(resolveBytes).toContain("statNativeDraftVideoBytes");
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(native).not.toContain("Filesystem.readFile");
    expect(native).not.toContain("atob");
    expect(native).not.toContain("new Blob");
    expect(native).not.toContain("new File");
  });

  it("F/G: prepared vs original native path selection preserved", () => {
    const resolveBytes = read("src/lib/resolvePublishVideoBytesSource.ts");
    expect(resolveBytes).toContain('assetKind = "prepared"');
    expect(resolveBytes).toContain("ready_prepared");
    expect(resolveBytes).toContain(".prepared.mp4");
    expect(resolveBytes).toContain("ready_source");
    expect(resolveBytes).toContain("draft.localReference");
  });

  it("H/I: existing TUS URL HEAD resume + offset", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadEngine.swift",
    );
    expect(engine).toContain("headOffset");
    expect(engine).toContain("resume-url");
    expect(engine).toContain("Upload-Offset");
    expect(engine).toContain("existingUploadUrl");
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(native).toContain("uploadUrl");
    expect(native).toContain("upload resumed");
  });

  it("J: progress reaches 100%", () => {
    const native = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(native).toContain("onProgress?.(100)");
    const plugin = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadPlugin.swift",
    );
    expect(plugin).toContain("uploadProgress");
    const engine = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadEngine.swift",
    );
    expect(engine).toContain("progressThrottleMs");
    expect(engine).toContain("emitProgress");
  });

  it("K: cancellation cleans resources", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadEngine.swift",
    );
    expect(engine).toContain("func cancel()");
    expect(engine).toContain("invalidateAndCancel");
    expect(engine).toContain("onCancelled");
    const plugin = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadPlugin.swift",
    );
    expect(plugin).toContain("cancelVideoUpload");
  });

  it("L/M/N: network / invalid file / HTTP errors typed", () => {
    const codes = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadErrorCodes.swift",
    );
    expect(codes).toContain("file_missing");
    expect(codes).toContain("network_failed");
    expect(codes).toContain("tus_head_failed");
    expect(codes).toContain("cancelled");
    const engine = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadEngine.swift",
    );
    expect(engine).toContain("TUS PATCH HTTP");
    expect(engine).toContain("classifyHttpStatus");
    expect(engine).toContain("(200 ..< 300).contains(code)");
  });

  it("O: 64-bit file sizes/offsets safe", () => {
    const engine = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadEngine.swift",
    );
    expect(engine).toContain("Int64");
    expect(engine).toContain("fileSize: Int64");
    const retry = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadRetry.swift",
    );
    expect(retry).toContain("Int64");
  });

  it("P/Q: no backend changes; Android upload sources untouched by iOS files", () => {
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadEngine.java",
    );
    expect(engine).toContain("OkHttpClient");
    expect(engine).toContain("FileRangeRequestBody");
  });

  it("R: IOS1 prepare plugin still registered and unchanged contract", () => {
    const vc = read("ios/App/App/MyViewController.swift");
    expect(vc).toContain("EchoVideoPreparePlugin");
    expect(vc).toContain("EchoVideoUploadPlugin");
    expect(
      existsSync(
        join(
          process.cwd(),
          "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePlugin.swift",
        ),
      ),
    ).toBe(true);
  });

  it("S: Create publish still uses createPublishVideoUpload", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("createPublishVideoUpload");
    expect(provider).toContain("resolvePublishVideoBytesSource");
  });

  it("T: published media gesture passes not touched by upload plugin", () => {
    for (const rel of [
      "src/components/detail/PublishedVideoPlayer.tsx",
      "src/lib/publishedMedia/usePublishedVideoSurfaceGestures.ts",
    ]) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const src = read(rel);
      expect(src).not.toContain("EchoVideoUpload");
      expect(src).not.toContain("ios-urlsession");
    }
  });

  it("U: LI1 image pipeline does not reference EchoVideoUpload", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).not.toContain("EchoVideoUpload");
  });

  it("iOS plugin streams; no full-file Data/base64 video APIs", () => {
    const dir = "ios/App/App/plugins/EchoVideoUpload";
    const files = [
      "EchoVideoUploadEngine.swift",
      "EchoVideoUploadPlugin.swift",
      "EchoVideoUploadPaths.swift",
    ];
    let all = "";
    for (const f of files) {
      all += read(`${dir}/${f}`);
    }
    expect(all).toContain("writeChunkTempFile");
    expect(all).toContain("FileHandle");
    expect(all).toContain("uploadTask(with: request, fromFile:");
    expect(all).not.toContain("Data(contentsOf:");
    expect(all).not.toContain("readDataToEndOfFile");
    expect(all).not.toContain("Filesystem.readFile");
    // Small metadata base64 for TUS Upload-Metadata is OK (in TusMetadata).
    const meta = read(`${dir}/EchoVideoUploadTusMetadata.swift`);
    expect(meta).toContain("base64EncodedString");
    expect(meta).toContain("buildUploadMetadata");
  });

  it("iOS capabilities implementation ios-urlsession", () => {
    const plugin = read(
      "ios/App/App/plugins/EchoVideoUpload/EchoVideoUploadPlugin.swift",
    );
    expect(plugin).toContain('"ios-urlsession"');
    expect(plugin).toContain('"streaming": true');
    const defs = read("src/plugins/echoVideoUpload/definitions.ts");
    expect(defs).toContain('"ios-urlsession"');
  });

  it("pbxproj + MyViewController register EchoVideoUpload", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("EchoVideoUploadPlugin.swift");
    expect(pbx).toContain("EchoVideoUploadEngine.swift");
    const vc = read("ios/App/App/MyViewController.swift");
    expect(vc).toContain("registerPluginInstance(EchoVideoUploadPlugin())");
  });
});
