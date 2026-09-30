import { reportClientCrash as submitCrashRpc } from "../api/services/clientCrashReports";
import type { ReportClientCrashInput } from "../types/clientCrashReport";
import { resolveClientCrashRuntimeEnv } from "./clientCrashReporter";
import { clientCrashPageLabel } from "./clientCrashPageLabel";
import {
  clipCrashText,
  crashRoutePathOnly,
  sanitizeCrashText,
} from "./clientCrashSanitize";

/** Internal publish logger stages (createPublishVideoUpload). */
export type InternalPublishFailureStage =
  | "prep"
  | "init"
  | "tus"
  | "processing"
  | "post_create";

export type VideoPublishFailureStage =
  | "prepare"
  | "upload_init"
  | "upload_transfer"
  | "processing"
  | "publish_db"
  | "ingest";

export type ReportVideoPublishFailureInput = {
  stage: VideoPublishFailureStage;
  errorCode: string;
  recoverable?: boolean;
  mediaId?: string | null;
  bunnyVideoId?: string | null;
  sizeBucket?: string | null;
  durationBucket?: string | null;
  width?: number | null;
  height?: number | null;
};

type ReporterDeps = {
  submit?: (input: ReportClientCrashInput) => Promise<void>;
};

const RUNTIME_SUMMARY_MAX = 200;
const ERROR_CODE_MAX = 64;
const SHORT_ID_MAX = 12;

/** Expected cancels / aborts — never report as video_publish. */
const SKIP_ERROR_CODES = new Set([
  "cancelled",
  "aborted",
  "aborterror",
  "user_cancel",
  "user_cancelled",
  "replace_abort",
  "navigation_abort",
  "prepare_interrupted",
  "PREPARE_INTERRUPTED",
]);

export function mapPublishFailureStageToAdmin(
  stage: InternalPublishFailureStage,
): VideoPublishFailureStage {
  switch (stage) {
    case "prep":
      return "prepare";
    case "init":
      return "upload_init";
    case "tus":
      return "upload_transfer";
    case "processing":
      return "processing";
    case "post_create":
      return "publish_db";
  }
}

export function shouldSkipVideoPublishFailureReport(errorCode: string): boolean {
  const code = String(errorCode || "")
    .trim()
    .toLowerCase();
  if (!code) return false;
  if (SKIP_ERROR_CODES.has(code)) return true;
  if (SKIP_ERROR_CODES.has(String(errorCode || "").trim())) return true;
  if (code.includes("cancel") && !code.includes("uncancel")) return true;
  if (code === "aborterror" || code.endsWith("_abort")) return true;
  return false;
}

/**
 * Prefer a stable prepareErrorCode from draft meta when present.
 * Cancel / interrupt → "cancelled". Missing → "prep_failed".
 */
export function resolvePrepPublishFailureErrorCode(opts: {
  aborted: boolean;
  prepareErrorCode?: string | null;
}): string {
  if (opts.aborted) return "cancelled";
  const raw = opts.prepareErrorCode?.trim() || "";
  if (!raw) return "prep_failed";
  if (shouldSkipVideoPublishFailureReport(raw)) return "cancelled";
  return raw.slice(0, ERROR_CODE_MAX);
}

/** Drop paths/URLs; keep short opaque ids only. */
export function shortSafeDiagnosticId(
  value: string | null | undefined,
  max = SHORT_ID_MAX,
): string | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return null;
  if (t.includes("/") || t.includes("\\") || t.includes("?") || t.includes("#")) {
    return null;
  }
  if (/\s/.test(t)) return null;
  return t.slice(0, max);
}

function safeBucketToken(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || t.includes("/") || t.includes("\\")) return null;
  // Buckets are short tokens like "50-100MB" / "30-60s"
  return t.replace(/[^a-zA-Z0-9._+-]/g, "").slice(0, 24) || null;
}

function safeDim(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function buildVideoPublishRuntimeSummary(
  input: ReportVideoPublishFailureInput,
): string {
  const stage = String(input.stage || "").trim() || "unknown";
  const code =
    String(input.errorCode || "unknown")
      .trim()
      .slice(0, ERROR_CODE_MAX) || "unknown";
  const parts: string[] = [`vp stage=${stage}`, `code=${code}`];

  if (typeof input.recoverable === "boolean") {
    parts.push(`r=${input.recoverable ? 1 : 0}`);
  }

  const mid = shortSafeDiagnosticId(input.mediaId);
  if (mid) parts.push(`mid=${mid}`);

  const bid = shortSafeDiagnosticId(input.bunnyVideoId);
  if (bid) parts.push(`bid=${bid}`);

  const sz = safeBucketToken(input.sizeBucket);
  if (sz) parts.push(`sz=${sz}`);

  const dur = safeBucketToken(input.durationBucket);
  if (dur) parts.push(`dur=${dur}`);

  const w = safeDim(input.width ?? null);
  const h = safeDim(input.height ?? null);
  if (w != null && h != null) parts.push(`${w}x${h}`);

  const joined = sanitizeCrashText(parts.join(" "));
  return clipCrashText(joined, RUNTIME_SUMMARY_MAX) ?? "";
}

function buildPayload(
  input: ReportVideoPublishFailureInput,
  env: {
    platform: ReportClientCrashInput["platform"];
    appVersion: string | null;
    appBuild: string | null;
  },
): ReportClientCrashInput {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/create";
  const route = crashRoutePathOnly(pathname);
  const pageLabel = clientCrashPageLabel(route ?? pathname);

  const errorCode =
    String(input.errorCode || "unknown")
      .trim()
      .slice(0, ERROR_CODE_MAX) || "unknown";

  return {
    source: "video_publish",
    error_name: input.stage,
    message: errorCode,
    stack: null,
    component_stack: null,
    route,
    page_label: pageLabel,
    platform: env.platform,
    app_version: env.appVersion,
    app_build: env.appBuild,
    runtime_summary: buildVideoPublishRuntimeSummary(input) || null,
  };
}

/**
 * Fire-and-forget video publish failure report.
 * Never throws. Never recurses into crash reporting. Never affects Publish.
 */
export function reportVideoPublishFailure(
  input: ReportVideoPublishFailureInput,
  deps: ReporterDeps = {},
): void {
  try {
    void reportVideoPublishFailureAsync(input, deps);
  } catch {
    /* ignore — telemetry must never affect Publish */
  }
}

export async function reportVideoPublishFailureAsync(
  input: ReportVideoPublishFailureInput,
  deps: ReporterDeps = {},
): Promise<boolean> {
  try {
    if (shouldSkipVideoPublishFailureReport(input.errorCode)) {
      return false;
    }

    const submit = deps.submit ?? submitCrashRpc;
    const env = await resolveClientCrashRuntimeEnv();
    const payload = buildPayload(input, env);
    await submit(payload);
    return true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.debug("[echotoo video publish] report failed", err);
    }
    return false;
  }
}
