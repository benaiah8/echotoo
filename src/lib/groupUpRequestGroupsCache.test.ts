import { describe, expect, it, beforeEach } from "vitest";
import {
  advanceRequestCursorMonotonic,
  compareRequestCursors,
  formatGroupUpRequestCountLabel,
  isRequestCursorAfter,
} from "./groupUpRequestCursor";
import {
  __resetGroupUpRequestGroupsCacheForTests,
  getCachedGroupUpRequestGroups,
  patchGroupUpRequestGroupsAfterResolve,
  patchGroupUpRequestGroupsMarkSeen,
  setCachedGroupUpRequestGroups,
  sumGroupUpRequestNewCount,
} from "./groupUpRequestGroupsCache";
import {
  __resetGroupUpRequestersCacheForTests,
  getCachedGroupUpRequesters,
  removeFromCachedGroupUpRequesters,
  setCachedGroupUpRequesters,
} from "./groupUpRequestersCache";
import type { GroupUpRequestGroup } from "./people/types";

const USER = "user-host-1";
const CONV = "conv-1";

function group(partial: Partial<GroupUpRequestGroup>): GroupUpRequestGroup {
  return {
    conversation_id: CONV,
    opportunity_id: "opp-1",
    group_title: "Weekend Coffee",
    description: "Short desc",
    source_post_id: "post-1",
    source_type: "hangout",
    latest_request_at: "2026-09-04T10:00:00.000Z",
    latest_request_id: "req-e",
    pending_count: 5,
    new_count: 5,
    occurs_at: null,
    occurs_time_explicit: true,
    ...partial,
  };
}

describe("groupUpRequestCursor", () => {
  it("orders by timestamp then request_id", () => {
    const a = { at: "2026-09-04T10:00:00.000Z", id: "aaa" };
    const b = { at: "2026-09-04T11:00:00.000Z", id: "bbb" };
    expect(compareRequestCursors(a, b)).toBeLessThan(0);
    expect(isRequestCursorAfter(b, a)).toBe(true);
  });

  it("uses request_id tie-break when created_at equal", () => {
    const earlier = { at: "2026-09-04T10:00:00.000Z", id: "aaa-111" };
    const later = { at: "2026-09-04T10:00:00.000Z", id: "zzz-999" };
    expect(isRequestCursorAfter(later, earlier)).toBe(true);
    expect(isRequestCursorAfter(earlier, later)).toBe(false);
  });

  it("never advances watermark backward", () => {
    const newer = { at: "2026-09-04T12:00:00.000Z", id: "req-f" };
    const older = { at: "2026-09-04T10:00:00.000Z", id: "req-e" };
    expect(advanceRequestCursorMonotonic(newer, older)).toEqual(newer);
    expect(advanceRequestCursorMonotonic(null, older)).toEqual(older);
    expect(advanceRequestCursorMonotonic(older, older)).toEqual(older);
  });

  it("formats new vs pending count labels", () => {
    expect(
      formatGroupUpRequestCountLabel({ pendingCount: 12, newCount: 5 })
    ).toBe("5 new requests");
    expect(
      formatGroupUpRequestCountLabel({ pendingCount: 12, newCount: 0 })
    ).toBe("12 requests");
    expect(
      formatGroupUpRequestCountLabel({ pendingCount: 1, newCount: 0 })
    ).toBe("1 request");
    expect(
      formatGroupUpRequestCountLabel({ pendingCount: 1, newCount: 1 })
    ).toBe("1 new request");
  });
});

describe("groupUpRequestGroupsCache patches", () => {
  beforeEach(() => {
    __resetGroupUpRequestGroupsCacheForTests();
    __resetGroupUpRequestersCacheForTests();
  });

  it("keeps one summary row per conversation in cache", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [group({ pending_count: 2, new_count: 2 })],
      has_more: false,
      next_cursor: null,
    });
    const cached = getCachedGroupUpRequestGroups(USER);
    expect(cached?.groups).toHaveLength(1);
    expect(cached?.groups[0]?.conversation_id).toBe(CONV);
  });

  it("mark-seen through E zeros new_count when latest is E (F not in summary)", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T10:00:00.000Z",
          latest_request_id: "req-e",
          pending_count: 5,
          new_count: 5,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.new_count).toBe(0);
    expect(g?.pending_count).toBe(5);
  });

  it("F after A–E remains NEW when summary revalidates with F after mark-through E", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T10:00:00.000Z",
          latest_request_id: "req-e",
          pending_count: 5,
          new_count: 5,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    // Server revalidation: F arrived
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T12:00:00.000Z",
          latest_request_id: "req-f",
          pending_count: 6,
          new_count: 1,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.new_count).toBe(1);
    expect(g?.latest_request_id).toBe("req-f");
  });

  it("mark-seen through E while summary already shows F preserves newer new_count", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T12:00:00.000Z",
          latest_request_id: "req-f",
          pending_count: 6,
          new_count: 1,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    // Opening captured E; F arrived between fetch and mark
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.new_count).toBe(1);
  });

  it("duplicate mark-seen same cursor is idempotent", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [group({ new_count: 5, pending_count: 5 })],
      has_more: false,
      next_cursor: null,
    });
    const cursor = {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    };
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, cursor);
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, cursor);
    expect(getCachedGroupUpRequestGroups(USER)?.groups[0]?.new_count).toBe(0);
  });

  it("stale older mark does not move watermark backward", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T12:00:00.000Z",
          latest_request_id: "req-f",
          pending_count: 2,
          new_count: 0,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T12:00:00.000Z",
      id: "req-f",
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    // Resolve F (newer than stale E watermark would wrongly allow) — watermark stays F
    patchGroupUpRequestGroupsAfterResolve(USER, CONV, {
      at: "2026-09-04T11:00:00.000Z",
      id: "req-mid",
    });
    // mid is older than F watermark → new_count unchanged (already 0)
    expect(getCachedGroupUpRequestGroups(USER)?.groups[0]?.new_count).toBe(0);
  });

  it("resolving old viewed request does not consume newer new_count", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T12:00:00.000Z",
          latest_request_id: "req-f",
          pending_count: 6,
          new_count: 1,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    // Resolve old A (viewed / <= watermark)
    patchGroupUpRequestGroupsAfterResolve(USER, CONV, {
      at: "2026-09-04T09:00:00.000Z",
      id: "req-a",
    });
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.pending_count).toBe(5);
    expect(g?.new_count).toBe(1);
  });

  it("Accept patches summary locally and removes when last pending resolved", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          pending_count: 1,
          new_count: 1,
          latest_request_at: "2026-09-04T10:00:00.000Z",
          latest_request_id: "req-only",
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    setCachedGroupUpRequesters(USER, CONV, {
      requests: [
        {
          request_id: "req-only",
          opportunity_id: "opp-1",
          conversation_id: CONV,
          requested_at: "2026-09-04T10:00:00.000Z",
          requester_user_id: "u2",
          requester_profile_id: null,
          display_name: "Alex",
          username: "alex",
          avatar_url: null,
          profile_photos: [],
          echo_preset: null,
          bio: null,
        },
      ],
      has_more: false,
      next_cursor: null,
    });

    removeFromCachedGroupUpRequesters(USER, CONV, "req-only");
    patchGroupUpRequestGroupsAfterResolve(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-only",
    });

    expect(getCachedGroupUpRequesters(USER, CONV)?.requests).toHaveLength(0);
    expect(getCachedGroupUpRequestGroups(USER)?.groups).toHaveLength(0);
  });

  it("Decline patches requester + pending_count without wiping newer new_count", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          pending_count: 3,
          new_count: 1,
          latest_request_at: "2026-09-04T12:00:00.000Z",
          latest_request_id: "req-f",
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    setCachedGroupUpRequesters(USER, CONV, {
      requests: [
        {
          request_id: "req-old",
          opportunity_id: "opp-1",
          conversation_id: CONV,
          requested_at: "2026-09-04T09:00:00.000Z",
          requester_user_id: "u3",
          requester_profile_id: null,
          display_name: "Sam",
          username: "sam",
          avatar_url: null,
          profile_photos: [],
          echo_preset: null,
          bio: null,
        },
      ],
      has_more: false,
      next_cursor: null,
    });

    removeFromCachedGroupUpRequesters(USER, CONV, "req-old");
    patchGroupUpRequestGroupsAfterResolve(USER, CONV, {
      at: "2026-09-04T09:00:00.000Z",
      id: "req-old",
    });

    expect(
      getCachedGroupUpRequesters(USER, CONV)?.requests.find(
        (r) => r.request_id === "req-old"
      )
    ).toBeUndefined();
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.pending_count).toBe(2);
    expect(g?.new_count).toBe(1);
  });

  it("stale summary response cannot restore old new_count after mark-seen", () => {
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T10:00:00.000Z",
          latest_request_id: "req-e",
          pending_count: 1,
          new_count: 1,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    patchGroupUpRequestGroupsMarkSeen(USER, CONV, {
      at: "2026-09-04T10:00:00.000Z",
      id: "req-e",
    });
    expect(getCachedGroupUpRequestGroups(USER)?.groups[0]?.new_count).toBe(0);

    // Stale in-flight response still reports new_count=1
    setCachedGroupUpRequestGroups(USER, {
      groups: [
        group({
          latest_request_at: "2026-09-04T10:00:00.000Z",
          latest_request_id: "req-e",
          pending_count: 1,
          new_count: 1,
        }),
      ],
      has_more: false,
      next_cursor: null,
    });
    const g = getCachedGroupUpRequestGroups(USER)?.groups[0];
    expect(g?.pending_count).toBe(1);
    expect(g?.new_count).toBe(0);
  });

  it("sumGroupUpRequestNewCount drives badge contribution", () => {
    expect(
      sumGroupUpRequestNewCount([
        group({ new_count: 1, pending_count: 1 }),
        group({
          conversation_id: "conv-2",
          new_count: 0,
          pending_count: 3,
        }),
      ])
    ).toBe(1);
    expect(sumGroupUpRequestNewCount([])).toBe(0);
  });
});

describe("create validation copy", () => {
  it("exposes required-field messages for Create focus path", async () => {
    const { peopleUiCopy } = await import("../pages/people/peopleUiCopy");
    expect(peopleUiCopy.groupUpCreateNameRequired.length).toBeGreaterThan(0);
    expect(
      peopleUiCopy.groupUpCreateDescriptionRequired.length
    ).toBeGreaterThan(0);
  });
});
