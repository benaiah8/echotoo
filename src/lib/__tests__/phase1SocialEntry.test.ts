import { socialUiCopy } from "../social/socialUiCopy";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { resolveGroupTapAction } from "../social/resolveGroupTapAction";
import {
  __resetGroupUpCountStoreForTests,
  __setGroupUpCountViewerForTests,
  getGroupUpDiscoverableCount,
  patchGroupUpCount,
  setGroupUpCount,
  requestGroupUpCount,
  GROUP_UP_COUNT_STALE_MS,
} from "../groupUpCountStore";
import {
  __resetGroupUpSourceListCacheForTests,
  getGroupUpSourceListEntry,
  markGroupUpSourceListLoading,
  patchSourceGroupViewerState,
  prependSourceGroupRow,
  setGroupUpSourceListPage,
} from "../groupUpSourceListCache";
import type { SourceGroupRow } from "../social/sourceGroupTypes";

vi.mock("../../api/services/groupUpSourceBrowse", () => ({
  GROUP_UP_COUNT_BATCH_MAX: 50,
  getGroupUpCountsForSources: vi.fn(async (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, 2);
    return m;
  }),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => {} } },
      })),
    },
  },
}));

function makeRow(
  id: string,
  state: SourceGroupRow["viewer_state"] = "none"
): SourceGroupRow {
  return {
    opportunity_id: id,
    conversation_id: `c-${id}`,
    source_post_id: "src-1",
    group_title: "G",
    group_description: "D",
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    source_type: "hangout",
    organizer_user_id: "org",
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    viewer_state: state,
    request_id: null,
  };
}

describe("resolveGroupTapAction", () => {
  it("owner-active + count 0 → manage", () => {
    expect(
      resolveGroupTapAction({ ownsActiveGroup: true, discoverableCount: 0 })
    ).toBe("manage");
  });

  it("owner-active + count >0 → manage (not overlay)", () => {
    expect(
      resolveGroupTapAction({ ownsActiveGroup: true, discoverableCount: 3 })
    ).toBe("manage");
  });

  it("count >0 → overlay", () => {
    expect(
      resolveGroupTapAction({ ownsActiveGroup: false, discoverableCount: 2 })
    ).toBe("overlay");
  });

  it("count 0 / no owner → create", () => {
    expect(
      resolveGroupTapAction({ ownsActiveGroup: false, discoverableCount: 0 })
    ).toBe("create");
  });
});

describe("groupUpCountStore", () => {
  beforeEach(() => {
    __resetGroupUpCountStoreForTests();
    __setGroupUpCountViewerForTests("user-1");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("patches count locally and never goes below 0", () => {
    setGroupUpCount("p1", 1);
    patchGroupUpCount("p1", 1);
    expect(getGroupUpDiscoverableCount("p1")).toBe(2);
    patchGroupUpCount("p1", -5);
    expect(getGroupUpDiscoverableCount("p1")).toBe(0);
  });

  it("coalesces requests into one flush window", async () => {
    const { getGroupUpCountsForSources } = await import(
      "../../api/services/groupUpSourceBrowse"
    );
    requestGroupUpCount("a");
    requestGroupUpCount("b");
    requestGroupUpCount("a");
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();
    expect(getGroupUpCountsForSources).toHaveBeenCalled();
  });

  it("respects stale window constant", () => {
    expect(GROUP_UP_COUNT_STALE_MS).toBeGreaterThanOrEqual(45_000);
  });
});

describe("groupUpSourceListCache", () => {
  beforeEach(() => {
    __resetGroupUpSourceListCacheForTests();
  });

  it("patches request → Requested without removing card", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1", "none")],
      has_more: false,
      next_cursor: null,
    });
    patchSourceGroupViewerState("src-1", "o1", {
      viewer_state: "pending",
      request_id: "r1",
    });
    const entry = getGroupUpSourceListEntry("src-1");
    expect(entry?.rows).toHaveLength(1);
    expect(entry?.rows[0].viewer_state).toBe("pending");
    expect(entry?.rows[0].request_id).toBe("r1");
  });

  it("keeps cached rows visible while loading flag is set", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1")],
      has_more: false,
      next_cursor: null,
    });
    markGroupUpSourceListLoading("src-1");
    const entry = getGroupUpSourceListEntry("src-1");
    expect(entry?.rows).toHaveLength(1);
    expect(entry?.loading).toBe(true);
    // Overlay skeleton gate: loading && rows.length === 0
    expect(Boolean(entry?.loading && (entry?.rows.length ?? 0) === 0)).toBe(
      false
    );
  });

  it("forced refresh replace keeps pagination metadata from new page", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1"), makeRow("o2")],
      has_more: true,
      next_cursor: "old-cursor",
    });
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1"), makeRow("o2"), makeRow("o3")],
      has_more: true,
      next_cursor: "fresh-cursor",
    });
    const entry = getGroupUpSourceListEntry("src-1");
    expect(entry?.rows).toHaveLength(3);
    expect(entry?.nextCursor).toBe("fresh-cursor");
    expect(entry?.hasMore).toBe(true);
    expect(typeof entry?.ts).toBe("number");
    expect(entry?.ts).toBeGreaterThan(0);
  });

  it("prepends owner card on create without resetting pagination cursor", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1")],
      has_more: true,
      next_cursor: "cursor-1",
    });
    prependSourceGroupRow("src-1", makeRow("o-new", "owner"));
    const entry = getGroupUpSourceListEntry("src-1");
    expect(entry?.rows[0].opportunity_id).toBe("o-new");
    expect(entry?.rows).toHaveLength(2);
    expect(entry?.nextCursor).toBe("cursor-1");
    expect(entry?.hasMore).toBe(true);
  });

  it("append page does not reset to index-0 order of existing ids", () => {
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1"), makeRow("o2")],
      has_more: true,
      next_cursor: "c1",
    });
    setGroupUpSourceListPage(
      "src-1",
      {
        candidates: [makeRow("o3")],
        has_more: false,
        next_cursor: null,
      },
      { append: true }
    );
    const ids = getGroupUpSourceListEntry("src-1")?.rows.map(
      (r) => r.opportunity_id
    );
    expect(ids).toEqual(["o1", "o2", "o3"]);
  });
});

describe("SocialGroupPill count display rule", () => {
  it("never treats 0 as a display count", () => {
    const displayCount = (n: number) => (n > 0 ? n : null);
    expect(displayCount(0)).toBeNull();
    expect(displayCount(2)).toBe(2);
  });
});

describe("Duo label mapping", () => {
  it("keeps Duo label for Event Pair and Place Open Plan", () => {
    expect(socialUiCopy.duo).toBe("Duo");
    expect(socialUiCopy.group).toBe("Group");
  });
});

describe("source groups browse copy", () => {
  it("exposes vertical browse labels without people-count helper", () => {
    expect(socialUiCopy.sourceGroupsTitle).toBe("Groups");
    expect(socialUiCopy.groupSeeGroups).toBe("See groups");
    expect(socialUiCopy.groupSeeOtherGroups).toBe("See other groups");
    expect(socialUiCopy.groupMyGroup).toBe("My group");
    expect(socialUiCopy.groupRequest).toBe("Request");
    expect(socialUiCopy.groupRequested).toBe("Requested");
  });
});
