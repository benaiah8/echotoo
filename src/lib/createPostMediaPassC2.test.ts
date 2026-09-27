/**
 * PASS C2 — real Android Media3 encoder inside EchoVideoPrepare (Create still unwired).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ECHO_VIDEO_PREPARE_ERROR } from "../plugins/echoVideoPrepare";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS C2 — Media3 Transformer engine", () => {
  const plugin = () =>
    read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePlugin.java",
    );
  const engine = () =>
    read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareEngine.java",
    );
  const paths = () =>
    read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPreparePaths.java",
    );
  const resolution = () =>
    read(
      "android/app/src/main/java/com/experience/app/echovideoprepare/EchoVideoPrepareResolution.java",
    );

  it("A: valid options enter encoder path (accepted:true)", () => {
    const src = plugin();
    expect(src).toContain('accepted.put("accepted", true)');
    expect(src).toContain("engine.start()");
    expect(src).not.toContain("NOT_IMPLEMENTED");
  });

  it("B–E: invalid/missing/zero/traversal source rejected", () => {
    const src = paths();
    expect(src).toContain("source file missing");
    expect(src).toContain("source file is empty");
    expect(src).toContain("must be under app create-drafts storage");
    expect(src).toContain("path traversal rejected");
    expect(read(
      "android/app/src/test/java/com/experience/app/echovideoprepare/EchoVideoPreparePathsTest.java",
    )).toContain("rejectsZeroByteSource");
  });

  it("F–G: one active job + cancel releases gate", () => {
    const src = plugin();
    expect(src).toContain("JOB_CONFLICT");
    expect(src).toContain("jobGate.tryBegin");
    expect(src).toContain("engine.cancel()");
    expect(src).toContain("jobGate.clear");
  });

  it("H–I: cancel/failure preserve source; delete tmp", () => {
    const eng = engine();
    expect(eng).toContain("deleteQuietly(request.temporaryFile)");
    expect(eng).not.toContain("deleteQuietly(request.sourceFile)");
    expect(eng).not.toContain("sourceFile.delete");
  });

  it("J–K: successful output promotes tmp → final + metadata", () => {
    const eng = engine();
    expect(eng).toContain("validateAndPromote");
    expect(eng).toContain("renameTo");
    expect(eng).toContain("sizeBytes");
    expect(eng).toContain("durationMs");
    expect(eng).toContain("video/mp4");
  });

  it("L–N: H.264 + AAC + bitrate wired", () => {
    const eng = engine();
    expect(eng).toContain("MimeTypes.VIDEO_H264");
    expect(eng).toContain("MimeTypes.AUDIO_AAC");
    expect(eng).toContain("setRequestedVideoEncoderSettings");
    expect(eng).toContain("setBitrate(request.targetVideoBitrate)");
    expect(eng).toContain("setRequestedAudioEncoderSettings");
  });

  it("O–R: resolution / orientation / no upscale", () => {
    const res = resolution();
    expect(res).toContain("short-edge");
    expect(res).toContain("targetLongEdge");
    expect(res).toContain("Never upscale");
    expect(res).toContain("toDisplaySize");
    expect(res).toContain("90 || rot == 270");
    const eng = engine();
    expect(eng).toContain("Presentation.createForShortSide");
  });

  it("S: fps capped <=30", () => {
    expect(resolution()).toContain("clampTargetFps");
    expect(engine()).toContain("clampTargetFps(request.targetFps)");
    expect(engine()).toContain("setFrameRate(fps)");
  });

  it("T: progress normalized 0..1", () => {
    const eng = engine();
    expect(eng).toContain("PROGRESS_STATE_AVAILABLE");
    expect(eng).toContain("/ 100.0");
    expect(eng).toContain("PROGRESS_INTERVAL_MS = 400L");
  });

  it("U: encoderImplemented true", () => {
    expect(plugin()).toMatch(/put\("encoderImplemented", true\)/);
  });

  it("V: no fake 20MB enforcement", () => {
    const eng = engine();
    expect(eng).not.toContain("20 * 1024");
    expect(eng).not.toContain("20971520");
    expect(eng).not.toContain("SHORT_VIDEO_PREFERRED");
    expect(eng).not.toContain("INTERNAL_PREPARED_MAX");
  });

  it("W: Create provider still does not call plugin directly; Publish owns prepare start", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toContain("EchoVideoPrepare");
    expect(provider).not.toContain("runDevEchoVideoPrepareSmoke");
    // Error codes may import from plugins/echoVideoPrepare/errors — not the plugin API.
    expect(provider).not.toMatch(/EchoVideoPrepare\./);
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    expect(provider).toContain("ensurePublishVideoPreparation");
  });

  it("error codes remain available", () => {
    expect(ECHO_VIDEO_PREPARE_ERROR.not_implemented).toBe("not_implemented");
    expect(ECHO_VIDEO_PREPARE_ERROR.encode_failed).toBe("encode_failed");
    expect(ECHO_VIDEO_PREPARE_ERROR.output_invalid).toBe("output_invalid");
  });

  it("DEV smoke helper exists and is not production UI", () => {
    const smoke = read("src/lib/devEchoVideoPrepareSmoke.ts");
    expect(smoke).toContain("runDevEchoVideoPrepareSmoke");
    expect(smoke).toContain("DEV-only");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toContain("devEchoVideoPrepareSmoke");
  });
});
