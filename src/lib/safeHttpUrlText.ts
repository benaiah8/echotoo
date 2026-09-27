/**
 * Conservative safe http(s) URL detection for plain-text captions (and sections).
 * Detection/normalization only — no network I/O.
 */
import { isSafeHttpOrHttpsUrl } from "./createFlowLocation";

/**
 * Match https?, www., or bare domain + optional path/query/hash (conservative).
 * Does not intentionally match emails; callers should also skip `@`-prefixed spans.
 */
export const SAFE_HTTP_URL_IN_TEXT_REGEX =
  /(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"']*)?)/g;

const TRAILING_URL_PUNCTUATION = /[),.;:!?\]]+$/g;

export function trimTrailingUrlPunctuation(raw: string): string {
  return raw.replace(TRAILING_URL_PUNCTUATION, "");
}

/**
 * Normalize a candidate token to a safe http(s) URL, or null if invalid.
 * Bare domains and www. become https://…
 */
export function normalizeSafeHttpUrl(raw: string): string | null {
  const trimmed = trimTrailingUrlPunctuation(raw.trim());
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (trimmed.includes("@")) return null;

  // Reject obvious non-http schemes before URL() coerces oddly.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  let href = trimmed;
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href}`;
  }

  if (!isSafeHttpOrHttpsUrl(href)) return null;

  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const host = parsed.hostname;
    if (!host.includes(".")) return null;
    // Reject hostnames that are only digits/dots (e.g. accidental decimals).
    if (/^[\d.]+$/.test(host)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function safeHttpUrlDisplayHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return href;
  }
}

/** Compact pill label: host, plus a short path/query when present. */
export function safeHttpUrlPillLabel(href: string, maxLen = 40): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    const rest = `${path}${u.search}`;
    const label = rest ? `${host}${rest}` : host;
    if (label.length <= maxLen) return label;
    return `${label.slice(0, Math.max(1, maxLen - 1))}…`;
  } catch {
    return href.length <= maxLen ? href : `${href.slice(0, maxLen - 1)}…`;
  }
}

export type SafeHttpUrlTextSegment =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string };

function shouldSkipMatch(text: string, matchIndex: number, raw: string): boolean {
  if (matchIndex > 0) {
    const prev = text[matchIndex - 1];
    // Email local-part@domain — do not linkify the domain.
    if (prev === "@") return true;
    // Avoid mid-token matches (e.g. weird adjacent alphanumerics).
    if (/[A-Za-z0-9/_-]/.test(prev)) return true;
  }
  if (raw.includes("@")) return true;
  return false;
}

/**
 * Split plain text into ordinary text + safe http(s) URL tokens.
 * Trailing sentence punctuation stays in surrounding text segments.
 */
export function tokenizeSafeHttpUrlsInText(
  text: string,
): SafeHttpUrlTextSegment[] {
  if (!text) return [];

  const segments: SafeHttpUrlTextSegment[] = [];
  let cursor = 0;
  const re = new RegExp(
    SAFE_HTTP_URL_IN_TEXT_REGEX.source,
    SAFE_HTTP_URL_IN_TEXT_REGEX.flags,
  );

  for (const match of text.matchAll(re)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index < cursor) continue;
    if (shouldSkipMatch(text, index, raw)) continue;

    const core = trimTrailingUrlPunctuation(raw);
    const href = normalizeSafeHttpUrl(core);
    if (!href || !core) continue;

    if (index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, index) });
    }

    segments.push({ kind: "url", value: core, href });

    const trailingLen = raw.length - core.length;
    cursor = index + core.length;
    // Trailing punctuation (and any unmatched remainder of raw) stays for next text slice.
    if (trailingLen > 0) {
      // Keep punctuation in the following text segment via cursor staying at core end.
    }
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", value: text }];
}

/**
 * Extract unique safe URLs from text (first-seen order), for section pills etc.
 */
export function extractSafeHttpUrlsFromText(
  text: string,
  max = Number.POSITIVE_INFINITY,
): Array<{ href: string; label: string }> {
  if (!text.trim()) return [];

  const seen = new Set<string>();
  const out: Array<{ href: string; label: string }> = [];

  for (const seg of tokenizeSafeHttpUrlsInText(text)) {
    if (seg.kind !== "url") continue;
    const key = seg.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href: seg.href, label: safeHttpUrlDisplayHost(seg.href) });
    if (out.length >= max) break;
  }

  return out;
}
