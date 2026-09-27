/**
 * Temporary DEV-only diagnostics for Android local-first video acquisition.
 * Safe fields only — never log URIs, paths, base64, or file contents.
 */

import { Capacitor } from "@capacitor/core";

export const ANDROID_VIDEO_DIAG_PREFIX = "[echotoo android video]";

export type AndroidVideoDiagSource = "library" | "record";

export type AndroidVideoUriScheme = "content" | "file" | "path" | "none";

export type AndroidVideoDiagTag =
  | "ANDROID_VIDEO_PICK_RESULT"
  | "ANDROID_VIDEO_SOURCE_SELECTED"
  | "ANDROID_VIDEO_PICK_FAILED"
  | "ANDROID_VIDEO_PERSIST_START"
  | "ANDROID_VIDEO_COPY_SUCCESS"
  | "ANDROID_VIDEO_COPY_FAIL"
  | "ANDROID_VIDEO_FILE_FALLBACK"
  | "ANDROID_VIDEO_RESTORE_START"
  | "ANDROID_VIDEO_RESTORE_SUCCESS"
  | "ANDROID_VIDEO_RESTORE_FAIL"
  | "ANDROID_VIDEO_JOB_CREATED"
  | "ANDROID_VIDEO_JOB_FAILED"
  | "ANDROID_VIDEO_INGEST_OUTCOME";

/** Exact keys that must never be logged (even if present by mistake). */
const FORBIDDEN_KEYS = new Set([
  "uri",
  "path",
  "webpath",
  "nativeSourceUri",
  "nativesourceuri",
  "localReference",
  "localreference",
  "from",
  "to",
  "base64",
  "data",
  "body",
  "content",
  "contents",
  "file",
  "blob",
  "authorization",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "secret",
  "token",
  "password",
  "header",
  "headers",
  "libraryid",
  "library_id",
  "pullzone",
  "pull_zone",
]);

const FORBIDDEN_VALUE_PATTERN =
  /^(content:|file:|capacitor:|http:|https:|data:)/i;

const SENSITIVE_KEY_SUBSTRINGS = [
  "base64",
  "authorization",
  "password",
  "secret",
  "apikey",
  "api_key",
  "access_key",
  "accesskey",
  "token",
  "bunny",
  "header",
];

export function shouldEmitAndroidVideoDiagnostics(options?: {
  isDev?: boolean;
  isNativePlatform?: boolean;
}): boolean {
  const isDev = options?.isDev ?? import.meta.env.DEV;
  const isNative =
    options?.isNativePlatform ??
    (() => {
      try {
        return Capacitor.isNativePlatform();
      } catch {
        return false;
      }
    })();
  return Boolean(isDev && isNative);
}

export function classifyAndroidVideoUriScheme(
  value: string | null | undefined,
): AndroidVideoUriScheme {
  const raw = (value ?? "").trim();
  if (!raw) return "none";
  const lower = raw.toLowerCase();
  if (lower.startsWith("content:")) return "content";
  if (lower.startsWith("file:")) return "file";
  // Absolute or relative filesystem path from Camera Ion flow (no scheme).
  return "path";
}

export function isForbiddenAndroidVideoDiagKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(lower)) return true;
  // Allow uriScheme / destinationKind / sourceScheme / localReferenceKind.
  if (lower === "urischeme" || lower === "sourcescheme") return false;
  if (lower.endsWith("uri") || lower.endsWith("path")) return true;
  if (lower.includes("native") && lower.includes("uri")) return true;
  for (const part of SENSITIVE_KEY_SUBSTRINGS) {
    if (lower.includes(part)) return true;
  }
  return false;
}

export function formatAndroidVideoDiagFailure(params: {
  stage: string;
  shortReason: string;
}): { stage: string; shortReason: string } {
  return {
    stage: String(params.stage || "unknown").slice(0, 80),
    shortReason: String(params.shortReason || "unknown").slice(0, 160),
  };
}

export function shortErrorFromUnknown(err: unknown): {
  shortErrorCode: string | null;
  shortMessage: string;
} {
  const code =
    typeof err === "object" &&
    err &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
      ? String((err as { code: string }).code).slice(0, 64)
      : null;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown-error";
  return {
    shortErrorCode: code,
    shortMessage: message.slice(0, 160),
  };
}

/**
 * Drop any accidental sensitive / URI-bearing keys or values.
 * Returns a shallow-safe plain object for console logging.
 */
export function sanitizeAndroidVideoDiagPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isForbiddenAndroidVideoDiagKey(key)) continue;
    if (typeof value === "string" && FORBIDDEN_VALUE_PATTERN.test(value.trim())) {
      continue;
    }
    if (typeof value === "string" && value.length > 200) {
      out[key] = `${value.slice(0, 200)}…`;
      continue;
    }
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function logAndroidVideoDiagnostic(
  tag: AndroidVideoDiagTag,
  payload: Record<string, unknown>,
  options?: {
    isDev?: boolean;
    isNativePlatform?: boolean;
    logger?: (message: string, data: Record<string, unknown>) => void;
  },
): void {
  if (
    !shouldEmitAndroidVideoDiagnostics({
      isDev: options?.isDev,
      isNativePlatform: options?.isNativePlatform,
    })
  ) {
    return;
  }
  const safe = sanitizeAndroidVideoDiagPayload(payload);
  const logger =
    options?.logger ??
    ((message: string, data: Record<string, unknown>) => {
      console.log(message, data);
    });
  logger(`${ANDROID_VIDEO_DIAG_PREFIX} ${tag}`, safe);
}

/**
 * Always-on concise ingest outcome (production + DEV).
 * Safe fields only — never URIs, filenames, or credentials.
 */
export function logAndroidVideoIngestOutcome(payload: {
  stage: string;
  ok: boolean;
  reasonCode: string | null;
  uriScheme: AndroidVideoUriScheme;
  persistStrategy: string | null;
  hasSize: boolean;
  hasDuration: boolean;
}): void {
  const safe = sanitizeAndroidVideoDiagPayload({
    stage: payload.stage,
    ok: payload.ok,
    reasonCode: payload.reasonCode,
    uriScheme: payload.uriScheme,
    persistStrategy: payload.persistStrategy,
    hasSize: payload.hasSize,
    hasDuration: payload.hasDuration,
  });
  console.info(`${ANDROID_VIDEO_DIAG_PREFIX} ANDROID_VIDEO_INGEST_OUTCOME`, safe);
}

export function buildAndroidVideoPickResultPayload(params: {
  source: AndroidVideoDiagSource;
  type: unknown;
  format?: string | null;
  uri?: string | null;
  path?: string | null;
  webPath?: string | null;
  metadataSize?: number | null;
  metadataDuration?: number | null;
  metadataResolution?: string | null;
}): Record<string, unknown> {
  const uriOrPath = params.uri?.trim() || params.path?.trim() || null;
  return {
    source: params.source,
    type: params.type ?? null,
    format: params.format ?? null,
    uriScheme: classifyAndroidVideoUriScheme(uriOrPath),
    hasUri: Boolean(params.uri?.trim() || params.path?.trim()),
    hasWebPath: Boolean(params.webPath?.trim()),
    metadataSize:
      typeof params.metadataSize === "number" ? params.metadataSize : null,
    metadataDuration:
      typeof params.metadataDuration === "number"
        ? params.metadataDuration
        : null,
    metadataResolution: params.metadataResolution ?? null,
  };
}
