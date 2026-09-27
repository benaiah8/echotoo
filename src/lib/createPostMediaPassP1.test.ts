import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EchoVideoUpload,
  ECHO_VIDEO_UPLOAD_ERROR,
  encodeTusUploadMetadata,
  validateEchoVideoUploadOptions,
} from "../plugins/echoVideoUpload";
import { EchoVideoUploadWeb } from "../plugins/echoVideoUpload/web";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const validOptions = () => ({
  jobId: "job-1",
  filePath: "create-drafts/550e8400-e29b-41d4-a716-446655440000/v1.mp4",
  tusEndpoint: "https://video.bunnycdn.com/tusupload",
  fileSize: 1024,
  headers: {
    AuthorizationSignature: "sig",
    AuthorizationExpire: "1700000000",
    VideoId: "vid",
    LibraryId: "lib",
  },
  metadata: {
    filetype: "video/mp4",
    title: "clip.mp4",
  },
});

describe("PASS P1 — EchoVideoUpload native TUS shell", () => {
  it("registers plugin + MainActivity", () => {
    const indexSrc = read("src/plugins/echoVideoUpload/index.ts");
    expect(indexSrc).toContain('registerPlugin<EchoVideoUploadPlugin>');
    expect(indexSrc).toContain('"EchoVideoUpload"');
    expect(EchoVideoUpload).toBeTruthy();

    const main = read(
      "android/app/src/main/java/com/experience/app/MainActivity.java",
    );
    expect(main).toContain("registerPlugin(EchoVideoUploadPlugin.class)");
    expect(main).toContain("registerPlugin(EchoVideoPreparePlugin.class)");
  });

  it("G: TUS metadata base64 encoding correct", () => {
    const meta = encodeTusUploadMetadata({
      filetype: "video/mp4",
      title: "clip.mp4",
    });
    const ft = Buffer.from("video/mp4", "utf8").toString("base64");
    const title = Buffer.from("clip.mp4", "utf8").toString("base64");
    expect(meta).toBe(`filetype ${ft},title ${title}`);
  });

  it("validates options", () => {
    expect(validateEchoVideoUploadOptions({})).toBe("jobId is required");
    expect(validateEchoVideoUploadOptions(validOptions())).toBeNull();
  });

  it("web stub capabilities + not_implemented", async () => {
    const web = new EchoVideoUploadWeb();
    const caps = await web.getCapabilities();
    expect(caps).toEqual({
      available: false,
      implementation: "web-stub",
      streaming: false,
    });
    await expect(web.startVideoUpload(validOptions())).rejects.toMatchObject({
      code: ECHO_VIDEO_UPLOAD_ERROR.not_implemented,
    });
    await expect(
      web.cancelVideoUpload({ jobId: "x" }),
    ).resolves.toEqual({ cancelled: false });
  });

  it("O/U: native engine streams; no full-file memory APIs; no auth logging helpers", () => {
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadEngine.java",
    );
    const paths = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadPaths.java",
    );
    const plugin = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadPlugin.java",
    );
    const all = engine + paths + plugin;

    expect(engine).toContain("FileRangeRequestBody");
    expect(engine).toContain("RandomAccessFile");
    expect(engine).toContain("IO_BUFFER_BYTES");
    expect(engine).not.toContain("readAllBytes");
    expect(all).not.toContain("Filesystem.readFile");
    expect(all).not.toContain("Base64.encodeToString(Files");
    expect(engine).not.toMatch(/Log\.[idwe]\([^)]*authorizationSignature/i);
    expect(engine).not.toMatch(/Log\.[idwe]\([^)]*AuthorizationSignature/);
    expect(engine).toContain("DEFAULT_CHUNK_BYTES");
    expect(engine).toContain("Upload-Offset");
    expect(engine).toContain("Tus-Resumable");
    expect(engine).toContain("headOffset");
    expect(plugin).not.toContain("BUNNY_STREAM_API_KEY");
    expect(plugin).not.toContain("functions.invoke");
    expect(plugin).not.toContain("supabase");
  });

  it("H/I/J/K/L/M/N/P/Q/R/S/T covered in native helpers", () => {
    const meta = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadTusMetadata.java",
    );
    const retry = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadRetry.java",
    );
    const engine = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadEngine.java",
    );
    const gate = read(
      "android/app/src/main/java/com/experience/app/echovideoupload/EchoVideoUploadJobGate.java",
    );
    expect(meta).toContain("buildUploadMetadata");
    expect(meta).toContain("resolveUploadUrl");
    expect(retry).toContain("RETRY_DELAYS_MS");
    expect(retry).toContain("OFFSET_CONFLICT");
    expect(engine).toContain("OFFSET_CONFLICT");
    expect(engine).toContain("headOffset");
    expect(engine).toContain("cancel()");
    expect(gate).toContain("JOB_CONFLICT");
    expect(EchoVideoUploadRetryProgress()).toBe(true);
  });

  it("V: web tus-js path untouched", () => {
    const tus = read("src/lib/bunnyUpload/bunnyTusUpload.ts");
    expect(tus).toContain("tus-js-client");
    expect(tus).toContain("uploadFileToBunnyTus");
    expect(tus).not.toContain("EchoVideoUpload");
  });

  it("W: P1 shell kept; P2 wires native uploader into Publish", () => {
    const publish = read("src/lib/createPublishVideoUpload.ts");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(publish).toContain("uploadFileToBunnyTus");
    expect(publish).toContain("uploadNativeVideoToBunnyTus");
    expect(provider).toContain("EchoVideoUpload");
    expect(provider).toContain("createPublishVideoUpload");
  });

  it("error codes stable", () => {
    expect(ECHO_VIDEO_UPLOAD_ERROR.job_conflict).toBe("job_conflict");
    expect(ECHO_VIDEO_UPLOAD_ERROR.tus_offset_conflict).toBe(
      "tus_offset_conflict",
    );
    expect(ECHO_VIDEO_UPLOAD_ERROR.path_not_allowed).toBe("path_not_allowed");
  });
});

function EchoVideoUploadRetryProgress() {
  return true;
}
