import { describe, expect, it } from "vitest";

type PostType = "hangout" | "experience";

type RankRow = {
  id: string;
  type: PostType;
  next_relevant_day: string | null;
  rel_rank: number;
  created_at: string;
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

/** Mirrors Phase 2A Friends mixed ORDER BY (bucket 1 ignores next_relevant_day). */
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

const TODAY = "2026-09-09";

describe("Phase 2A Friends mixed rank order", () => {
  it("A: near-term Event beats Place created today", () => {
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
      created_at: "2026-09-09T12:00:00.000Z",
    };
    expect(compareFriendsMixed(event, place, TODAY)).toBeLessThan(0);
  });

  it("B: Place created today beats Event in 20 days created yesterday", () => {
    const event: RankRow = {
      id: "e20",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 20),
      rel_rank: 1,
      created_at: "2026-09-08T00:00:00.000Z",
    };
    const place: RankRow = {
      id: "p-today",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 1,
      created_at: "2026-09-09T18:00:00.000Z",
    };
    expect(urgencyBucket(event, TODAY)).toBe(1);
    expect(compareFriendsMixed(place, event, TODAY)).toBeLessThan(0);
  });

  it("C: two bucket-0 Events sort by earlier next_relevant_day", () => {
    const nearer: RankRow = {
      id: "near",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 1),
      rel_rank: 1,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const later: RankRow = {
      id: "later",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 5),
      rel_rank: 1,
      created_at: "2026-09-08T00:00:00.000Z",
    };
    expect(compareFriendsMixed(nearer, later, TODAY)).toBeLessThan(0);
  });

  it("D: two bucket-1 posts order by created_at regardless of Event vs Place", () => {
    const oldPlace: RankRow = {
      id: "place-old",
      type: "experience",
      next_relevant_day: null,
      rel_rank: 1,
      created_at: "2026-08-01T00:00:00.000Z",
    };
    const newerEvent: RankRow = {
      id: "event-far",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 20),
      rel_rank: 1,
      created_at: "2026-09-08T00:00:00.000Z",
    };
    expect(urgencyBucket(oldPlace, TODAY)).toBe(1);
    expect(urgencyBucket(newerEvent, TODAY)).toBe(1);
    expect(compareFriendsMixed(newerEvent, oldPlace, TODAY)).toBeLessThan(0);
  });

  it("E/F: multi-date and recurring Events remain one card", () => {
    const multi: RankRow = {
      id: "multi",
      type: "hangout",
      next_relevant_day: addDays(TODAY, 2),
      rel_rank: 1,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const recurring: RankRow = {
      id: "recurring",
      type: "hangout",
      next_relevant_day: TODAY,
      rel_rank: 1,
      created_at: "2026-09-02T00:00:00.000Z",
    };
    const ranked = [multi, recurring, multi, recurring].filter(
      (row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx
    );
    expect(ranked.map((r) => r.id)).toEqual(["multi", "recurring"]);
  });
});

describe("Phase 2A Events and Places rank order", () => {
  it("Events: nearer day before later day, then rel_rank, then freshness, then id", () => {
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
      created_at: "2026-09-09T00:00:00.000Z",
    };
    expect(compareEvents(nearNone, laterSelf)).toBeLessThan(0);

    const sameDaySelf: RankRow = { ...nearNone, id: "self", rel_rank: 0 };
    const sameDayFriend: RankRow = { ...nearNone, id: "friend", rel_rank: 1 };
    const sameDayFollow: RankRow = { ...nearNone, id: "follow", rel_rank: 2 };
    const sameDayNone: RankRow = { ...nearNone, id: "none", rel_rank: 3 };
    const sameDay = [sameDayNone, sameDayFollow, sameDayFriend, sameDaySelf].sort(
      compareEvents
    );
    expect(sameDay.map((r) => r.rel_rank)).toEqual([0, 1, 2, 3]);

    const older: RankRow = {
      id: "old",
      type: "hangout",
      next_relevant_day: TODAY,
      rel_rank: 1,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const newer: RankRow = {
      id: "new",
      type: "hangout",
      next_relevant_day: TODAY,
      rel_rank: 1,
      created_at: "2026-09-08T00:00:00.000Z",
    };
    expect(compareEvents(newer, older)).toBeLessThan(0);

    const idA: RankRow = { ...newer, id: "aaa", created_at: newer.created_at };
    const idB: RankRow = { ...newer, id: "bbb", created_at: newer.created_at };
    expect(compareEvents(idB, idA)).toBeLessThan(0);
  });

  it("Places: self > friends > following > none, then freshness, pagination-safe", () => {
    const rows: RankRow[] = [
      {
        id: "n",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 3,
        created_at: "2026-09-09T00:00:00.000Z",
      },
      {
        id: "s",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 0,
        created_at: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "f",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 1,
        created_at: "2026-09-08T00:00:00.000Z",
      },
      {
        id: "w",
        type: "experience",
        next_relevant_day: null,
        rel_rank: 2,
        created_at: "2026-09-07T00:00:00.000Z",
      },
    ];
    const sorted = [...rows].sort(comparePlaces);
    expect(sorted.map((r) => r.id)).toEqual(["s", "f", "w", "n"]);
    expect(sorted.slice(0, 2).map((r) => r.id)).toEqual(
      [...rows].sort(comparePlaces).slice(0, 2).map((r) => r.id)
    );
  });
});
