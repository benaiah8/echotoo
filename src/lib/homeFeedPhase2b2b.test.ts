import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HOME_FEED_FIRST_PAGE,
  HOME_FEED_MAX_MOUNTED_ITEMS,
  HOME_FEED_PRUNE_TO_ITEMS,
} from "./homeFeedConstants";
import {
  __resetHomeFeedCyclesForTests,
  applyHomeFeedCycleState,
  buildUnseenHomeReplacementPage,
  cloneHomeFeedCycleState,
  compactHomeFeedDisplaySnapshot,
  filterUnseenCycleItems,
  getHomeFeedCycle,
  getHomeFeedItemPresentationKey,
  getHomeFeedItemRealId,
  homeFeedPresentationKey,
  HOME_FEED_PRESENTATION_KEY_FIELD,
  isHomeFeedCycleExhausted,
  pruneMountedHomeFeedItems,
  recordHomeFeedCycleDelivery,
  stampHomeFeedPresentationKeys,
  startNextHomeFeedCycle,
  type HomeFeedCycleState,
} from "./homeFeedCycle";
import { nextFeedOffset, rpcConsumedOffset } from "./homeFeedPagination";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function emptyState(): HomeFeedCycleState {
  return {
    cycleId: 1,
    cursorOffset: 0,
    cycleSeenIds: new Set(),
    authoritativeCount: null,
    replacedThisCycle: false,
  };
}

function row(id: string) {
  return { id };
}

describe("Home Feed Phase 2B.2B continuous cycling", () => {
  beforeEach(() => {
    __resetHomeFeedCyclesForTests();
  });
  afterEach(() => {
    __resetHomeFeedCyclesForTests();
  });

  it("1–5. genuine exhaustion starts cycle 2; clears seen; cursor 0; no terminal wrap commit", () => {
    let state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: Array.from({ length: 8 }, (_, i) => row(`p${i}`)),
      requestOffset: 0,
      consumedOffset: 8,
      count: 8,
      countIsAuthoritative: true,
    });
    expect(isHomeFeedCycleExhausted(state)).toBe(true);
    const next = startNextHomeFeedCycle(state);
    expect(next.cycleId).toBe(2);
    expect(next.cycleSeenIds.size).toBe(0);
    expect(next.cursorOffset).toBe(0);
    expect(next.authoritativeCount).toBe(8);
    expect(next.replacedThisCycle).toBe(false);
    applyHomeFeedCycleState("v1", next);
    expect(getHomeFeedCycle("v1").cycleId).toBe(2);
    const pf = read("src/components/ProgressiveFeed.tsx");
    expect(pf).toContain("onCycleWrap");
    expect(pf).toContain("continuousCycling");
    expect(pf).toContain("HOME_FEED_CYCLE_MAX_WRAPS_PER_LOAD");
  });

  it("6–9. cycle 2 may reuse real IDs; presentation keys differ; real id unchanged", () => {
    const cycle1 = stampHomeFeedPresentationKeys(
      [row("A"), row("B")],
      1
    );
    const cycle2 = stampHomeFeedPresentationKeys(
      [row("A"), row("B")],
      2
    );
    expect(cycle2.map((i) => getHomeFeedItemRealId(i))).toEqual(["A", "B"]);
    expect(cycle1[0]?.id).toBe("A");
    expect(getHomeFeedItemPresentationKey(cycle1[0]!)).toBe(
      homeFeedPresentationKey(1, "A")
    );
    expect(getHomeFeedItemPresentationKey(cycle2[0]!)).toBe(
      homeFeedPresentationKey(2, "A")
    );
    expect(getHomeFeedItemPresentationKey(cycle1[0]!)).not.toBe(
      getHomeFeedItemPresentationKey(cycle2[0]!)
    );
    const within = filterUnseenCycleItems(
      [row("A"), row("A"), row("B")],
      new Set()
    );
    expect(within.map((i) => i.id)).toEqual(["A", "B"]);
  });

  it("7 + 29. same real ID cannot appear twice inside one cycle", () => {
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: [row("A")],
      requestOffset: 0,
      consumedOffset: 1,
      count: 3,
      countIsAuthoritative: true,
    });
    expect(
      filterUnseenCycleItems([row("A"), row("B")], state.cycleSeenIds).map(
        (i) => i.id
      )
    ).toEqual(["B"]);
  });

  it("10–12. like/save patch and delete fan-out by real id; business id stays real", () => {
    const mounted = [
      ...stampHomeFeedPresentationKeys([row("A")], 1),
      ...stampHomeFeedPresentationKeys([row("A")], 2),
    ];
    const patched = mounted.map((item) =>
      item.id === "A"
        ? ({ ...item, liked_by_me: true, like_count: 3 } as typeof item & {
            liked_by_me: boolean;
            like_count: number;
          })
        : item
    );
    expect(patched.every((p) => p.id === "A")).toBe(true);
    expect(
      patched.every((p) => (p as { like_count?: number }).like_count === 3)
    ).toBe(true);
    const afterDelete = patched.filter((p) => p.id !== "A");
    expect(afterDelete).toHaveLength(0);
    const pf = read("src/components/ProgressiveFeed.tsx");
    expect(pf).toContain("if (item.id !== postId) return item");
    expect(pf).toContain("prev.filter((item) => item.id !== postId)");
    const home = read("src/sections/home/HomePostsSection.tsx");
    expect(home).toContain("postId={item.id}");
    expect(home).toContain("getHomeFeedItemPresentationKey");
  });

  it("13–14. server order + raw consumedOffset preserved on wrap delivery", () => {
    const page = ["c", "a", "b"].map(row);
    const stamped = stampHomeFeedPresentationKeys(page, 2);
    expect(stamped.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(rpcConsumedOffset(15, 15)).toBe(15);
    expect(nextFeedOffset(0, 15)).toBe(15);
  });

  it("15–16. true_total shrink / small pool wrap without looping", () => {
    const exhausted = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: Array.from({ length: 8 }, (_, i) => row(`p${i}`)),
      requestOffset: 0,
      consumedOffset: 8,
      count: 8,
      countIsAuthoritative: true,
    });
    const cycle2 = startNextHomeFeedCycle(exhausted);
    const afterShrink = recordHomeFeedCycleDelivery(cycle2, {
      deliveredItems: Array.from({ length: 3 }, (_, i) => row(`p${i}`)),
      requestOffset: 0,
      consumedOffset: 3,
      count: 3,
      countIsAuthoritative: true,
    });
    expect(isHomeFeedCycleExhausted(afterShrink)).toBe(true);
    const cycle3 = startNextHomeFeedCycle(afterShrink);
    expect(cycle3.cycleId).toBe(3);
    expect(cycle3.cursorOffset).toBe(0);
    expect(cycle3.cycleSeenIds.size).toBe(0);
  });

  it("17. empty-display scan keeps finite wrap guard in ProgressiveFeed", () => {
    expect(read("src/lib/homeFeedCycle.ts")).toContain(
      "HOME_FEED_CYCLE_MAX_WRAPS_PER_LOAD"
    );
    expect(read("src/components/ProgressiveFeed.tsx")).toContain(
      "wraps < HOME_FEED_CYCLE_MAX_WRAPS_PER_LOAD"
    );
  });

  it("18–20. filtered / search do not cycle; past Events not reintroduced", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("continuousCycling={browseIsTrueDefaultAll}");
    expect(home).toContain("wrapTrueDefaultAllCycle");
    expect(home).toContain("isTrueDefaultAllVerticalFeed");
    expect(read("src/lib/feedExpiryFilters.ts")).toContain(
      "isHangoutDiscoveryEligible"
    );
  });

  it("21–22. Phase 2B.2A refresh + fresh top injection still work", async () => {
    const first = Array.from({ length: 15 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const second = Array.from({ length: 15 }, (_, i) => `p${String(i + 15).padStart(2, "0")}`);
    let state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: 60,
      countIsAuthoritative: true,
    });
    const refresh = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: async () => ({
        items: ["X", ...first.slice(1)].map(row),
        consumedOffset: 15,
        count: 60,
        countIsAuthoritative: true,
      }),
      fetchAtOffset: async () => ({
        items: second.map(row),
        consumedOffset: 15,
        count: 60,
        countIsAuthoritative: true,
      }),
    });
    expect(refresh.ok).toBe(true);
    if (!refresh.ok) return;
    expect(refresh.items[0]?.id).toBe("X");
    expect(refresh.items[0]?.[HOME_FEED_PRESENTATION_KEY_FIELD]).toBe(
      homeFeedPresentationKey(1, "X")
    );
    expect(refresh.nextState.replacedThisCycle).toBe(true);
    expect(refresh.nextState.cycleId).toBe(1);
  });

  it("23. native resume does not rotate", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain(
      "skipOffsetZeroHeadReplace={browseIsTrueDefaultAll}"
    );
    const resumeIdx = home.indexOf('App.addListener("resume"');
    expect(resumeIdx).toBeGreaterThan(-1);
    const resumeBlock = home.slice(resumeIdx, resumeIdx + 350);
    expect(resumeBlock).toContain("setHomeFeedSoftRefreshEpoch");
    expect(resumeBlock).not.toContain("wrapTrueDefaultAllCycle");
    expect(resumeBlock).not.toContain("runUnseenHomeReplacement");
  });

  it("24–26. mounted list capped; prune removes front; business ids intact", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      stampHomeFeedPresentationKeys([row(`id-${i}`)], 1)[0]!
    );
    const { items: pruned, prunedCount } = pruneMountedHomeFeedItems(items);
    expect(items.length).toBeGreaterThan(HOME_FEED_MAX_MOUNTED_ITEMS);
    expect(pruned.length).toBe(HOME_FEED_PRUNE_TO_ITEMS);
    expect(prunedCount).toBe(100 - HOME_FEED_PRUNE_TO_ITEMS);
    expect(pruned[0]?.id).toBe(`id-${prunedCount}`);
    expect(pruned.every((p) => typeof p.id === "string")).toBe(true);
    expect(pruned[0]?.[HOME_FEED_PRESENTATION_KEY_FIELD]).toContain("1:");
  });

  it("27–28. cache count non-authoritative path unchanged; snapshot bounded", () => {
    const long = Array.from({ length: 45 }, (_, i) =>
      stampHomeFeedPresentationKeys([row(`post-${i}`)], 2)[0]!
    );
    const compact = compactHomeFeedDisplaySnapshot(long);
    expect(compact).toHaveLength(HOME_FEED_FIRST_PAGE);
    expect(compact[0]?.id).toBe("post-30");
    expect(
      (compact[0] as { [HOME_FEED_PRESENTATION_KEY_FIELD]?: string })[
        HOME_FEED_PRESENTATION_KEY_FIELD
      ]
    ).toBeUndefined();
    expect(read("src/api/queries/getPublicFeed.ts")).toContain(
      "countIsAuthoritative: false"
    );
  });

  it("30. no ranking/SQL change", () => {
    const sql = read(
      "supabase/migrations/20260909201736_feed_phase2b1_default_all_ranking.sql"
    );
    expect(sql).toContain("all_score DESC");
    expect(read("src/lib/homeFeedCycle.ts")).not.toContain("Math.random");
    expect(cloneHomeFeedCycleState(emptyState()).cycleId).toBe(1);
  });
});
