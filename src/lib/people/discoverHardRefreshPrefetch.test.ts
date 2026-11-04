import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDiscoverHardRefreshPage,
  countUniqueDiscoverCreators,
  countUnseenDiscoverOpportunities,
  shouldContinueDiscoverHardRefreshPrefetch,
  shouldFetchDiscoverHardRefreshBoostPage,
} from "./discoverHardRefreshPrefetch";
import {
  clearDiscoverRecentSeenHistory,
  noteDiscoverOpportunitiesDisplayed,
  orderDiscoverCandidates,
} from "./discoverCandidateRotation";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(id: string, creator: string) {
  return { opportunity_id: id, creator_id: creator, source_post_id: `s-${id}` };
}

describe("discoverHardRefreshPrefetch", () => {
  it("counts creators and unseen opportunities", () => {
    const page0 = [
      row("a1", "ben"),
      row("a2", "ben"),
      row("b1", "other"),
      row("b2", "other"),
    ];
    expect(countUniqueDiscoverCreators(page0)).toBe(2);
    expect(
      countUnseenDiscoverOpportunities(page0, ["a1", "a2", "b1", "b2"])
    ).toBe(0);
    expect(countUnseenDiscoverOpportunities(page0, ["a1"])).toBe(3);
  });

  it("does not continue multi-page prefetch for concentrated page 0", () => {
    const page0 = Array.from({ length: 20 }, (_, i) =>
      row(`p0-${i}`, i < 10 ? "ben" : "other")
    );
    expect(
      shouldContinueDiscoverHardRefreshPrefetch({
        pagesFetched: 1,
        candidates: page0,
        recentSeenIds: page0.map((r) => r.opportunity_id),
        hasMore: true,
        nextCursor: "cursor-1",
      })
    ).toBe(false);
  });

  it("allows a single boost page only for single-creator monopoly", () => {
    const monopoly = Array.from({ length: 20 }, (_, i) =>
      row(`m-${i}`, "ben")
    );
    expect(
      shouldFetchDiscoverHardRefreshBoostPage({
        pagesFetched: 1,
        candidates: monopoly,
        hasMore: true,
        nextCursor: "c1",
        allowSingleCreatorBoost: true,
      })
    ).toBe(true);

    const mixed = [
      ...Array.from({ length: 10 }, (_, i) => row(`a-${i}`, "ben")),
      ...Array.from({ length: 10 }, (_, i) => row(`b-${i}`, "other")),
    ];
    expect(
      shouldFetchDiscoverHardRefreshBoostPage({
        pagesFetched: 1,
        candidates: mixed,
        hasMore: true,
        nextCursor: "c1",
        allowSingleCreatorBoost: true,
      })
    ).toBe(false);

    expect(
      shouldFetchDiscoverHardRefreshBoostPage({
        pagesFetched: 2,
        candidates: monopoly,
        hasMore: true,
        nextCursor: "c2",
        allowSingleCreatorBoost: true,
      })
    ).toBe(false);
  });

  it("appends pages without duplicate opportunity ids", () => {
    const merged = appendDiscoverHardRefreshPage(
      [row("a1", "ben"), row("b1", "other")],
      [row("b1", "other"), row("c1", "creator3")]
    );
    expect(merged.map((r) => r.opportunity_id)).toEqual(["a1", "b1", "c1"]);
  });

  it("fresh-window ordering changes lead creator when alternatives were recently shown", () => {
    clearDiscoverRecentSeenHistory();
    const page0 = [
      ...Array.from({ length: 10 }, (_, i) => row(`ben-${i}`, "ben")),
      ...Array.from({ length: 10 }, (_, i) => row(`oth-${i}`, "other")),
    ];
    noteDiscoverOpportunitiesDisplayed(
      "viewer",
      page0.filter((r) => r.creator_id === "ben").map((r) => r.opportunity_id)
    );
    const ordered = orderDiscoverCandidates({
      userId: "viewer",
      candidates: page0,
      previousOrderedIds: [],
      hasMore: true,
      rotationEpoch: 0,
    });
    expect(ordered[0]?.creator_id).toBe("other");
    expect(new Set(ordered.map((r) => r.opportunity_id)).size).toBe(
      page0.length
    );
    clearDiscoverRecentSeenHistory();
  });

  it("wires Discover hardRefresh to single-page / boost policy (not soft revalidate)", () => {
    const hook = read("hooks/usePairUpCandidates.ts");
    expect(hook).toContain("shouldFetchDiscoverHardRefreshBoostPage");
    expect(hook).not.toContain("shouldContinueDiscoverHardRefreshPrefetch");
    expect(hook).toContain("allowSingleCreatorBoost: true");
    const hardAt = hook.indexOf("const hardRefresh = useCallback");
    expect(hardAt).toBeGreaterThanOrEqual(0);
    const hardFn = hook.slice(hardAt, hardAt + 5500);
    expect(hardFn).toContain("clearDiscoverCommentRetention");
    expect(hardFn).toContain("force: true");
    expect(hardFn).toContain("shouldFetchDiscoverHardRefreshBoostPage");

    const softAt = hook.indexOf("const revalidate = useCallback");
    const softFn = hook.slice(softAt, softAt + 3500);
    expect(softFn).not.toContain("shouldFetchDiscoverHardRefreshBoostPage");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain('contentScope !== "discover"');
    expect(overlay).toContain("allLoadedSeen");
  });
});
