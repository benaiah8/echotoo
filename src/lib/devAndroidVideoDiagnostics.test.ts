import { describe, expect, it, vi } from "vitest";
import {
  ANDROID_VIDEO_DIAG_PREFIX,
  buildAndroidVideoPickResultPayload,
  classifyAndroidVideoUriScheme,
  formatAndroidVideoDiagFailure,
  isForbiddenAndroidVideoDiagKey,
  logAndroidVideoDiagnostic,
  logAndroidVideoIngestOutcome,
  sanitizeAndroidVideoDiagPayload,
  shouldEmitAndroidVideoDiagnostics,
} from "./devAndroidVideoDiagnostics";

describe("devAndroidVideoDiagnostics", () => {
  it("logger is disabled outside DEV/native conditions", () => {
    expect(
      shouldEmitAndroidVideoDiagnostics({
        isDev: false,
        isNativePlatform: true,
      }),
    ).toBe(false);
    expect(
      shouldEmitAndroidVideoDiagnostics({
        isDev: true,
        isNativePlatform: false,
      }),
    ).toBe(false);
    expect(
      shouldEmitAndroidVideoDiagnostics({
        isDev: true,
        isNativePlatform: true,
      }),
    ).toBe(true);

    const logger = vi.fn();
    logAndroidVideoDiagnostic(
      "ANDROID_VIDEO_PICK_RESULT",
      { source: "library", type: 1 },
      { isDev: false, isNativePlatform: true, logger },
    );
    expect(logger).not.toHaveBeenCalled();
  });

  it("classifies library/record source labels in pick payload", () => {
    const library = buildAndroidVideoPickResultPayload({
      source: "library",
      type: 1,
      format: "mp4",
      uri: "content://media/external/video/1",
      webPath: "https://localhost/_capacitor_file_/x",
      metadataSize: 12_000_000,
      metadataDuration: 8.5,
      metadataResolution: "1920x1080",
    });
    expect(library.source).toBe("library");
    expect(library.uriScheme).toBe("content");
    expect(library.hasUri).toBe(true);
    expect(library.hasWebPath).toBe(true);

    const record = buildAndroidVideoPickResultPayload({
      source: "record",
      type: 1,
      format: "mp4",
      uri: "/data/user/0/com.echotoo.app/files/clip.mp4",
    });
    expect(record.source).toBe("record");
    expect(record.uriScheme).toBe("path");
  });

  it("classifies uri schemes without exposing full URI", () => {
    expect(classifyAndroidVideoUriScheme("content://foo")).toBe("content");
    expect(classifyAndroidVideoUriScheme("file:///tmp/a.mp4")).toBe("file");
    expect(classifyAndroidVideoUriScheme("/data/local/tmp/a.mp4")).toBe("path");
    expect(classifyAndroidVideoUriScheme(null)).toBe("none");
  });

  it("does not log URI/path/file contents", () => {
    const sanitized = sanitizeAndroidVideoDiagPayload({
      uri: "content://media/external/video/42",
      path: "/data/user/0/app/files/clip.mp4",
      webPath: "capacitor://localhost/_capacitor_file_/x",
      nativeSourceUri: "content://secret",
      localReference: "create-drafts/abc/uuid.mp4",
      base64: "AAAA",
      data: "payload",
      uriScheme: "content",
      source: "library",
      runtimeFileSize: 100,
    });
    expect(sanitized).toEqual({
      uriScheme: "content",
      source: "library",
      runtimeFileSize: 100,
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/content:\/\//);
    expect(JSON.stringify(sanitized)).not.toMatch(/\/data\//);
    expect(JSON.stringify(sanitized)).not.toMatch(/AAAA/);
  });

  it("formats failure stages safely", () => {
    expect(
      formatAndroidVideoDiagFailure({
        stage: "native-stat-validation",
        shortReason: "validateBunnyVideoFile rejected",
      }),
    ).toEqual({
      stage: "native-stat-validation",
      shortReason: "validateBunnyVideoFile rejected",
    });
  });

  it("blocks Bunny credentials/headers from diagnostics", () => {
    expect(isForbiddenAndroidVideoDiagKey("bunnyAccessKey")).toBe(true);
    expect(isForbiddenAndroidVideoDiagKey("Authorization")).toBe(true);
    expect(isForbiddenAndroidVideoDiagKey("headers")).toBe(true);
    expect(isForbiddenAndroidVideoDiagKey("libraryId")).toBe(true);

    const sanitized = sanitizeAndroidVideoDiagPayload({
      bunnyAccessKey: "super-secret",
      Authorization: "Bearer xyz",
      headers: { Authorization: "Bearer xyz" },
      pullZone: "pz",
      uriScheme: "file",
      status: "local",
    });
    expect(sanitized).toEqual({
      uriScheme: "file",
      status: "local",
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/secret|Bearer|xyz/i);
  });

  it("emits prefixed console payload when DEV+native", () => {
    const logger = vi.fn();
    logAndroidVideoDiagnostic(
      "ANDROID_VIDEO_JOB_CREATED",
      {
        status: "local",
        hasLocalFile: true,
        uri: "content://should-be-stripped",
      },
      { isDev: true, isNativePlatform: true, logger },
    );
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0]![0]).toBe(
      `${ANDROID_VIDEO_DIAG_PREFIX} ANDROID_VIDEO_JOB_CREATED`,
    );
    expect(logger.mock.calls[0]![1]).toEqual({
      status: "local",
      hasLocalFile: true,
    });
  });

  it("ANDROID_VIDEO_INGEST_OUTCOME is always-on via console.info", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAndroidVideoIngestOutcome({
      stage: "job_created",
      ok: true,
      reasonCode: null,
      uriScheme: "path",
      persistStrategy: "uri-copy",
      hasSize: true,
      hasDuration: true,
    });
    expect(info).toHaveBeenCalledWith(
      `${ANDROID_VIDEO_DIAG_PREFIX} ANDROID_VIDEO_INGEST_OUTCOME`,
      expect.objectContaining({ ok: true, stage: "job_created" }),
    );
    info.mockRestore();
  });
});
