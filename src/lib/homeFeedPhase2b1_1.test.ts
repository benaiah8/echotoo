import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
import { isHangoutDiscoveryEligible } from "./feedExpiryFilters";
import type { FeedItemWithDates } from "./feedSorting";
import {
  cachedFeedPageSlice,
  inferHasMoreAfterPage,
  nextFeedOffset,
  rpcConsumedOffset,
  simulateAuthoritativeFeedPass,
} from "./homeFeedPagination";
import {
  HOME_FEED_DISPLAY_CACHE_KEY_PREFIX,
  homeFeedDisplayCacheKey,
  isHomeFeedRpcCacheKey,
  readHomeFeedHydrationSnapshot,
  writeHomeFeedDisplaySnapshot,
} from "./homeFeedListCache";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

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

describe("Home Feed Phase 2B.1.1 pagination contract", () => {
  it("1. RPC 15 rows / display 12: consumedOffset = 15", () => {
    expect(rpcConsumedOffset(15, 15)).toBe(15);
  });

  it("2. offset 30 + RPC 15 / display 12: next offset = 45", () => {
    const displayed = 12;
    const consumed = rpcConsumedOffset(15, 15);
    expect(consumed).not.toBe(displayed);
    expect(nextFeedOffset(30, consumed)).toBe(45);
    expect(nextFeedOffset(30, consumed)).not.toBe(30 + displayed);
  });

  it("3. authoritative count 179, nextOffset 45: hasMore true", () => {
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 15,
        requestedLimit: 15,
        nextOffset: 45,
        count: 179,
        countIsAuthoritative: true,
      })
    ).toBe(true);
  });

  it("4. authoritative count 179, displayed 0, backend consumed > 0: hasMore true", () => {
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 15,
        requestedLimit: 15,
        nextOffset: 45,
        count: 179,
        countIsAuthoritative: true,
      })
    ).toBe(true);
  });

  it("5. nextOffset >= 179: hasMore false", () => {
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 14,
        requestedLimit: 15,
        nextOffset: 179,
        count: 179,
        countIsAuthoritative: true,
      })
    ).toBe(false);
  });

  it("6. cached 45-item snapshot is not backend total 45", () => {
    const snapshot = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}` }));
    const page = cachedFeedPageSlice(snapshot, 15);
    expect(page.pageItems).toHaveLength(15);
    expect(page.consumedOffset).toBe(15);
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 45,
        requestedLimit: 15,
        nextOffset: 45,
        count: 45,
        countIsAuthoritative: false,
      })
    ).toBe(true);
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: page.consumedOffset,
        requestedLimit: 15,
        nextOffset: 15,
        count: 45,
        countIsAuthoritative: false,
      })
    ).toBe(true);
  });

  it("7. cached first-page hydration can still continue loading", () => {
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: HOME_FEED_FIRST_PAGE,
        requestedLimit: HOME_FEED_FIRST_PAGE,
        nextOffset: HOME_FEED_FIRST_PAGE,
        count: HOME_FEED_FIRST_PAGE,
        countIsAuthoritative: false,
      })
    ).toBe(true);
  });
});

describe("Home Feed Phase 2B.1.1 display vs RPC cache", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("8. accumulated list does not overwrite the RPC first-page key", () => {
    const rpcKey = "feed:all:::15:0:::::viewer";
    expect(isHomeFeedRpcCacheKey(rpcKey)).toBe(true);
    const written = new Map<string, unknown[]>();
    const accumulated = Array.from({ length: 45 }, (_, i) => ({
      id: `post-${i}`,
    })) as never;
    writeHomeFeedDisplaySnapshot(rpcKey, accumulated, (key, value) => {
      written.set(key, value as unknown[]);
    });
    expect(written.has(rpcKey)).toBe(false);
    expect(written.has(homeFeedDisplayCacheKey(rpcKey))).toBe(true);
    // Phase 2B.2B: display/persist snapshots stay first-page bounded (newest slice).
    expect(written.get(homeFeedDisplayCacheKey(rpcKey))).toHaveLength(
      HOME_FEED_FIRST_PAGE
    );
    expect(
      (written.get(homeFeedDisplayCacheKey(rpcKey)) as { id: string }[]).map(
        (r) => r.id
      )
    ).toEqual(
      Array.from({ length: HOME_FEED_FIRST_PAGE }, (_, i) => `post-${30 + i}`)
    );
    expect(homeFeedDisplayCacheKey(rpcKey).startsWith(HOME_FEED_DISPLAY_CACHE_KEY_PREFIX)).toBe(
      true
    );

    const memory = new Map<string, unknown[]>(written);
    const hydrate = readHomeFeedHydrationSnapshot(rpcKey, (key) => {
      const rows = memory.get(key);
      return Array.isArray(rows) ? (rows as never) : null;
    });
    expect(hydrate?.source).toBe("display");
    expect(hydrate?.items).toHaveLength(HOME_FEED_FIRST_PAGE);
  });

  it("7b. bloated RPC first-page fallback is capped so loading can continue", () => {
    const rpcKey = "feed:all:::15:0:::::viewer";
    const bloated = Array.from({ length: 45 }, (_, i) => ({
      id: `old-${i}`,
    })) as never;
    const hydrate = readHomeFeedHydrationSnapshot(rpcKey, (key) =>
      key === rpcKey ? bloated : null
    );
    expect(hydrate?.source).toBe("rpc-first-page");
    expect(hydrate?.items).toHaveLength(HOME_FEED_FIRST_PAGE);
  });
});

describe("Home Feed Phase 2B.1.1 one pass", () => {
  it("9-10. 0/15/30/... reaches 179 without under-advance duplicates; Places continue", () => {
    const pageSize = 15;
    const trueTotal = 179;
    const pages = [];
    for (let offset = 0; offset < trueTotal; offset += pageSize) {
      const rawCount = Math.min(pageSize, trueTotal - offset);
      const rawIds = Array.from({ length: rawCount }, (_, i) => `id-${offset + i}`);
      const displayIds =
        offset === 90
          ? rawIds.filter((id) => id !== "id-98" && id !== "id-99" && id !== "id-100")
          : rawIds;
      const types = rawIds.map((_, i) => {
        const rank = offset + i;
        if (rank < 15) return "hangout";
        if (rank < 30) return i < 12 ? "hangout" : "experience";
        return rank >= 120 ? "experience" : i % 3 === 0 ? "hangout" : "experience";
      });
      pages.push({
        offset,
        rawIds,
        displayIds,
        types,
      });
    }

    const pass = simulateAuthoritativeFeedPass({
      pages,
      pageSize,
      trueTotal,
    });

    expect(pass.requestedOffsets[0]).toBe(0);
    expect(pass.requestedOffsets[1]).toBe(15);
    expect(pass.requestedOffsets[2]).toBe(30);
    expect(pass.requestedOffsets).toContain(90);
    expect(pass.requestedOffsets[pass.requestedOffsets.length - 1]).toBe(165);
    expect(pass.finalOffset).toBe(179);
    expect(pass.exhausted).toBe(true);
    expect(pass.duplicateShownIds).toEqual([]);
    expect(pass.shownIds).toHaveLength(trueTotal - 3);
    expect(new Set(pass.shownIds).size).toBe(pass.shownIds.length);

    const placePages = pages.filter((p) => p.offset >= 30);
    expect(placePages.every((p) => p.types.some((t) => t === "experience"))).toBe(
      true
    );
  });

  it("11. filtered finite feed still stops at authoritative count", () => {
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 8,
        requestedLimit: 15,
        nextOffset: 8,
        count: 8,
        countIsAuthoritative: true,
      })
    ).toBe(false);
    expect(
      inferHasMoreAfterPage({
        consumedOffsetThisPage: 15,
        requestedLimit: 15,
        nextOffset: 15,
        count: 52,
        countIsAuthoritative: true,
      })
    ).toBe(true);
  });

  it("12. no past-Event fallback: recurring flag without days stays ineligible", () => {
    const pastHangout = {
      id: "h1",
      type: "hangout",
      created_at: "2026-01-01T00:00:00.000Z",
      selected_dates: ["2020-01-01T00:00:00.000Z"],
      is_recurring: true,
      recurrence_days: [],
    } as unknown as FeedItemWithDates;
    expect(
      isHangoutDiscoveryEligible(
        pastHangout,
        new Date("2026-09-10T09:00:00.000Z"),
        "Africa/Addis_Ababa"
      )
    ).toBe(false);
  });

  it("13. one post = one card during one feed pass", () => {
    const pass = simulateAuthoritativeFeedPass({
      pageSize: 15,
      trueTotal: 30,
      pages: [
        {
          offset: 0,
          rawIds: Array.from({ length: 15 }, (_, i) => `a${i}`),
          displayIds: Array.from({ length: 15 }, (_, i) => `a${i}`),
        },
        {
          offset: 15,
          rawIds: Array.from({ length: 15 }, (_, i) => `b${i}`),
          displayIds: Array.from({ length: 15 }, (_, i) => `b${i}`),
        },
      ],
    });
    expect(pass.shownIds).toHaveLength(30);
    expect(new Set(pass.shownIds).size).toBe(30);
    expect(pass.duplicateShownIds).toEqual([]);
  });
});

describe("Home Feed Phase 2B.1.1 source guards", () => {
  it("network consumedOffset uses raw RPC length, not filtered display length", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("rpcConsumedOffset(result.posts.length, limit)");
    expect(feed).not.toMatch(
      /consumedOffset:\s*finalData\.length/
    );
    expect(feed).toContain("countIsAuthoritative: false");
    expect(feed).toContain("cachedFeedPageSlice");
  });

  it("ProgressiveFeed uses authoritative inferHasMoreAfterPage", () => {
    const pf = read("src/components/ProgressiveFeed.tsx");
    expect(pf).toContain('from "../lib/homeFeedPagination"');
    expect(pf).toContain("countIsAuthoritative");
    expect(pf).not.toContain("if (consumedOffsetThisPage === 0) return false");
  });

  it("Home display snapshot is separated from RPC first-page cache", () => {
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("writeHomeFeedDisplaySnapshot");
    expect(home).toContain("readHomeFeedHydrationSnapshot");
    expect(home).toContain(
      "writeHomeFeedDisplaySnapshot(cacheKey, items, (key, value, ttlMs) =>"
    );
  });

  it("does not add recycle cycles or recently-shown", () => {
    const pag = read("src/lib/homeFeedPagination.ts");
    expect(pag).not.toContain("recentlyShown");
    expect(pag).not.toContain("recycle");
    expect(read("src/components/ProgressiveFeed.tsx")).not.toContain(
      "cycleFeed"
    );
  });
});
