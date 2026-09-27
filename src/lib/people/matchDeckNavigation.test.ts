import { describe, expect, it } from "vitest";
import {
  RECENT_BACK_LIMIT,
  RECENT_BACK_PRUNE_BUFFER,
  filterOrderedIdsToEligible,
  indexOfOpportunity,
  isTrueCaughtUpState,
  pruneActiveOrderedIds,
  resolveCurrentOrNearestId,
  resolveNearestOpportunityId,
  shouldLoadMoreForEmptyWindow,
  shouldPruneActiveWindow,
} from "./matchDeckNavigation";

describe("indexOfOpportunity", () => {
  it("returns -1 on miss, never 0", () => {
    const rows = [{ opportunity_id: "a" }, { opportunity_id: "b" }];
    expect(indexOfOpportunity(rows, "missing")).toBe(-1);
    expect(indexOfOpportunity(rows, null)).toBe(-1);
    expect(indexOfOpportunity([], "a")).toBe(-1);
  });

  it("returns real index when found", () => {
    const rows = [{ opportunity_id: "a" }, { opportunity_id: "b" }];
    expect(indexOfOpportunity(rows, "b")).toBe(1);
    expect(indexOfOpportunity(rows, "a")).toBe(0);
  });
});

describe("resolveNearestOpportunityId", () => {
  const ordered = ["a", "b", "c", "d", "e"];

  it("prefers next after leaving id", () => {
    expect(
      resolveNearestOpportunityId(ordered, new Set(["a", "c", "d", "e"]), "b")
    ).toBe("c");
  });

  it("falls back to previous when at end", () => {
    expect(
      resolveNearestOpportunityId(ordered, new Set(["a", "b", "c", "d"]), "e")
    ).toBe("d");
  });

  it("returns null when nothing remains", () => {
    expect(resolveNearestOpportunityId(ordered, new Set(), "c")).toBeNull();
  });

  it("uses pre-removal order even if leaving id already absent from remaining", () => {
    expect(
      resolveNearestOpportunityId(ordered, ["a", "b", "d", "e"], "c")
    ).toBe("d");
  });
});

describe("resolveCurrentOrNearestId", () => {
  it("keeps valid current", () => {
    expect(
      resolveCurrentOrNearestId(["a", "b", "c"], new Set(["a", "b", "c"]), "b")
    ).toBe("b");
  });

  it("resolves nearest when current missing", () => {
    expect(
      resolveCurrentOrNearestId(["a", "b", "c"], new Set(["a", "c"]), "b")
    ).toBe("c");
  });
});

describe("window prune", () => {
  it("does not prune until past limit + buffer", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    const current = ids[RECENT_BACK_LIMIT + RECENT_BACK_PRUNE_BUFFER]!;
    expect(shouldPruneActiveWindow(ids, current)).toBe(false);
    expect(pruneActiveOrderedIds(ids, current)).toBeNull();
  });

  it("retires only prefix behind current", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    const currentIndex = 22;
    const current = ids[currentIndex]!;
    expect(shouldPruneActiveWindow(ids, current)).toBe(true);
    const result = pruneActiveOrderedIds(ids, current);
    expect(result).not.toBeNull();
    expect(result!.kept[0]).toBe(ids[currentIndex - RECENT_BACK_LIMIT]);
    expect(result!.kept.includes(current)).toBe(true);
    expect(result!.kept[result!.kept.length - 1]).toBe(ids[ids.length - 1]);
    expect(result!.retired).toEqual(
      ids.slice(0, currentIndex - RECENT_BACK_LIMIT)
    );
    expect(result!.retired.includes(current)).toBe(false);
  });
});

describe("caught-up / empty+hasMore", () => {
  it("true caught-up only when empty loaded no-more not in-flight", () => {
    expect(
      isTrueCaughtUpState({
        visibleCount: 0,
        hasLoaded: true,
        hasMore: false,
        loadMoreInFlight: false,
      })
    ).toBe(true);
    expect(
      isTrueCaughtUpState({
        visibleCount: 0,
        hasLoaded: true,
        hasMore: true,
        loadMoreInFlight: false,
      })
    ).toBe(false);
    expect(
      isTrueCaughtUpState({
        visibleCount: 0,
        hasLoaded: true,
        hasMore: false,
        loadMoreInFlight: true,
      })
    ).toBe(false);
  });

  it("loadMore for empty window when hasMore and not in-flight", () => {
    expect(
      shouldLoadMoreForEmptyWindow({
        visibleCount: 0,
        hasMore: true,
        loadMoreInFlight: false,
      })
    ).toBe(true);
    expect(
      shouldLoadMoreForEmptyWindow({
        visibleCount: 0,
        hasMore: true,
        loadMoreInFlight: true,
      })
    ).toBe(false);
  });
});

describe("filterOrderedIdsToEligible", () => {
  it("drops stale ids", () => {
    expect(
      filterOrderedIdsToEligible(["a", "b", "c"], new Set(["a", "c"]))
    ).toEqual(["a", "c"]);
  });
});
