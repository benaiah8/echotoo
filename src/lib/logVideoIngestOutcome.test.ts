import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVideoPublishRuntimeSummary,
  mapPublishFailureStageToAdmin,
  reportVideoPublishFailureAsync,
} from "./reportVideoPublishFailure";
import {
  logVideoIngestOutcome,
  maybeReportVideoIngestAdminFailure,
  shouldReportVideoIngestFailure,
  VIDEO_INGEST_ADMIN_REPORT_CODES,
} from "./logVideoIngestOutcome";
import { nativeVideoPickFromMediaResult } from "./mediaAcquisitionVideo";
import type { MediaResult } from "@capacitor/camera";

vi.mock("./reportVideoPublishFailure", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./reportVideoPublishFailure")>();
  return {
    ...actual,
    reportVideoPublishFailure: vi.fn(actual.reportVideoPublishFailure),
  };
});

import { reportVideoPublishFailure } from "./reportVideoPublishFailure";

afterEach(() => {
  vi.mocked(reportVideoPublishFailure).mockClear();
  vi.restoreAllMocks();
});

function videoMediaResult(
  overrides: Partial<MediaResult> & {
    metadata?: MediaResult["metadata"];
  } = {},
): MediaResult {
  return {
    type: "video",
    uri: "content://media/external/video/1",
    path: undefined,
    webPath: undefined,
    metadata: { format: "mp4", size: 1_000_000, ...(overrides.metadata ?? {}) },
    ...overrides,
  } as MediaResult;
}

describe("R3C VideoPublishFailureStage ingest", () => {
  it("accepts ingest and maps publish stages unchanged", () => {
    expect(mapPublishFailureStageToAdmin("prep")).toBe("prepare");
    expect(mapPublishFailureStageToAdmin("init")).toBe("upload_init");
    expect(mapPublishFailureStageToAdmin("tus")).toBe("upload_transfer");
    expect(mapPublishFailureStageToAdmin("processing")).toBe("processing");
    expect(mapPublishFailureStageToAdmin("post_create")).toBe("publish_db");
  });

  it("sends source=video_publish error_name=ingest", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const sent = await reportVideoPublishFailureAsync(
      { stage: "ingest", errorCode: "file_inaccessible", recoverable: true },
      { submit },
    );
    expect(sent).toBe(true);
    expect(submit.mock.calls[0][0].source).toBe("video_publish");
    expect(submit.mock.calls[0][0].error_name).toBe("ingest");
    expect(submit.mock.calls[0][0].message).toBe("file_inaccessible");
    expect(submit.mock.calls[0][0].stack).toBeNull();
  });
});

describe("shouldReportVideoIngestFailure", () => {
  it("allows only operational codes", () => {
    for (const code of VIDEO_INGEST_ADMIN_REPORT_CODES) {
      expect(shouldReportVideoIngestFailure(code)).toBe(true);
    }
    expect(shouldReportVideoIngestFailure("too_long")).toBe(false);
    expect(shouldReportVideoIngestFailure("too_large")).toBe(false);
    expect(shouldReportVideoIngestFailure("too_high_resolution")).toBe(false);
    expect(shouldReportVideoIngestFailure("unsupported_format")).toBe(false);
    expect(shouldReportVideoIngestFailure("cancelled")).toBe(false);
    expect(shouldReportVideoIngestFailure("stale_selection")).toBe(false);
    expect(shouldReportVideoIngestFailure("not_authenticated")).toBe(false);
    expect(shouldReportVideoIngestFailure("missing_publish_id")).toBe(false);
    expect(shouldReportVideoIngestFailure(null)).toBe(false);
  });
});

describe("logVideoIngestOutcome / maybeReportVideoIngestAdminFailure", () => {
  it("reports each operational Provider code once", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const code of [
      "file_inaccessible",
      "persist_failed",
      "preview_unusable",
      "unexpected",
      "read_failed",
    ]) {
      vi.mocked(reportVideoPublishFailure).mockClear();
      logVideoIngestOutcome({
        stage: "persist",
        ok: false,
        reasonCode: code,
        uriScheme: "content",
        persistStrategy: "uri-copy",
        hasSize: true,
        hasDuration: false,
      });
      expect(reportVideoPublishFailure).toHaveBeenCalledTimes(1);
      expect(reportVideoPublishFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "ingest",
          errorCode: code,
          recoverable: true,
        }),
      );
      expect(info).toHaveBeenCalled();
    }
    info.mockRestore();
  });

  it("does not report validation / excluded codes", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const code of [
      "too_long",
      "too_large",
      "too_high_resolution",
      "unsupported_format",
      "cancelled",
      "stale_selection",
      "not_authenticated",
      "missing_publish_id",
    ]) {
      vi.mocked(reportVideoPublishFailure).mockClear();
      logVideoIngestOutcome({
        stage: "validate",
        ok: false,
        reasonCode: code,
        uriScheme: "none",
        persistStrategy: null,
        hasSize: false,
        hasDuration: false,
      });
      expect(reportVideoPublishFailure).not.toHaveBeenCalled();
    }
    // Success never reports
    logVideoIngestOutcome({
      stage: "job_created",
      ok: true,
      reasonCode: null,
      uriScheme: "file",
      persistStrategy: "uri-copy",
      hasSize: true,
      hasDuration: true,
    });
    expect(reportVideoPublishFailure).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("telemetry throw does not propagate", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(reportVideoPublishFailure).mockImplementation(() => {
      throw new Error("telemetry boom");
    });
    expect(() =>
      maybeReportVideoIngestAdminFailure({ reasonCode: "file_inaccessible" }),
    ).not.toThrow();
    expect(() =>
      logVideoIngestOutcome({
        stage: "persist",
        ok: false,
        reasonCode: "unexpected",
        uriScheme: "none",
        persistStrategy: null,
        hasSize: false,
        hasDuration: false,
      }),
    ).not.toThrow();
    info.mockRestore();
  });

  it("runtime_summary stays safe and <=200", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    await reportVideoPublishFailureAsync(
      {
        stage: "ingest",
        errorCode: "file_inaccessible",
        recoverable: true,
        mediaId: "https://evil.example/path",
        bunnyVideoId: "C:\\Users\\x\\video.mp4",
      },
      { submit },
    );
    const summary = submit.mock.calls[0][0].runtime_summary as string;
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary).toContain("stage=ingest");
    expect(summary).toContain("code=file_inaccessible");
    expect(summary).not.toMatch(/https?:\/\//i);
    expect(summary).not.toContain("C:\\");
    expect(buildVideoPublishRuntimeSummary({
      stage: "ingest",
      errorCode: "persist_failed",
      recoverable: true,
    }).length).toBeLessThanOrEqual(200);
  });
});

describe("acquisition terminal operational report", () => {
  it("reports file_inaccessible once and not validation", async () => {
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
    if (!outcome.ok) expect(outcome.reason).toBe("file_inaccessible");
    expect(reportVideoPublishFailure).toHaveBeenCalledTimes(1);
    expect(reportVideoPublishFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "ingest",
        errorCode: "file_inaccessible",
      }),
    );
  });

  it("reports read_failed once when no URI/source", async () => {
    vi.mocked(reportVideoPublishFailure).mockClear();
    const outcome = await nativeVideoPickFromMediaResult(
      {
        type: "video",
        uri: undefined,
        path: undefined,
        webPath: undefined,
        metadata: { format: "mp4" },
      } as unknown as MediaResult,
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
    expect(outcome.reason).toBe("read_failed");
    expect(reportVideoPublishFailure).toHaveBeenCalledTimes(1);
    expect(reportVideoPublishFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "ingest",
        errorCode: "read_failed",
      }),
    );
  });

  it("does not report too_long from acquisition", async () => {
    vi.mocked(reportVideoPublishFailure).mockClear();
    const outcome = await nativeVideoPickFromMediaResult(
      videoMediaResult({
        metadata: { format: "mp4", size: 1_000_000, duration: 120 },
      }),
      "library",
      { isNativePlatform: true },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("too_long");
    expect(reportVideoPublishFailure).not.toHaveBeenCalled();
  });

  it("does not report unsupported_format from acquisition", async () => {
    vi.mocked(reportVideoPublishFailure).mockClear();
    const outcome = await nativeVideoPickFromMediaResult(
      videoMediaResult({
        metadata: { format: "avi", size: 1_000_000 },
      }),
      "library",
      { isNativePlatform: true },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("unsupported_format");
    expect(reportVideoPublishFailure).not.toHaveBeenCalled();
  });
});

describe("R3C source audit / UX freezes", () => {
  it("Provider uses shared logVideoIngestOutcome; poster-null not ingest-reported", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const provider = readFileSync(
      join(process.cwd(), "src/components/create/CreatePostMediaProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain("logVideoIngestOutcome");
    expect(provider).not.toMatch(
      /logAndroidVideoIngestOutcome\(\{/,
    );
    expect(provider).toContain("Poster failure never rolls back ingest");
    // Early validation returns before emitOutcome — no admin for too_long early path
    const startIdx = provider.indexOf("const startPostVideoUpload");
    const startFn = provider.slice(startIdx, startIdx + 12_000);
    expect(startFn).toContain('showCreateVideoValidationToast("too_long")');
    expect(startFn).toContain("emitOutcome");

    const crashPage = readFileSync(
      join(process.cwd(), "src/pages/internal/CrashReportsPage.tsx"),
      "utf8",
    );
    // Generic Stage/Code UI — no ingest-specific edit required
    expect(crashPage).toContain("Stage: {r.error_name}");
    expect(crashPage).toContain("Code: {shortMessage(r.message)}");
  });
});
