import type { AndroidVideoUriScheme } from "./devAndroidVideoDiagnostics";
import { logAndroidVideoIngestOutcome } from "./devAndroidVideoDiagnostics";
import { reportVideoPublishFailure } from "./reportVideoPublishFailure";

/** Terminal operational ingest codes that may appear in Admin Crash Reports. */
export const VIDEO_INGEST_ADMIN_REPORT_CODES = new Set([
  "file_inaccessible",
  "persist_failed",
  "preview_unusable",
  "unexpected",
  "read_failed",
]);

export type VideoIngestOutcomePayload = {
  stage: string;
  ok: boolean;
  reasonCode: string | null;
  uriScheme: AndroidVideoUriScheme;
  persistStrategy: string | null;
  hasSize: boolean;
  hasDuration: boolean;
  /** Optional dims when already known — never probe for telemetry. */
  width?: number | null;
  height?: number | null;
  sizeBucket?: string | null;
  durationBucket?: string | null;
};

export function shouldReportVideoIngestFailure(
  reasonCode: string | null | undefined,
): boolean {
  const code = String(reasonCode ?? "").trim();
  if (!code) return false;
  return VIDEO_INGEST_ADMIN_REPORT_CODES.has(code);
}

/**
 * Fire-and-forget admin report for a terminal operational ingest failure.
 * Never throws. Does not console-log (use logVideoIngestOutcome for that).
 */
export function maybeReportVideoIngestAdminFailure(opts: {
  reasonCode: string | null | undefined;
  recoverable?: boolean;
  width?: number | null;
  height?: number | null;
  sizeBucket?: string | null;
  durationBucket?: string | null;
}): void {
  try {
    const code = String(opts.reasonCode ?? "").trim();
    if (!shouldReportVideoIngestFailure(code)) return;
    reportVideoPublishFailure({
      stage: "ingest",
      errorCode: code,
      recoverable: opts.recoverable ?? true,
      width: opts.width,
      height: opts.height,
      sizeBucket: opts.sizeBucket,
      durationBucket: opts.durationBucket,
    });
  } catch {
    /* telemetry must never affect ingest */
  }
}

/**
 * Shared ingest outcome logger (Android + iOS + web).
 * Preserves existing always-on console diagnostics via logAndroidVideoIngestOutcome,
 * and submits Admin Crash Reports only for selected operational failure codes.
 */
export function logVideoIngestOutcome(payload: VideoIngestOutcomePayload): void {
  try {
    logAndroidVideoIngestOutcome({
      stage: payload.stage,
      ok: payload.ok,
      reasonCode: payload.reasonCode,
      uriScheme: payload.uriScheme,
      persistStrategy: payload.persistStrategy,
      hasSize: payload.hasSize,
      hasDuration: payload.hasDuration,
    });
  } catch {
    /* console diagnostics must never break ingest */
  }

  if (payload.ok) return;
  maybeReportVideoIngestAdminFailure({
    reasonCode: payload.reasonCode,
    recoverable: true,
    width: payload.width,
    height: payload.height,
    sizeBucket: payload.sizeBucket,
    durationBucket: payload.durationBucket,
  });
}
