/**
 * PASS C1 — Android Media3 plugin shell + path contract (no encoder / no Create wiring).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EchoVideoPrepare,
  ECHO_VIDEO_PREPARE_ERROR,
  validateEchoVideoPrepareOptions,
  type EchoVideoPrepareOptions,
} from "../plugins/echoVideoPrepare";
import { EchoVideoPrepareWeb } from "../plugins/echoVideoPrepare/web";
import {
  buildNativePreparedVideoPath,
  buildNativePreparedVideoTempPath,
} from "./createDraftVideo/preparedVideoPaths";
import { buildNativeDraftVideoPath as buildSourcePath } from "./createDraftVideo/nativeDraftVideoStorage";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const validOptions = (): EchoVideoPrepareOptions => ({
  jobId: "job-1",
  sourcePath: "create-drafts/post/src-1.mp4",
  destinationPath: "create-drafts/post/src-1.prepared.mp4",
  temporaryPath: "create-drafts/post/src-1.prepared.tmp.mp4",
  targetLongEdge: 1080,
  targetVideoBitrate: 4_500_000,
  targetFps: 30,
  audioBitrate: 128_000,
});

describe("PASS C1 — EchoVideoPrepare shell", () => {
  it("A: JS plugin contract types + registerPlugin name", () => {
    const indexSrc = read("src/plugins/echoVideoPrepare/index.ts");
    expect(indexSrc).toContain('registerPlugin<EchoVideoPreparePlugin>');
    expect(indexSrc).toContain('"EchoVideoPrepare"');
    expect(EchoVideoPrepare).toBeTruthy();
    expect(ECHO_VIDEO_PREPARE_ERROR.not_implemented).toBe("not_implemented");
    expect(ECHO_VIDEO_PREPARE_ERROR.job_conflict).toBe("job_conflict");
    expect(ECHO_VIDEO_PREPARE_ERROR.invalid_options).toBe("invalid_options");
  });

  it("B: Android plugin registers from MainActivity", () => {
    const main = read(
      "android/app/src/main/java/com/experience/app/MainActivity.java",
    );
    expect(main).toContain("registerPlugin(EchoVideoPreparePlugin.class)");
    expect(main).toContain("registerPlugin(EchoVideoPreparePlugin.class)");
    const beforeSuper =
      main.indexOf("registerPlugin(EchoVideoPreparePlugin.class)") <
      main.indexOf("super.onCreate");
    expect(beforeSuper).toBe(true);

    const plugin = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePlugin.java",
    );
    expect(plugin).toContain('@CapacitorPlugin(name = "EchoVideoPrepare")');
    expect(plugin).toContain("public void getCapabilities");
    expect(plugin).toContain("public void prepareVideo");
    expect(plugin).toContain("public void cancelPreparation");
  });

  it("C: capability check — web stub false; Android encoderImplemented true", async () => {
    const web = new EchoVideoPrepareWeb();
    const caps = await web.getCapabilities();
    expect(caps.available).toBe(false);
    expect(caps.implementation).toBe("web-stub");
    expect(caps.encoderImplemented).toBe(false);

    const androidPlugin = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePlugin.java",
    );
    expect(androidPlugin).toContain('"android-media3"');
    expect(androidPlugin).toContain("encoderImplemented");
    expect(androidPlugin).toContain("true");
  });

  it("D: web prepareVideo still does NOT mark success", async () => {
    const web = new EchoVideoPrepareWeb();
    await expect(web.prepareVideo(validOptions())).rejects.toMatchObject({
      code: ECHO_VIDEO_PREPARE_ERROR.not_implemented,
    });
  });

  it("E: path helpers only (no Filesystem writes in helpers)", () => {
    expect(buildNativePreparedVideoTempPath("post", "src-1")).toBe(
      "create-drafts/post/src-1.prepared.tmp.mp4",
    );
    expect(buildNativePreparedVideoPath("post", "src-1")).toBe(
      "create-drafts/post/src-1.prepared.mp4",
    );
    expect(buildSourcePath("post", "src-1", "mp4")).toBe(
      "create-drafts/post/src-1.mp4",
    );
    const pathsSrc = read("src/lib/createDraftVideo/preparedVideoPaths.ts");
    expect(pathsSrc).not.toContain("writeFile");
    expect(pathsSrc).not.toContain("Filesystem");
  });

  it("F: cancel contract resolves safely when no job", async () => {
    const web = new EchoVideoPrepareWeb();
    await expect(
      web.cancelPreparation({ jobId: "missing-job" }),
    ).resolves.toEqual({ cancelled: false });
  });

  it("G: invalid options rejected predictably", async () => {
    expect(validateEchoVideoPrepareOptions({})).toBe("jobId is required");
    expect(
      validateEchoVideoPrepareOptions({
        ...validOptions(),
        targetLongEdge: 0,
      }),
    ).toBe("targetLongEdge must be a positive integer");

    const web = new EchoVideoPrepareWeb();
    await expect(
      web.prepareVideo({
        ...validOptions(),
        sourcePath: "",
      }),
    ).rejects.toMatchObject({
      code: ECHO_VIDEO_PREPARE_ERROR.invalid_options,
    });
  });

  it("H: no preparation toast-only shell; orchestrator wired in later passes", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toContain("VIDEO_WILL_PREPARE_USER_MESSAGE");
  });

  it("I: Media3 deps pinned without exoplayer-ui / cast / session / ffmpeg", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain("media3-transformer");
    expect(gradle).toContain("media3-effect");
    expect(gradle).toContain("media3-common");
    expect(gradle).not.toContain("media3-exoplayer");
    expect(gradle).not.toContain("media3-ui");
    expect(gradle).not.toContain("media3-session");
    expect(gradle).not.toContain("media3-cast");
    expect(gradle).not.toContain("ffmpeg");
    expect(gradle).not.toContain("media3-exoplayer-workmanager");

    const vars = read("android/variables.gradle");
    expect(vars).toContain("media3Version = '1.11.0'");
  });

  it("error codes include C1 contract set", () => {
    const codes = read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareErrorCodes.java",
    );
    for (const code of [
      "unsupported_codec",
      "encoder_unavailable",
      "decode_failed",
      "encode_failed",
      "output_invalid",
      "cancelled",
      "storage_failed",
      "job_conflict",
      "invalid_options",
      "not_implemented",
    ]) {
      expect(codes).toContain(`"${code}"`);
      expect(
        ECHO_VIDEO_PREPARE_ERROR[code as keyof typeof ECHO_VIDEO_PREPARE_ERROR],
      ).toBe(code);
    }
  });
});
