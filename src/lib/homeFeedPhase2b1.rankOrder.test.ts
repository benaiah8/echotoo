import { describe, expect, it } from "vitest";

type PostType = "hangout" | "experience";

type RankRow = {
  id: string;
  type: PostType;
  next_relevant_day: string | null;
  rel_rank: number;
  created_at: string;
  like_count?: number;
  save_count?: number;
  comment_count?: number;
  rating_count?: number;
};

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function cmpDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/** Mirrors ranked_keys freshness_pts CASE (non-overlapping, newest first). */
export function freshnessPts(ageMs: number): number {
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= 1 * day) return 4;
  if (ageMs <= 3 * day) return 3;
  if (ageMs <= 7 * day) return 2;
  if (ageMs <= 30 * day) return 1;
  return 0;
}

/** created_at >= now() - interval 'N' is age <= N. Exact 1d is still bucket 4. */
function freshnessPtsFromCreatedAt(createdAt: Date, now: Date): number {
  if (createdAt >= new Date(now.getTime() - 1 * 86400000)) return 4;
  if (createdAt >= new Date(now.getTime() - 3 * 86400000)) return 3;
  if (createdAt >= new Date(now.getTime() - 7 * 86400000)) return 2;
  if (createdAt >= new Date(now.getTime() - 30 * 86400000)) return 1;
  return 0;
}

function relPts(relRank: number): number {
  if (relRank === 1) return 4;
  if (relRank === 2) return 3;
  if (relRank === 0) return 1;
  return 0;
}

function urgencyPts(
  type: PostType,
  nextRelevantDay: string | null,
  addisToday: string
): number {
  if (type !== "hangout" || !nextRelevantDay) return 0;
  if (nextRelevantDay >= addisToday && nextRelevantDay < addDays(addisToday, 7)) {
    return 3;
  }
  return 0;
}

function engagementPts(row: RankRow): number {
  const raw =
    Math.log(1 + (row.like_count ?? 0)) +
    Math.log(1 + (row.save_count ?? 0)) +
    Math.log(1 + (row.comment_count ?? 0)) +
    (row.type === "experience"
      ? 0.25 * Math.log(1 + (row.rating_count ?? 0))
      : 0);
  return Math.min(2, Math.floor(raw / 2));
}

function allScore(row: RankRow, now: Date, addisToday: string): number {
  return (
    freshnessPtsFromCreatedAt(new Date(row.created_at), now) +
    relPts(row.rel_rank) +
    urgencyPts(row.type, row.next_relevant_day, addisToday) +
    engagementPts(row)
  );
}

function compareDefaultAll(
  a: RankRow,
  b: RankRow,
  now: Date,
  addisToday: string
): number {
  const sa = allScore(a, now, addisToday);
  const sb = allScore(b, now, addisToday);
  if (sa !== sb) return sb - sa;
  const created = cmpDesc(a.created_at, b.created_at);
  if (created !== 0) return created;
  return cmpDesc(a.id, b.id);
}

function compareEvents(a: RankRow, b: RankRow): number {
  if (a.next_relevant_day !== b.next_relevant_day) {
    if (a.next_relevant_day == null) return 1;
    if (b.next_relevant_day == null) return -1;
    return a.next_relevant_day < b.next_relevant_day ? -1 : 1;
  }
  if (a.rel_rank !== b.rel_rank) return a.rel_rank - b.rel_rank;
  const created = cmpDesc(a.created_at, b.created_at);
  if (created !== 0) return created;
  return cmpDesc(a.id, b.id);
}

function comparePlaces(a: RankRow, b: RankRow): number {
  if (a.rel_rank !== b.rel_rank) return a.rel_rank - b.rel_rank;
  const created = cmpDesc(a.created_at, b.created_at);
  if (created !== 0) return created;
  return cmpDesc(a.id, b.id);
}

function urgencyBucket(row: RankRow, addisToday: string): 0 | 1 {
  if (row.type !== "hangout" || !row.next_relevant_day) return 1;
  if (
    row.next_relevant_day >= addisToday &&
    row.next_relevant_day < addDays(addisToday, 7)
  ) {
    return 0;
  }
  return 1;
}

function compareFriendsMixed(a: RankRow, b: RankRow, addisToday: string): number {
  const ua = urgencyBucket(a, addisToday);
  const ub = urgencyBucket(b, addisToday);
  if (ua !== ub) return ua - ub;
  const da = ua === 0 ? a.next_relevant_day : null;
  const db = ub === 0 ? b.next_relevant_day : null;
  if (da !== db) {
    if (da == null) return 1;
    if (db == null) return -1;
    return da < db ? -1 : 1;
  }
  const created = cmpDesc(a.created_at, b.created_at);
  if (created !== 0) return created;
  return cmpDesc(a.id, b.id);
}

const NOW = new Date("2026-09-09T12:00:00.000Z");
const TODAY = "2026-09-09";
const DAY_MS = 86400000;

describe("Phase 2B.1 default All relationship points", () => {
  it("maps friend > following > self > other for All-only rel_pts", () => {
    expect(relPts(1)).toBe(4);
    expect(relPts(2)).toBe(3);
    expect(relPts(0)).toBe(1);
    expect(relPts(3)).toBe(0);
    const now = NOW;
    const rows: RankRow[] = [
      {
        id: "other",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 3,
        created_at: now.toISOString(),
      },
      {
        id: "self",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 0,
        created_at: now.toISOString(),
      },
      {
        id: "follow",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 2,
        created_at: now.toISOString(),
      },
      {
        id: "friend",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 1,
        created_at: now.toISOString(),
      },
    ];
    const sorted = [...rows].sort((a, b) => compareDefaultAll(a, b, now, TODAY));
    expect(sorted.map((r) => r.id)).toEqual(["friend", "follow", "self", "other"]);
  });
});

describe("Phase 2B.1 freshness buckets", () => {
  it("uses non-overlapping created_at age buckets including exact boundaries", () => {
    expect(freshnessPtsFromCreatedAt(NOW, NOW)).toBe(4);
    expect(
      freshnessPtsFromCreatedAt(new Date(NOW.getTime() - 1 * DAY_MS), NOW)
    ).toBe(4);
    expect(
      freshnessPtsFromCreatedAt(
        new Date(NOW.getTime() - 1 * DAY_MS - 1),
        NOW
      )
    ).toBe(3);
    expect(
      freshnessPtsFromCreatedAt(new Date(NOW.getTime() - 3 * DAY_MS), NOW)
    ).toBe(3);
    expect(
      freshnessPtsFromCreatedAt(
        new Date(NOW.getTime() - 3 * DAY_MS - 1),
        NOW
      )
    ).toBe(2);
    expect(
      freshnessPtsFromCreatedAt(new Date(NOW.getTime() - 7 * DAY_MS), NOW)
    ).toBe(2);
    expect(
      freshnessPtsFromCreatedAt(
        new Date(NOW.getTime() - 7 * DAY_MS - 1),
        NOW
      )
    ).toBe(1);
    expect(
      freshnessPtsFromCreatedAt(new Date(NOW.getTime() - 30 * DAY_MS), NOW)
    ).toBe(1);
    expect(
      freshnessPtsFromCreatedAt(
        new Date(NOW.getTime() - 30 * DAY_MS - 1),
        NOW
      )
    ).toBe(0);
    expect(freshnessPts(0.5 * DAY_MS)).toBe(4);
    expect(freshnessPts(2 * DAY_MS)).toBe(3);
    expect(freshnessPts(5 * DAY_MS)).toBe(2);
    expect(freshnessPts(10 * DAY_MS)).toBe(1);
    expect(freshnessPts(40 * DAY_MS)).toBe(0);
  });
});

describe("Phase 2B.1 event urgency", () => {
  it("gives +3 only to hangouts with next_relevant_day in [today, today+7)", () => {
    expect(urgencyPts("hangout", TODAY, TODAY)).toBe(3);
    expect(urgencyPts("hangout", addDays(TODAY, 6), TODAY)).toBe(3);
    expect(urgencyPts("hangout", addDays(TODAY, 7), TODAY)).toBe(0);
    expect(urgencyPts("hangout", addDays(TODAY, 20), TODAY)).toBe(0);
    expect(urgencyPts("experience", TODAY, TODAY)).toBe(0);
    expect(urgencyPts("hangout", null, TODAY)).toBe(0);
  });

  it("treats recurring next occurrence as one card with scalar next day", () => {
    const recurring: RankRow = {
      id: "recurring-sat",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 3),
      rel_rank: 3,
      created_at: "2026-08-01T00:00:00.000Z",
    };
    expect(urgencyPts("hangout", recurring.next_relevant_day, TODAY)).toBe(3);
    const multi: RankRow = {
      id: "multi-date",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 1),
      rel_rank: 3,
      created_at: "2026-08-02T00:00:00.000Z",
    };
    const cards = [recurring, multi, recurring, multi].filter(
      (row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx
    );
    expect(cards.map((r) => r.id)).toEqual(["recurring-sat", "multi-date"]);
  });
});

describe("Phase 2B.1 engagement points", () => {
  it("clamps to 0..2 and does not let large raw counts exceed 2", () => {
    expect(
      engagementPts({
        id: "zero",
        type: "hangout",
        next_relevant_day: null,
        rel_rank: 3,
        created_at: NOW.toISOString(),
      })
    ).toBe(0);
    const modest = engagementPts({
      id: "modest",
      type: "hangout",
      next_relevant_day: null,
      rel_rank: 3,
      created_at: NOW.toISOString(),
      like_count: 10,
    });
    expect(modest).toBeGreaterThanOrEqual(0);
    expect(modest).toBeLessThanOrEqual(2);
    const huge = engagementPts({
      id: "huge",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 3,
      created_at: NOW.toISOString(),
      like_count: 1_000_000,
      save_count: 1_000_000,
      comment_count: 1_000_000,
      rating_count: 1_000_000,
    });
    expect(huge).toBe(2);
  });

  it("applies rating contribution only to experience", () => {
    const base = {
      id: "x",
      next_relevant_day: null,
      rel_rank: 3,
      created_at: NOW.toISOString(),
      like_count: 0,
      save_count: 0,
      comment_count: 0,
      rating_count: 10_000,
    };
    const hangout = engagementPts({ ...base, id: "h", type: "hangout" });
    const place = engagementPts({ ...base, id: "p", type: "experience" });
    expect(hangout).toBe(0);
    expect(place).toBeGreaterThanOrEqual(hangout);
  });
});

describe("Phase 2B.1 score-only mixing", () => {
  it("A: a fresh friend Place can outrank a near-term stranger Event", () => {
    const place: RankRow = {
      id: "fresh-friend-place",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 1,
      created_at: NOW.toISOString(),
    };
    const event: RankRow = {
      id: "near-stranger-event",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 2),
      rel_rank: 3,
      created_at: new Date(NOW.getTime() - 4 * DAY_MS).toISOString(),
    };
    expect(allScore(place, NOW, TODAY)).toBeGreaterThan(
      allScore(event, NOW, TODAY)
    );
    expect(compareDefaultAll(place, event, NOW, TODAY)).toBeLessThan(0);
  });

  it("B: a strong near-term Event can outrank a weaker Place", () => {
    const event: RankRow = {
      id: "near-friend-event",
      type: "hangout",
      next_relevant_day: TODAY,
      rel_rank: 1,
      created_at: NOW.toISOString(),
    };
    const place: RankRow = {
      id: "stale-stranger-place",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 3,
      created_at: new Date(NOW.getTime() - 40 * DAY_MS).toISOString(),
    };
    expect(allScore(event, NOW, TODAY)).toBeGreaterThan(
      allScore(place, NOW, TODAY)
    );
    expect(compareDefaultAll(event, place, NOW, TODAY)).toBeLessThan(0);
  });

  it("has no hard type quota on the first page", () => {
    const events: RankRow[] = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      type: "hangout" as const,
      next_relevant_day: TODAY,
      rel_rank: 1,
      created_at: NOW.toISOString(),
    }));
    const places: RankRow[] = Array.from({ length: 2 }, (_, i) => ({
      id: `p${i}`,
      type: "experience" as const,
      next_relevant_day: null,
      rel_rank: 3,
      created_at: new Date(NOW.getTime() - 40 * DAY_MS).toISOString(),
    }));
    const page = [...events, ...places]
      .sort((a, b) => compareDefaultAll(a, b, NOW, TODAY))
      .slice(0, 8);
    expect(page.every((r) => r.type === "hangout")).toBe(true);
  });
});

describe("Phase 2B.1 pagination preserves global all_score order", () => {
  it("page 1 + page 2 equal the global prefix, with unique ids and true_total", () => {
    const rows: RankRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `post-${String(i).padStart(2, "0")}`,
      type: i % 2 === 0 ? "hangout" : "experience",
      next_relevant_day: i % 2 === 0 ? addDays(TODAY, i % 10) : null,
      rel_rank: i % 4,
      created_at: new Date(NOW.getTime() - i * DAY_MS).toISOString(),
      like_count: i * 3,
    }));
    const global = [...rows].sort((a, b) =>
      compareDefaultAll(a, b, NOW, TODAY)
    );
    const page1 = global.slice(0, 5);
    const page2 = global.slice(5, 10);
    expect([...page1, ...page2].map((r) => r.id)).toEqual(
      global.slice(0, 10).map((r) => r.id)
    );
    const ids = global.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(rows.length);
  });
});

describe("Phase 2B.1 does not change Phase 2A filtered comparators", () => {
  it("Events still order by next_relevant_day then rel_rank, not all_score", () => {
    const nearNone: RankRow = {
      id: "a",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 1),
      rel_rank: 3,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const laterSelf: RankRow = {
      id: "b",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 4),
      rel_rank: 0,
      created_at: NOW.toISOString(),
    };
    expect(compareEvents(nearNone, laterSelf)).toBeLessThan(0);
    expect(compareDefaultAll(laterSelf, nearNone, NOW, TODAY)).toBeLessThan(0);
  });

  it("Places still order by rel_rank 0>1>2>3, unlike All rel_pts", () => {
    const self: RankRow = {
      id: "self",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 0,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const friend: RankRow = {
      id: "friend",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 1,
      created_at: "2026-09-08T00:00:00.000Z",
    };
    expect(comparePlaces(self, friend)).toBeLessThan(0);
    expect(compareDefaultAll(friend, self, NOW, TODAY)).toBeLessThan(0);
  });

  it("Friends mixed still uses urgency bucket before freshness", () => {
    const event: RankRow = {
      id: "e3",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 3),
      rel_rank: 1,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const place: RankRow = {
      id: "p1",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 1,
      created_at: NOW.toISOString(),
    };
    expect(compareFriendsMixed(event, place, TODAY)).toBeLessThan(0);
    expect(compareDefaultAll(place, event, NOW, TODAY)).toBeLessThan(0);
  });
});
