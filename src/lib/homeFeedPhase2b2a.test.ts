import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldSkipPublicFeedMemoryCache } from "../api/queries/getPublicFeed";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
import {
  __resetHomeFeedCyclesForTests,
  applyHomeFeedCycleState,
  buildUnseenHomeReplacementPage,
  cloneHomeFeedCycleState,
  filterUnseenCycleItems,
  getHomeFeedCycle,
  homeFeedCycleViewerKey,
  recordHomeFeedCycleDelivery,
  snapshotHomeFeedCycle,
  type HomeFeedCyclePage,
  type HomeFeedCycleState,
} from "./homeFeedCycle";
import {
  HOME_FEED_DISPLAY_CACHE_KEY_PREFIX,
  readHomeFeedHydrationSnapshot,
  writeHomeFeedDisplaySnapshot,
} from "./homeFeedListCache";
import { nextFeedOffset, rpcConsumedOffset } from "./homeFeedPagination";
import type { FeedItem } from "../api/queries/getPublicFeed";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function ids(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${String(from + i).padStart(2, "0")}`);
}

function row(id: string): { id: string } {
  return { id };
}

function pageOf(
  idList: string[],
  count: number,
  consumed = idList.length
): HomeFeedCyclePage<{ id: string }> {
  return {
    items: idList.map(row),
    consumedOffset: consumed,
    count,
    countIsAuthoritative: true,
  };
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

function makePager(server: Record<number, string[]>, count: number) {
  const fetchCalls: { offset: number; limit: number }[] = [];
  const peekCalls: number[] = [];
  return {
    fetchCalls,
    peekCalls,
    peekOffset0: async () => {
      peekCalls.push(0);
      return pageOf(server[0] ?? [], count);
    },
    fetchAtOffset: async (offset: number, limit: number) => {
      fetchCalls.push({ offset, limit });
      return pageOf((server[offset] ?? []).slice(0, limit), count);
    },
  };
}

describe("Home Feed Phase 2B.2A unseen-first refresh", () => {
  beforeEach(() => {
    __resetHomeFeedCyclesForTests();
  });
  afterEach(() => {
    __resetHomeFeedCyclesForTests();
  });

  const COUNT = 60;
  const first = ids(0, 15);
  const second = ids(15, 15);
  const third = ids(30, 15);
  const fourth = ids(45, 15);
  const server: Record<number, string[]> = {
    0: first,
    15: second,
    30: third,
    45: fourth,
  };

  it("1. initial current-cycle page A–O is recorded as seen", () => {
    const next = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    expect([...next.cycleSeenIds]).toEqual(first);
    expect(next.cursorOffset).toBe(15);
    expect(next.authoritativeCount).toBe(COUNT);
  });

  it("2–4. explicit refresh skips seen first card, then advances again", async () => {
    let state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const pager = makePager(server, COUNT);
    const firstRefresh = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: pager.peekOffset0,
      fetchAtOffset: pager.fetchAtOffset,
    });
    expect(firstRefresh.ok).toBe(true);
    if (!firstRefresh.ok) return;
    expect(firstRefresh.items[0]?.id).not.toBe(first[0]);
    expect(firstRefresh.items.map((i) => i.id)).toEqual(second);
    expect(
      firstRefresh.items.some((i) => state.cycleSeenIds.has(i.id))
    ).toBe(false);

    state = firstRefresh.nextState;
    const pager2 = makePager(server, COUNT);
    const secondRefresh = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: pager2.peekOffset0,
      fetchAtOffset: pager2.fetchAtOffset,
    });
    expect(secondRefresh.ok).toBe(true);
    if (!secondRefresh.ok) return;
    expect(secondRefresh.items.map((i) => i.id)).toEqual(third);
    expect(secondRefresh.items[0]?.id).not.toBe(firstRefresh.items[0]?.id);
  });

  it("5–6. same server sequence + same cycle state is deterministic; no randomization", async () => {
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const run = () =>
      buildUnseenHomeReplacementPage({
        state: cloneHomeFeedCycleState(state),
        pageSize: 15,
        peekOffset0: makePager(server, COUNT).peekOffset0,
        fetchAtOffset: makePager(server, COUNT).fetchAtOffset,
      });
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
    expect(read("src/lib/homeFeedCycle.ts")).not.toMatch(/Math\.random|seededShuffle|Date\.now\(/);
  });

  it("7–9. fresh unseen rank-1 is injected in server order; already-seen rank-1 is not", async () => {
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const withNew = {
      ...server,
      0: ["X", ...first.slice(1)],
    };
    const injected = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: makePager(withNew, COUNT).peekOffset0,
      fetchAtOffset: makePager(withNew, COUNT).fetchAtOffset,
    });
    expect(injected.ok).toBe(true);
    if (!injected.ok) return;
    expect(injected.peekInjectedIds[0]).toBe("X");
    expect(injected.items[0]?.id).toBe("X");
    expect(injected.items.map((i) => i.id).slice(1)).toEqual(second.slice(0, 14));

    const seenRank1 = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: makePager(server, COUNT).peekOffset0,
      fetchAtOffset: makePager(server, COUNT).fetchAtOffset,
    });
    expect(seenRank1.ok).toBe(true);
    if (!seenRank1.ok) return;
    expect(seenRank1.peekInjectedIds).toEqual([]);
    expect(seenRank1.items[0]?.id).not.toBe(first[0]);
  });

  it("10–11. cursor fill preserves server order and advances by raw RPC rows", async () => {
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const displayed = second.slice(0, 8);
    const rawPage = [...first.slice(0, 7), ...displayed];
    const result = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 8,
      scanLimit: 15,
      peekOffset0: async () => pageOf(first, COUNT),
      fetchAtOffset: async (offset, limit) => {
        expect(offset).toBe(15);
        expect(limit).toBe(15);
        return pageOf(rawPage, COUNT, 15);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.id)).toEqual(displayed);
    expect(rpcConsumedOffset(15, 15)).toBe(15);
    expect(result.nextState.cursorOffset).toBe(nextFeedOffset(15, 15));
    expect(result.nextState.cursorOffset).toBe(30);
    expect(result.nextState.cursorOffset).not.toBe(15 + displayed.length);
  });

  it("12. a page with zero selected IDs continues scanning when count says more", async () => {
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const fetchOffsets: number[] = [];
    const result = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: async () => pageOf(first, COUNT),
      fetchAtOffset: async (offset, limit) => {
        fetchOffsets.push(offset);
        if (offset === 15) return pageOf(first, COUNT);
        return pageOf((server[offset] ?? []).slice(0, limit), COUNT);
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchOffsets).toContain(15);
    expect(fetchOffsets).toContain(30);
    expect(result.items.map((i) => i.id)).toEqual(third);
  });

  it("13. finite safety guard stops infinite scanning", async () => {
    let fetches = 0;
    const result = await buildUnseenHomeReplacementPage({
      state: recordHomeFeedCycleDelivery(emptyState(), {
        deliveredItems: first.map(row),
        requestOffset: 0,
        consumedOffset: 15,
        count: 10_000,
        countIsAuthoritative: true,
      }),
      pageSize: 15,
      maxScanPages: 3,
      peekOffset0: async () => pageOf(first, 10_000),
      fetchAtOffset: async (offset) => {
        fetches += 1;
        return pageOf(first, 10_000);
      },
    });
    expect(result.ok).toBe(false);
    expect(fetches).toBeLessThanOrEqual(3);
  });

  it("14–15. replacement is deduped by real post.id and never delivers the same id twice", async () => {
    const dupPeek = ["X", "X", ...second];
    const state = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    const result = await buildUnseenHomeReplacementPage({
      state,
      pageSize: 15,
      peekOffset0: async () => pageOf(dupPeek, COUNT),
      fetchAtOffset: async () => pageOf([...second, "X"], COUNT),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.items.map((i) => i.id);
    expect(new Set(out).size).toBe(out.length);
    expect(out.filter((id) => id === "X")).toHaveLength(1);
    expect(out.some((id) => first.includes(id))).toBe(false);
  });

  it("16. failed refresh preserves current items and cycle state", async () => {
    const viewer = homeFeedCycleViewerKey("v1");
    const recorded = recordHomeFeedCycleDelivery(emptyState(), {
      deliveredItems: first.map(row),
      requestOffset: 0,
      consumedOffset: 15,
      count: COUNT,
      countIsAuthoritative: true,
    });
    applyHomeFeedCycleState(viewer, recorded);
    const before = snapshotHomeFeedCycle(viewer);
    const result = await buildUnseenHomeReplacementPage({
      state: getHomeFeedCycle(viewer),
      peekOffset0: async () => {
        throw new Error("network down");
      },
      fetchAtOffset: async () => pageOf(second, COUNT),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(snapshotHomeFeedCycle(viewer)).toEqual(before);
  });

  it("17. skipMemoryCache is the intended offset-0 bypass and is not a cache key field", () => {
    expect(shouldSkipPublicFeedMemoryCache({ skipMemoryCache: true })).toBe(
      true
    );
    expect(shouldSkipPublicFeedMemoryCache({})).toBe(false);
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("skipMemoryCache?: boolean");
    expect(feed).toContain("shouldSkipPublicFeedMemoryCache");
    expect(feed).toContain("skipMemoryCache is intentionally omitted from the cache key");
    expect(feed).toContain("if (offset === 0 && !shouldSkipPublicFeedMemoryCache(opts))");
    expect(feed).toContain("if (offset === 0 && readMemoryCache)");
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("skipMemoryCache: true");
    expect(home).not.toContain("clearFeedCache(");
  });

  it("18 + 20. display/persist snapshot follows the replacement page", () => {
    const storage = new Map<string, string>();
    const orig = globalThis.localStorage;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      get length() {
        return storage.size;
      },
    });
    const mem = new Map<string, FeedItem[]>();
    const rpcKey = "feed:all:guest";
    const replacement = second.map((id) => ({ id } as FeedItem));
    writeHomeFeedDisplaySnapshot(rpcKey, replacement, (key, value) => {
      mem.set(key, value);
    });
    const snap = readHomeFeedHydrationSnapshot(rpcKey, (key) => mem.get(key));
    expect(snap?.items.map((i) => i.id)).toEqual(second);
    expect(snap?.source).toBe("display");
    expect(
      [...mem.keys()].some((k) => k.startsWith(HOME_FEED_DISPLAY_CACHE_KEY_PREFIX))
    ).toBe(true);
    vi.unstubAllGlobals();
    if (orig) vi.stubGlobal("localStorage", orig);
  });

  it("19. native resume does not rotate", () => {
    const home = read("src/pages/HomePage.tsx");
    const pf = read("src/components/ProgressiveFeed.tsx");
    expect(home).toContain("setHomeFeedSoftRefreshEpoch");
    expect(home).toContain("skipOffsetZeroHeadReplace");
    expect(home).not.toMatch(
      /App\.addListener\("resume"[\s\S]*runUnseenHomeReplacement/
    );
    expect(pf).toContain("if (skipOffsetZeroHeadReplace)");
    expect(pf).toContain("listReplaceRevision");
  });

  it("21–26. filtered feeds and past-Event exclusion stay ungated for rotation", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("isTrueDefaultAllVerticalFeed");
    expect(home).toContain("detail?.source === \"home-tab\" || currentlyDefaultAll");
    expect(filterUnseenCycleItems([{ id: "a" }, { id: "b" }], new Set(["a"]))).toEqual([
      { id: "b" },
    ]);
    const expiry = read("src/lib/feedExpiryFilters.ts");
    expect(expiry).toContain("isHangoutDiscoveryEligible");
  });

  it("27–28. Phase 2B.1 ranking and 2B.1.1 consumedOffset contract unchanged", () => {
    const sql = read(
      "supabase/migrations/20260909201736_feed_phase2b1_default_all_ranking.sql"
    );
    expect(sql).toContain("all_score DESC");
    expect(sql).toContain("created_at DESC");
    expect(sql).toContain("id DESC");
    const pag = read("src/lib/homeFeedPagination.ts");
    expect(pag).toContain("consumedOffset = RAW backend rows");
    expect(read("src/api/queries/getPublicFeed.ts")).toContain(
      "rpcConsumedOffset(result.posts.length, limit)"
    );
    expect(read("src/pages/HomePage.tsx")).toContain(
      "consumedOffset: rawConsumed"
    );
  });

  it("29–30. Profile untouched; Duo/Group keep real post ids", () => {
    expect(read("src/api/queries/getUserPostsCreated.ts")).not.toContain(
      "buildUnseenHomeReplacementPage"
    );
    expect(read("src/lib/homeFeedCycle.ts")).not.toContain("presentationId");
    expect(read("src/lib/homeFeedCycle.ts")).not.toContain("cycleKey");
    expect(read("src/components/ProgressiveFeed.tsx")).not.toContain(
      "fake post.id"
    );
    const cycle = read("src/lib/homeFeedCycle.ts");
    expect(cycle).toContain("item.id");
  });
});
