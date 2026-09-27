import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetSocialActionPersistForTests,
  persistDuoOwnState,
  persistOpenPlanOwnState,
  readSocialActionPersistBag,
  SOCIAL_COUNT_PERSIST_TTL_MS,
  SOCIAL_OWN_PERSIST_TTL_MS,
} from "../socialActionPersistCache";
import {
  getCachedPairUp,
  isCachedPairUpSoftStale,
  invalidateAllPairUpCache,
  PAIR_UP_OWN_SOFT_STALE_MS,
  setCachedPairUp,
} from "../pairUpCache";
import {
  getPairUpJoinStatus,
  isPairUpJoinStateResolving,
  __setPairUpJoinViewerForTests,
  __resetPairUpJoinStoreForTests,
} from "../pairUpJoinStore";
import {
  getGroupUpDiscoverableCount,
  isGroupUpCountResolving,
  __setGroupUpCountViewerForTests,
  __resetGroupUpCountStoreForTests,
  seedGroupUpCountFromSnapshot,
} from "../groupUpCountStore";
import {
  getOpenPlanOwnStatus,
  isOpenPlanOwnStateResolving,
  __setOpenPlanOwnViewerForTests,
  __resetOpenPlanOwnStoreForTests,
  seedOpenPlanOwnFromSnapshot,
} from "../openPlanOwnStore";
import { getCachedOpenPlanOwn } from "../openPlanCache";
import {
  classifyFeedStopReason,
  type FeedPageDiagnostic,
} from "../feedStopDiagnostics";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("social SWR / resume semantics", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    __resetSocialActionPersistForTests();
    __resetPairUpJoinStoreForTests();
    __resetGroupUpCountStoreForTests();
    __resetOpenPlanOwnStoreForTests();
    invalidateAllPairUpCache();
    __setPairUpJoinViewerForTests("u1");
    __setGroupUpCountViewerForTests("u1");
    __setOpenPlanOwnViewerForTests("u1");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps known Duo after soft-stale window without UNKNOWN", () => {
    vi.useFakeTimers();
    setCachedPairUp("u1", "p1", {
      id: "x",
      source_post_id: "p1",
      status: "active",
      description: null,
      discoverable_until: "",
      created_at: new Date().toISOString(),
    });
    expect(getPairUpJoinStatus("p1")).toBe("joined");
    expect(isPairUpJoinStateResolving("p1")).toBe(false);

    vi.advanceTimersByTime(PAIR_UP_OWN_SOFT_STALE_MS + 1000);
    expect(isCachedPairUpSoftStale("u1", "p1")).toBe(true);
    expect(getCachedPairUp("u1", "p1")).not.toBeUndefined();
    expect(getPairUpJoinStatus("p1")).toBe("joined");
    expect(isPairUpJoinStateResolving("p1")).toBe(false);
  });

  it("rehydrates Duo from persist after memory wipe", () => {
    persistDuoOwnState("u1", "p9", true);
    invalidateAllPairUpCache();
    expect(getCachedPairUp("u1", "p9")).toBeUndefined();
    expect(getPairUpJoinStatus("p9")).toBe("joined");
    expect(isPairUpJoinStateResolving("p9")).toBe(false);
  });

  it("persists Place Duo / Open Plan own-active", () => {
    seedOpenPlanOwnFromSnapshot("u1", "place1", true);
    const bag = readSocialActionPersistBag("u1");
    expect(bag.openPlan.place1?.active).toBe(true);
    expect(getOpenPlanOwnStatus("place1")).toBe("active");
    expect(isOpenPlanOwnStateResolving("place1")).toBe(false);
    expect(getCachedOpenPlanOwn("u1", "place1")).not.toBeUndefined();
  });

  it("keeps Group count known past soft count TTL", () => {
    vi.useFakeTimers();
    seedGroupUpCountFromSnapshot("u1", "p1", 4);
    expect(getGroupUpDiscoverableCount("p1")).toBe(4);
    expect(isGroupUpCountResolving("p1")).toBe(false);

    vi.advanceTimersByTime(SOCIAL_COUNT_PERSIST_TTL_MS + 1000);
    const bag = readSocialActionPersistBag("u1");
    expect(bag.counts.p1?.count).toBe(4);
    expect(getGroupUpDiscoverableCount("p1")).toBe(4);
    expect(isGroupUpCountResolving("p1")).toBe(false);
  });

  it("openPlan persist survives own TTL window shorter than hard TTL", () => {
    persistOpenPlanOwnState("u1", "p2", false);
    expect(readSocialActionPersistBag("u1").openPlan.p2?.active).toBe(false);
    expect(SOCIAL_OWN_PERSIST_TTL_MS).toBeGreaterThan(SOCIAL_COUNT_PERSIST_TTL_MS);
  });
});

describe("feed stop reason classifier", () => {
  const base: FeedPageDiagnostic = {
    requestedOffset: 12,
    requestedLimit: 12,
    postsLength: 0,
    count: 0,
    consumedOffsetThisPage: 0,
    nextOffset: 12,
    inferredHasMore: false,
    responseSource: "network",
  };

  it("classifies consumed-zero", () => {
    expect(classifyFeedStopReason(base)).toBe("consumed-zero");
  });

  it("classifies fallback-count", () => {
    expect(
      classifyFeedStopReason({
        ...base,
        consumedOffsetThisPage: 12,
        postsLength: 12,
        count: 12,
        countSource: "fallback-cache-length",
        countIsAuthoritative: false,
        responseSource: "error-fallback",
        inferredHasMore: false,
      })
    ).toBe("fallback-count");
  });

  it("classifies offset-reached-count", () => {
    expect(
      classifyFeedStopReason({
        ...base,
        consumedOffsetThisPage: 5,
        postsLength: 5,
        count: 17,
        countIsAuthoritative: true,
        nextOffset: 17,
        responseSource: "network",
      })
    ).toBe("offset-reached-count");
  });
});
