import { describe, expect, it } from "vitest";
import {
  collectAllDiscoverPages,
  decodeDiscoverCursor,
  decodeDiscoverCursorBroken,
  encodeDiscoverCursor,
  encodeDiscoverCursorBroken,
  pageDiscoverEligible,
  type DiscoverEligibleRow,
} from "./discoverPairUpCursorPagination";

function ts(n: number): string {
  // Lexicographically ordered ISO instants for keyset tests
  const base = Date.parse("2026-11-01T00:00:00.000Z");
  return new Date(base + n * 1000).toISOString().replace(/\.000Z$/u, "+00:00");
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function row(
  n: number,
  interested: 0 | 1,
  creator: number,
  createdAtOffset = n
): DiscoverEligibleRow {
  return {
    id: uuid(n),
    creator_id: uuid(1000 + creator),
    created_at: ts(createdAtOffset),
    interested,
  };
}

describe("Discover pair-up cursor base64 (PG wrap bug)", () => {
  it("broken encode embeds a newline for typical cursor payloads", () => {
    const cursor = {
      b: 0 as const,
      t: "2026-11-04T01:18:09.123456+00:00",
      i: "12345678-1234-4234-8234-123456789abc",
    };
    const broken = encodeDiscoverCursorBroken(cursor);
    const fixed = encodeDiscoverCursor(cursor);
    expect(broken.includes("\n")).toBe(true);
    expect(fixed.includes("\n")).toBe(false);
    expect(broken.length).toBeGreaterThanOrEqual(120);
  });

  it("broken decode fails on wrapped cursors; fixed decode succeeds", () => {
    const cursor = {
      b: 1 as const,
      t: "2026-11-04T01:18:09.123456+00:00",
      i: "12345678-1234-4234-8234-123456789abc",
    };
    const wrapped = encodeDiscoverCursorBroken(cursor);
    expect(decodeDiscoverCursorBroken(wrapped)).toBeNull();
    expect(decodeDiscoverCursor(wrapped)).toEqual(cursor);
    const clean = encodeDiscoverCursor(cursor);
    expect(decodeDiscoverCursor(clean)).toEqual(cursor);
  });
});

describe("Discover pair-up keyset pagination", () => {
  function buildPool(): DiscoverEligibleRow[] {
    const rows: DiscoverEligibleRow[] = [];
    // Mixed buckets: 8 interested across 3 creators, 55 uninterested across 7 creators
    for (let i = 0; i < 8; i++) {
      rows.push(row(i, 1, i % 3, 1000 - i));
    }
    for (let i = 0; i < 55; i++) {
      rows.push(row(100 + i, 0, 10 + (i % 7), 500 - i));
    }
    // Equal created_at cluster (same t, distinct ids) in uninterested
    const sameT = ts(250);
    rows.push({
      id: uuid(900),
      creator_id: uuid(2000),
      created_at: sameT,
      interested: 0,
    });
    rows.push({
      id: uuid(901),
      creator_id: uuid(2001),
      created_at: sameT,
      interested: 0,
    });
    rows.push({
      id: uuid(899),
      creator_id: uuid(2002),
      created_at: sameT,
      interested: 0,
    });
    return rows;
  }

  it("limit 20: has_more true and next page returns remaining (fixed cursor)", () => {
    const eligible = buildPool();
    const page0 = pageDiscoverEligible(eligible, 20, null);
    expect(page0.candidates).toHaveLength(20);
    expect(page0.has_more).toBe(true);
    expect(page0.next_cursor).toBeTruthy();

    const page1 = pageDiscoverEligible(eligible, 20, page0.next_cursor);
    expect(page1.candidates.length).toBeGreaterThan(0);
    expect(
      page1.candidates.some((c) =>
        page0.candidates.some((p) => p.id === c.id)
      )
    ).toBe(false);
  });

  it("limit 50: has_more true and next page returns remaining (fixed cursor)", () => {
    const eligible = buildPool();
    const page0 = pageDiscoverEligible(eligible, 50, null);
    expect(page0.candidates).toHaveLength(50);
    expect(page0.has_more).toBe(true);
    expect(page0.next_cursor).toBeTruthy();

    const page1 = pageDiscoverEligible(eligible, 50, page0.next_cursor);
    expect(page1.candidates.length).toBeGreaterThan(0);
  });

  it("broken cursor path reproduces live bug: page0 has_more, page1 empty", () => {
    const eligible = buildPool();
    const page0 = pageDiscoverEligible(eligible, 20, null, {
      encode: "broken",
      decode: "broken",
    });
    expect(page0.candidates).toHaveLength(20);
    expect(page0.has_more).toBe(true);
    expect(page0.next_cursor?.includes("\n")).toBe(true);

    const page1 = pageDiscoverEligible(eligible, 20, page0.next_cursor, {
      encode: "broken",
      decode: "broken",
    });
    expect(page1.candidates).toHaveLength(0);
    expect(page1.has_more).toBe(false);
    expect(page1.next_cursor).toBeNull();
  });

  it("fixed path: no duplicates or missing ids across pages (limit 20 and 50)", () => {
    const eligible = buildPool();
    const expected = [...eligible].sort((a, b) => {
      if (a.interested !== b.interested) return b.interested - a.interested;
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });

    for (const limit of [20, 50]) {
      const { pages, ids, stalled } = collectAllDiscoverPages(eligible, limit);
      expect(stalled).toBe(false);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expected.map((r) => r.id));
      expect(pages[0]?.has_more).toBe(true);
      expect(pages[pages.length - 1]?.has_more).toBe(false);
      for (const page of pages) {
        if (page.has_more) {
          expect(page.next_cursor).toBeTruthy();
        } else {
          expect(page.next_cursor).toBeNull();
        }
      }
    }
  });

  it("interested bucket sorts ahead of uninterested; equal timestamps use id DESC", () => {
    const eligible: DiscoverEligibleRow[] = [
      row(1, 0, 1, 50),
      row(2, 1, 2, 10),
      {
        id: uuid(3),
        creator_id: uuid(3),
        created_at: ts(40),
        interested: 0,
      },
      {
        id: uuid(4),
        creator_id: uuid(4),
        created_at: ts(40),
        interested: 0,
      },
    ];
    const page = pageDiscoverEligible(eligible, 10, null);
    expect(page.candidates.map((c) => c.id)).toEqual([
      uuid(2),
      uuid(1),
      uuid(4),
      uuid(3),
    ]);
  });
});
