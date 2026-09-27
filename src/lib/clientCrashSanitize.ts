const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
const JWT_EYJ_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const JWT_LONG_RE =
  /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g;
const APIKEY_RE = /apikey\s*[=:]\s*[^\s&'"]+/gi;
const SB_RE = /sb-[A-Za-z0-9_-]{8,}/g;

export function sanitizeCrashText(value: string | null | undefined): string {
  let t = value ?? "";
  t = t.replace(BEARER_RE, "[REDACTED]");
  t = t.replace(JWT_EYJ_RE, "[REDACTED]");
  t = t.replace(JWT_LONG_RE, "[REDACTED]");
  t = t.replace(APIKEY_RE, "apikey=[REDACTED]");
  t = t.replace(SB_RE, "[REDACTED]");
  return t;
}

/** Pathname only — no query string or hash. */
export function crashRoutePathOnly(
  pathnameOrUrl: string | null | undefined
): string | null {
  let v = (pathnameOrUrl ?? "").trim();
  if (!v) return null;
  v = v.split("#")[0] ?? v;
  v = v.split("?")[0] ?? v;
  try {
    if (/^https?:\/\//i.test(v)) {
      v = new URL(v).pathname;
    }
  } catch {
    v = v.replace(/^https?:\/\/[^/]+/i, "");
  }
  v = v.trim();
  if (!v) return null;
  return v.slice(0, 300);
}

export function clipCrashText(
  value: string | null | undefined,
  max: number
): string | null {
  const t = (value ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
}
