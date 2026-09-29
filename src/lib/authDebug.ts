/**
 * Opt-in auth diagnostics (localStorage DBG_AUTH=1).
 * Ring buffer: window.__AUTHDBG
 *
 * Never prints tokens, emails, user ids, or full callback URLs to console —
 * even when opt-in. Payload fields are redacted before ring + optional console.
 */

const DBG_AUTH_KEY = "DBG_AUTH";
const RING_MAX = 200;

const SENSITIVE_KEY =
  /email|token|authorization|password|secret|refresh_token|access_token|apikey|api_key/i;
const IDENTITY_KEY = /^(userId|user_id|sessionUserId|user|userid)$/i;
const URLISH_KEY =
  /^(href|url|exchangeUrl|exchangeUrlUsed|redirectUrl|locSearch|locHash|search|hash)$/i;

function isAuthDebugOn(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DBG_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

function ts(): string {
  const d = new Date();
  return d.toISOString().split("T")[1]?.replace("Z", "") ?? "";
}

/** Safe URL metadata — never includes query/hash contents or tokens. */
export function summarizeAuthUrl(raw: string | null | undefined): {
  pathname: string | null;
  hasSearch: boolean;
  hasHash: boolean;
  hasCodeParam: boolean;
  length: number;
} {
  const s = typeof raw === "string" ? raw : "";
  if (!s) {
    return {
      pathname: null,
      hasSearch: false,
      hasHash: false,
      hasCodeParam: false,
      length: 0,
    };
  }
  try {
    const u = new URL(s, typeof window !== "undefined" ? window.location.origin : "https://local.invalid");
    const qh = `${u.search}${u.hash}`;
    return {
      pathname: u.pathname || null,
      hasSearch: u.search.length > 1,
      hasHash: u.hash.length > 1,
      hasCodeParam: qh.includes("code="),
      length: s.length,
    };
  } catch {
    return {
      pathname: null,
      hasSearch: s.includes("?"),
      hasHash: s.includes("#"),
      hasCodeParam: s.includes("code="),
      length: s.length,
    };
  }
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) {
    if (value == null || value === "") return null;
    return "[redacted]";
  }
  if (IDENTITY_KEY.test(key)) {
    if (typeof value === "string") return value.length > 0 ? "[present]" : null;
    if (value == null) return null;
    return Boolean(value);
  }
  if (URLISH_KEY.test(key) && typeof value === "string") {
    return summarizeAuthUrl(value);
  }
  return value;
}

function redactDeep(value: unknown, keyHint = ""): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => redactDeep(v, String(i)));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k) || IDENTITY_KEY.test(k) || URLISH_KEY.test(k)) {
        out[k] = redactValue(k, v);
      } else if (v && typeof v === "object") {
        out[k] = redactDeep(v, k);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  if (keyHint) return redactValue(keyHint, value);
  return value;
}

function pushRing(tag: string, payload: unknown): void {
  try {
    const w = window as unknown as { __AUTHDBG?: unknown[] };
    w.__AUTHDBG = w.__AUTHDBG || [];
    w.__AUTHDBG.push([ts(), tag, payload]);
    if (w.__AUTHDBG.length > RING_MAX) {
      w.__AUTHDBG.splice(0, w.__AUTHDBG.length - RING_MAX);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Opt-in auth diagnostic. No-op unless DBG_AUTH=1.
 * Writes redacted entries to __AUTHDBG and console.
 */
export function dbg(tag: string, ...args: unknown[]): void {
  if (!isAuthDebugOn()) return;
  const redacted =
    args.length === 0
      ? undefined
      : args.length === 1
        ? redactDeep(args[0])
        : args.map((a) => redactDeep(a));
  pushRing(tag, redacted);
  try {
    console.log(`[AUTHDBG] ${ts()} ${tag}`, redacted);
  } catch {
    /* ignore */
  }
}

/** Safe location snapshot for ENV dump (no query/hash contents). */
export function dumpAuthEnv(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const loc =
    typeof window !== "undefined"
      ? {
          pathname: window.location.pathname,
          hasSearch: Boolean(window.location.search?.length),
          hasHash: Boolean(window.location.hash?.length),
          isPWA: window.matchMedia("(display-mode: standalone)").matches,
        }
      : null;
  const info = {
    location: loc,
    detectSessionInUrl: true,
    guest_until_present: Boolean(
      typeof localStorage !== "undefined" && localStorage.getItem("guest_until")
    ),
    ...((redactDeep(extra) as Record<string, unknown>) ?? {}),
  };
  dbg("ENV", info);
  return info;
}

/** Test helper */
export function __isAuthDebugOnForTests(): boolean {
  return isAuthDebugOn();
}

/** Test helper */
export function __redactAuthDebugPayloadForTests(
  value: unknown
): unknown {
  return redactDeep(value);
}
