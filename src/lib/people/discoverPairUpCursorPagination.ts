/**
 * Mirrors list_discover_pair_up_candidates keyset + base64url cursor encode/decode.
 * Used for deterministic regression tests of the SQL pagination contract.
 */

export type DiscoverCursorBucket = 0 | 1;

export type DiscoverKeysetCursor = {
  b: DiscoverCursorBucket;
  /** ISO timestamptz text, same role as SQL cursor field t */
  t: string;
  /** opportunity id */
  i: string;
};

export type DiscoverEligibleRow = {
  id: string;
  creator_id: string;
  created_at: string;
  interested: DiscoverCursorBucket;
};

export type DiscoverPageResult = {
  candidates: DiscoverEligibleRow[];
  has_more: boolean;
  next_cursor: string | null;
};

/** PostgreSQL encode(..., 'base64') wraps at 76 characters with LF. */
export function pgEncodeBase64(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\n");
}

function cursorPayloadJson(cursor: DiscoverKeysetCursor): string {
  // jsonb_build_object keys are stored sorted: b, i, t
  return JSON.stringify({ b: cursor.b, i: cursor.i, t: cursor.t });
}

/**
 * Broken SQL encode path: rtrim/replace without stripping encode() newlines.
 * length() on decode then mis-pads and decode fails → empty next page.
 */
export function encodeDiscoverCursorBroken(cursor: DiscoverKeysetCursor): string {
  let enc = pgEncodeBase64(Buffer.from(cursorPayloadJson(cursor), "utf8"));
  enc = enc.replace(/=+$/u, "");
  enc = enc.replace(/\+/gu, "-").replace(/\//gu, "_");
  return enc;
}

/** Fixed encode: strip whitespace from base64 before padding strip + url-safe map. */
export function encodeDiscoverCursor(cursor: DiscoverKeysetCursor): string {
  let enc = pgEncodeBase64(Buffer.from(cursorPayloadJson(cursor), "utf8"));
  enc = enc.replace(/\s+/gu, "");
  enc = enc.replace(/=+$/u, "");
  enc = enc.replace(/\+/gu, "-").replace(/\//gu, "_");
  return enc;
}

function parseCursorJson(json: string): DiscoverKeysetCursor | null {
  const parsed = JSON.parse(json) as { b?: unknown; t?: unknown; i?: unknown };
  const b = Number(parsed.b);
  if (b !== 0 && b !== 1) return null;
  if (typeof parsed.t !== "string" || !parsed.t) return null;
  if (typeof parsed.i !== "string" || !parsed.i) return null;
  return { b: b as DiscoverCursorBucket, t: parsed.t, i: parsed.i };
}

/**
 * Broken SQL decode: pad using length() that still counts newlines, then decode
 * (which ignores whitespace). Extra '=' leaves a non-mod-4 payload → fail.
 * Returns null when decode/parse would hit EXCEPTION → empty page.
 */
export function decodeDiscoverCursorBroken(
  p_cursor: string
): DiscoverKeysetCursor | null {
  try {
    let raw = p_cursor.trim().replace(/-/gu, "+").replace(/_/gu, "/");
    while (raw.length % 4 !== 0) raw += "=";
    const cleaned = raw.replace(/\s+/gu, "");
    if (cleaned.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(cleaned)) return null;
    return parseCursorJson(Buffer.from(cleaned, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Fixed decode: strip whitespace before padding so legacy wrapped cursors work. */
export function decodeDiscoverCursor(
  p_cursor: string
): DiscoverKeysetCursor | null {
  try {
    let raw = p_cursor
      .trim()
      .replace(/-/gu, "+")
      .replace(/_/gu, "/")
      .replace(/\s+/gu, "");
    while (raw.length % 4 !== 0) raw += "=";
    if (raw.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(raw)) return null;
    return parseCursorJson(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function keysetAfter(
  row: DiscoverEligibleRow,
  cursor: DiscoverKeysetCursor
): boolean {
  if (row.created_at < cursor.t) return true;
  if (row.created_at === cursor.t && row.id < cursor.i) return true;
  return false;
}

/**
 * Same two-bucket UNION ALL + outer limit as the SQL paged CTE.
 * has_more is true only when a next_cursor is produced.
 */
export function pageDiscoverEligible(
  eligible: DiscoverEligibleRow[],
  p_limit: number,
  p_cursor: string | null,
  options?: { encode?: "fixed" | "broken"; decode?: "fixed" | "broken" }
): DiscoverPageResult {
  const v_limit = Math.min(Math.max(p_limit || 20, 1), 50);
  const encodeFn =
    options?.encode === "broken" ? encodeDiscoverCursorBroken : encodeDiscoverCursor;
  const decodeFn =
    options?.decode === "broken" ? decodeDiscoverCursorBroken : decodeDiscoverCursor;

  let cursor: DiscoverKeysetCursor | null = null;
  let v_has_cursor = false;
  if (p_cursor != null && p_cursor.trim() !== "") {
    cursor = decodeFn(p_cursor);
    if (!cursor) {
      return { candidates: [], has_more: false, next_cursor: null };
    }
    v_has_cursor = true;
  }

  const interested = eligible
    .filter((e) => e.interested === 1)
    .filter((e) => {
      if (!v_has_cursor || !cursor) return true;
      if (cursor.b !== 1) return false;
      return keysetAfter(e, cursor);
    })
    .sort(compareEligibleDesc)
    .slice(0, v_limit + 1);

  const uninterested = eligible
    .filter((e) => e.interested === 0)
    .filter((e) => {
      if (!v_has_cursor || !cursor) return true;
      if (cursor.b === 1) return true;
      return keysetAfter(e, cursor);
    })
    .sort(compareEligibleDesc)
    .slice(0, v_limit + 1);

  const merged = [...interested, ...uninterested]
    .sort(compareEligibleDesc)
    .slice(0, v_limit + 1);

  let has_more = merged.length > v_limit;
  const page = has_more ? merged.slice(0, v_limit) : merged;

  let next_cursor: string | null = null;
  if (has_more && page.length > 0) {
    const last = page[page.length - 1];
    next_cursor = encodeFn({
      b: last.interested,
      t: last.created_at,
      i: last.id,
    });
  }
  if (has_more && (next_cursor == null || next_cursor.trim() === "")) {
    has_more = false;
    next_cursor = null;
  }

  return { candidates: page, has_more, next_cursor };
}

function compareEligibleDesc(a: DiscoverEligibleRow, b: DiscoverEligibleRow): number {
  if (a.interested !== b.interested) return b.interested - a.interested;
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** Walk all pages; assert no dupes / no missing ids vs full sorted eligible set. */
export function collectAllDiscoverPages(
  eligible: DiscoverEligibleRow[],
  p_limit: number,
  options?: { encode?: "fixed" | "broken"; decode?: "fixed" | "broken" }
): {
  pages: DiscoverPageResult[];
  ids: string[];
  stalled: boolean;
} {
  const pages: DiscoverPageResult[] = [];
  const ids: string[] = [];
  let cursor: string | null = null;
  let guard = 0;
  while (guard++ < 100) {
    const page = pageDiscoverEligible(eligible, p_limit, cursor, options);
    pages.push(page);
    for (const row of page.candidates) ids.push(row.id);
    if (!page.has_more) break;
    if (!page.next_cursor) {
      return { pages, ids, stalled: true };
    }
    cursor = page.next_cursor;
  }
  return { pages, ids, stalled: false };
}
