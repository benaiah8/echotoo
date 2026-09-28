import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetSocialActionPersistForTests,
  readSocialActionPersistBag,
} from "../socialActionPersistCache";
import { seedSocialActionsFromFeedItems } from "../seedSocialActionsFromFeed";
import {
  getPairUpJoinStatus,
  subscribePairUpJoinState,
  __setPairUpJoinViewerForTests,
  __resetPairUpJoinStoreForTests,
} from "../pairUpJoinStore";
import {
  getGroupUpOwnStatus,
  subscribeGroupUpOwnState,
  __setGroupUpOwnViewerForTests,
  __resetGroupUpOwnStoreForTests,
} from "../groupUpOwnStore";
import {
  getGroupUpDiscoverableCount,
  subscribeGroupUpCount,
  __setGroupUpCountViewerForTests,
  __resetGroupUpCountStoreForTests,
} from "../groupUpCountStore";
import { getCachedPairUp, invalidateAllPairUpCache } from "../pairUpCache";
import { getCachedGroupUpOwn, invalidateGroupUpOwnForPost } from "../groupUpCache";

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

describe("seedSocialActionsFromFeedItems", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    __resetSocialActionPersistForTests();
    __resetPairUpJoinStoreForTests();
    __resetGroupUpOwnStoreForTests();
    __resetGroupUpCountStoreForTests();
    invalidateAllPairUpCache();
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) invalidateGroupUpOwnForPost(id);
    __setPairUpJoinViewerForTests("u1");
    __setGroupUpOwnViewerForTests("u1");
    __setGroupUpCountViewerForTests("u1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds hangout duo + group own + count into canonical stores", () => {
    seedSocialActionsFromFeedItems(
      [
        {
          id: "p1",
          type: "hangout",
          duo_own_active: true,
          group_own_active: true,
          discoverable_group_count: 2,
        },
      ],
      "u1"
    );

    expect(getPairUpJoinStatus("p1")).toBe("joined");
    expect(getGroupUpOwnStatus("p1")).toBe("active");
    expect(getGroupUpDiscoverableCount("p1")).toBe(2);
    expect(getCachedPairUp("u1", "p1")?.id).toBe("feed_snapshot");
    expect(getCachedGroupUpOwn("u1", "p1")?.id).toBe("feed_snapshot");
    const bag = readSocialActionPersistBag("u1");
    expect(bag.duo.p1?.active).toBe(true);
    expect(bag.groupOwn.p1?.active).toBe(true);
    expect(bag.counts.p1?.count).toBe(2);
  });

  it("skips missing snapshot fields (old cache → unknown)", () => {
    seedSocialActionsFromFeedItems([{ id: "p2", type: "hangout" }], "u1");
    expect(getPairUpJoinStatus("p2")).toBe("pending");
    expect(getGroupUpOwnStatus("p2")).toBe("loading");
    expect(getGroupUpDiscoverableCount("p2")).toBeNull();
  });

  it("seeds known inactive without skeleton-forcing pending", () => {
    seedSocialActionsFromFeedItems(
      [
        {
          id: "p3",
          type: "hangout",
          duo_own_active: false,
          group_own_active: false,
          discoverable_group_count: 0,
        },
      ],
      "u1"
    );
    expect(getPairUpJoinStatus("p3")).toBe("idle");
    expect(getGroupUpOwnStatus("p3")).toBe("idle");
    expect(getGroupUpDiscoverableCount("p3")).toBe(0);
  });

  it("does not re-emit identical feed_snapshot / count seeds", () => {
    const item = {
      id: "p4",
      type: "hangout" as const,
      duo_own_active: true,
      group_own_active: true,
      discoverable_group_count: 3,
    };
    seedSocialActionsFromFeedItems([item], "u1");

    const duo = vi.fn();
    const group = vi.fn();
    const count = vi.fn();
    const unsubDuo = subscribePairUpJoinState(duo);
    const unsubGroup = subscribeGroupUpOwnState(group);
    const unsubCount = subscribeGroupUpCount(count);

    seedSocialActionsFromFeedItems([item], "u1");
    expect(duo).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(getPairUpJoinStatus("p4")).toBe("joined");
    expect(getGroupUpOwnStatus("p4")).toBe("active");
    expect(getGroupUpDiscoverableCount("p4")).toBe(3);

    unsubDuo();
    unsubGroup();
    unsubCount();
  });

  it("emits count updates; does not demote known-active duo/group via stale false snapshot", () => {
    seedSocialActionsFromFeedItems(
      [
        {
          id: "p5",
          type: "hangout",
          duo_own_active: true,
          group_own_active: true,
          discoverable_group_count: 1,
        },
      ],
      "u1"
    );

    const duo = vi.fn();
    const group = vi.fn();
    const count = vi.fn();
    const unsubDuo = subscribePairUpJoinState(duo);
    const unsubGroup = subscribeGroupUpOwnState(group);
    const unsubCount = subscribeGroupUpCount(count);

    seedSocialActionsFromFeedItems(
      [
        {
          id: "p5",
          type: "hangout",
          duo_own_active: false,
          group_own_active: false,
          discoverable_group_count: 4,
        },
      ],
      "u1"
    );

    // Stale false must not demote feed_snapshot known-active.
    expect(duo).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalled();
    expect(getPairUpJoinStatus("p5")).toBe("joined");
    expect(getGroupUpOwnStatus("p5")).toBe("active");
    expect(getGroupUpDiscoverableCount("p5")).toBe(4);

    unsubDuo();
    unsubGroup();
    unsubCount();
  });
});
