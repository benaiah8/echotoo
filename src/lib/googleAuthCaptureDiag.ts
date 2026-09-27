/**
 * Temporary Android Google-login capture diagnostics (Chrome WebView Inspector).
 * Logs only booleans / safe codes / branch names — never tokens or raw plugin results.
 * Remove after the failure branch is identified.
 */

export type GoogleAuthCaptureBranch =
  | "supabase_exchange"
  | "silent_cancel"
  | "oauth_fallback"
  | "native_success";

const PREFIX = "GOOGLE_AUTH";

/** Allowlisted cancel markers mirrored from nativeGoogleSignIn (read-only classification). */
const CANCEL_MARKERS = [
  "cancelled",
  "canceled",
  "user cancelled",
  "user canceled",
  "12501",
  "sign_in_cancelled",
  "sign_in_canceled",
  "nocredentialexception",
] as const;

export type GoogleAuthSafeErrorFields = {
  error_name: string | null;
  safe_error_code: string | null;
  classified_as_cancel: boolean;
  cancel_marker_hit: string | null;
  matches_nocredentialexception: boolean;
};

function isSafeCode(value: unknown): value is string | number {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value !== "string") return false;
  return /^[A-Za-z0-9_.-]{1,40}$/.test(value);
}

function collectCancelHaystack(error: unknown): string {
  const parts: string[] = [];
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  }
  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    for (const key of ["code", "message", "errorMessage", "error", "name"]) {
      const v = o[key];
      if (typeof v === "string") parts.push(v);
      if (typeof v === "number") parts.push(String(v));
    }
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Safe error fields for Inspector — never returns raw messages or objects.
 */
export function extractGoogleAuthSafeErrorFields(
  error: unknown,
  classifiedAsCancel: boolean,
): GoogleAuthSafeErrorFields {
  let errorName: string | null = null;
  let safeCode: string | null = null;

  if (error instanceof Error) {
    errorName = error.name || "Error";
  } else if (typeof error === "object" && error != null) {
    const o = error as Record<string, unknown>;
    if (typeof o.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(o.name)) {
      errorName = o.name;
    }
    if (isSafeCode(o.code)) {
      safeCode = String(o.code);
    }
  } else if (typeof error === "string") {
    errorName = "string";
  }

  const haystack = collectCancelHaystack(error);
  let cancelMarkerHit: string | null = null;
  for (const marker of CANCEL_MARKERS) {
    if (haystack.includes(marker)) {
      cancelMarkerHit = marker;
      break;
    }
  }

  return {
    error_name: errorName,
    safe_error_code: safeCode,
    classified_as_cancel: classifiedAsCancel,
    cancel_marker_hit: cancelMarkerHit,
    matches_nocredentialexception: haystack.includes("nocredentialexception"),
  };
}

export function logGoogleAuth(
  event: string,
  fields: Record<string, boolean | string | number | null | undefined> = {},
): void {
  const safe: Record<string, boolean | string | number | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (
      typeof value === "boolean" ||
      typeof value === "number" ||
      value === null ||
      typeof value === "string"
    ) {
      // Reject long strings that could accidentally carry tokens.
      if (typeof value === "string" && value.length > 80) continue;
      safe[key] = value;
    }
  }
  // eslint-disable-next-line no-console
  console.info(PREFIX, event, safe);
}
