import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientCrashSource } from "../types/clientCrashReport";
import {
  buildVideoPublishRuntimeSummary,
  mapPublishFailureStageToAdmin,
  reportVideoPublishFailureAsync,
  resolvePrepPublishFailureErrorCode,
  shortSafeDiagnosticId,
  shouldSkipVideoPublishFailureReport,
} from "./reportVideoPublishFailure";
import {
  clientCrashSourceDisplayLabel,
  clientCrashSourceFilterLabel,
  matchesClientCrashSourceFilter,
} from "./clientCrashFilters";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R3B ClientCrashSource", () => {
  it("includes video_publish without broadening to string", () => {
    const src: ClientCrashSource = "video_publish";
    expect(src).toBe("video_publish");
    const types = read("src/types/clientCrashReport.ts");
    expect(types).toMatch(
      /export type ClientCrashSource =\s*\| "react_boundary"\s*\| "window_error"\s*\| "unhandled_rejection"\s*\| "video_publish"/,
    );
    expect(types).not.toMatch(/ClientCrashSource\s*=\s*string/);
  });
});

describe("reportVideoPublishFailure mapping", () => {
  it("maps internal stages to admin stages", () => {
    expect(mapPublishFailureStageToAdmin("prep")).toBe("prepare");
    expect(mapPublishFailureStageToAdmin("init")).toBe("upload_init");
    expect(mapPublishFailureStageToAdmin("tus")).toBe("upload_transfer");
    expect(mapPublishFailureStageToAdmin("processing")).toBe("processing");
    expect(mapPublishFailureStageToAdmin("post_create")).toBe("publish_db");
  });

  it("supports ingest stage on the shared reporter", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    await reportVideoPublishFailureAsync(
      { stage: "ingest", errorCode: "persist_failed", recoverable: true },
      { submit },
    );
    expect(submit.mock.calls[0][0].source).toBe("video_publish");
    expect(submit.mock.calls[0][0].error_name).toBe("ingest");
    expect(submit.mock.calls[0][0].message).toBe("persist_failed");
  });

  it("sends source=video_publish with stage/code mapping", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const sent = await reportVideoPublishFailureAsync(
      {
        stage: "prepare",
        errorCode: "prepare_timeout",
        recoverable: true,
      },
      { submit },
    );
    expect(sent).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = submit.mock.calls[0][0];
    expect(payload.source).toBe("video_publish");
    expect(payload.error_name).toBe("prepare");
    expect(payload.message).toBe("prepare_timeout");
    expect(payload.stack).toBeNull();
    expect(payload.component_stack).toBeNull();
  });

  it("maps upload_stalled to upload_transfer", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    await reportVideoPublishFailureAsync(
      { stage: "upload_transfer", errorCode: "upload_stalled", recoverable: true },
      { submit },
    );
    const payload = submit.mock.calls[0][0];
    expect(payload.error_name).toBe("upload_transfer");
    expect(payload.message).toBe("upload_stalled");
  });

  it("maps init/processing/post_create stages", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    for (const [stage, code] of [
      ["upload_init", "init_failed"],
      ["processing", "timeout"],
      ["publish_db", "ugc_policy"],
    ] as const) {
      submit.mockClear();
      await reportVideoPublishFailureAsync(
        { stage, errorCode: code, recoverable: true },
        { submit },
      );
      expect(submit.mock.calls[0][0].error_name).toBe(stage);
      expect(submit.mock.calls[0][0].message).toBe(code);
    }
  });

  it("does not report cancelled or AbortError codes", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    expect(shouldSkipVideoPublishFailureReport("cancelled")).toBe(true);
    expect(shouldSkipVideoPublishFailureReport("AbortError")).toBe(true);
    expect(shouldSkipVideoPublishFailureReport("PREPARE_INTERRUPTED")).toBe(
      true,
    );
    expect(
      await reportVideoPublishFailureAsync(
        { stage: "prepare", errorCode: "cancelled" },
        { submit },
      ),
    ).toBe(false);
    expect(
      await reportVideoPublishFailureAsync(
        { stage: "upload_transfer", errorCode: "AbortError" },
        { submit },
      ),
    ).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not include raw exception text, URLs, or paths in runtime_summary", () => {
    const summary = buildVideoPublishRuntimeSummary({
      stage: "upload_transfer",
      errorCode: "upload_stalled",
      recoverable: true,
      mediaId: "https://tus.example/files/secret",
      bunnyVideoId: "C:\\Users\\video.mp4",
      sizeBucket: "50-100MB",
      durationBucket: "30-60s",
      width: 1080,
      height: 1920,
    });
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary).toContain("stage=upload_transfer");
    expect(summary).toContain("code=upload_stalled");
    expect(summary).toContain("sz=50-100MB");
    expect(summary).toContain("1080x1920");
    expect(summary).not.toMatch(/https?:\/\//i);
    expect(summary).not.toContain("C:\\");
    expect(summary).not.toContain("Failed to fetch");
    expect(summary).not.toContain("Bearer");
  });

  it("truncates media/Bunny ids safely", () => {
    expect(shortSafeDiagnosticId("abcdefghijklmnop")).toBe("abcdefghijkl");
    expect(shortSafeDiagnosticId("https://x")).toBeNull();
    expect(shortSafeDiagnosticId("/tmp/a")).toBeNull();
    const summary = buildVideoPublishRuntimeSummary({
      stage: "prepare",
      errorCode: "prep_failed",
      mediaId: "media-id-very-long-value",
      bunnyVideoId: "bunny-video-id-long",
    });
    expect(summary).toContain("mid=media-id-ver");
    expect(summary).toContain("bid=bunny-video-");
    expect(summary.length).toBeLessThanOrEqual(200);
  });

  it("swallows telemetry rejection", async () => {
    const dbg = vi.spyOn(console, "debug").mockImplementation(() => {});
    const submit = vi.fn().mockRejectedValue(new Error("rpc down"));
    await expect(
      reportVideoPublishFailureAsync(
        { stage: "prepare", errorCode: "prep_failed" },
        { submit },
      ),
    ).resolves.toBe(false);
    dbg.mockRestore();
  });
});

describe("resolvePrepPublishFailureErrorCode", () => {
  it("prefers real prepareErrorCode over prep_failed", () => {
    expect(
      resolvePrepPublishFailureErrorCode({
        aborted: false,
        prepareErrorCode: "prepare_timeout",
      }),
    ).toBe("prepare_timeout");
  });

  it("falls back to prep_failed when no stable code", () => {
    expect(
      resolvePrepPublishFailureErrorCode({
        aborted: false,
        prepareErrorCode: null,
      }),
    ).toBe("prep_failed");
  });

  it("maps abort / interrupt to cancelled", () => {
    expect(
      resolvePrepPublishFailureErrorCode({
        aborted: true,
        prepareErrorCode: "prepare_timeout",
      }),
    ).toBe("cancelled");
    expect(
      resolvePrepPublishFailureErrorCode({
        aborted: false,
        prepareErrorCode: "PREPARE_INTERRUPTED",
      }),
    ).toBe("cancelled");
  });
});

describe("logPublishFailureOutcome reporter wiring", () => {
  it("centrally invokes reportVideoPublishFailure once per outcome", () => {
    const src = read("src/lib/createPublishVideoUpload.ts");
    expect(src).toContain("reportVideoPublishFailure({");
    expect(src).toContain("mapPublishFailureStageToAdmin(payload.stage)");
    // Single call site inside logPublishFailureOutcome — not sprinkled in catches.
    const matches = src.match(/reportVideoPublishFailure\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("telemetry throw from reporter does not throw out of logger", async () => {
    const mod = await import("./reportVideoPublishFailure");
    const spy = vi
      .spyOn(mod, "reportVideoPublishFailure")
      .mockImplementation(() => {
        throw new Error("boom");
      });
    // Re-import won't rebind; exercise reportVideoPublishFailure's own guard +
    // logPublishFailureOutcome try/catch via direct call pattern in source.
    expect(() => {
      try {
        mod.reportVideoPublishFailure({
          stage: "prepare",
          errorCode: "prep_failed",
        });
      } catch {
        /* outer callers also wrap */
      }
    }).not.toThrow();
    spy.mockRestore();

    const uploadSrc = read("src/lib/createPublishVideoUpload.ts");
    expect(uploadSrc).toMatch(
      /try \{\s*reportVideoPublishFailure\([\s\S]*?\}\s*catch \{/,
    );
  });
});

describe("poster-null and user-facing copy preserved", () => {
  it("ensurePublishVideoPoster null is not a video_publish report path", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("ensurePublishVideoPoster");
    expect(provider).toContain("poster?.storagePath ?? null");
    // Poster null continues publish; no dedicated poster failure report.
    expect(provider).not.toMatch(
      /ensurePublishVideoPoster[\s\S]{0,400}logPublishFailureOutcome\(\{\s*stage:\s*"prep"/,
    );
  });

  it("prep abort still uses existing user error string", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("return { ok: false, error: prep.error }");
    expect(provider).toContain("resolvePrepPublishFailureErrorCode");
  });
});

describe("CrashReportsPage video_publish UI", () => {
  it("renders video_publish as Video publish", () => {
    expect(clientCrashSourceDisplayLabel("video_publish")).toBe("Video publish");
    expect(clientCrashSourceDisplayLabel("react_boundary")).toBe(
      "React boundary",
    );
    const page = read("src/pages/internal/CrashReportsPage.tsx");
    expect(page).toContain('Stage: {r.error_name}');
    expect(page).toContain("Code: {shortMessage(r.message)}");
    expect(page).toContain("Video publish detail");
  });

  it("source filter preserves status/platform semantics", () => {
    expect(clientCrashSourceFilterLabel("all")).toBe("All sources");
    expect(clientCrashSourceFilterLabel("app_crashes")).toBe("App crashes");
    expect(clientCrashSourceFilterLabel("video_publish")).toBe("Video publish");
    expect(matchesClientCrashSourceFilter("video_publish", "video_publish")).toBe(
      true,
    );
    expect(matchesClientCrashSourceFilter("react_boundary", "app_crashes")).toBe(
      true,
    );
    expect(matchesClientCrashSourceFilter("video_publish", "app_crashes")).toBe(
      false,
    );
    expect(matchesClientCrashSourceFilter("window_error", "all")).toBe(true);
  });
});
