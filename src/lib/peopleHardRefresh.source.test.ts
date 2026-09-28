/**
 * People hard refresh / pull-to-refresh contracts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bumpPeopleHardRefreshGeneration,
  getPeopleHardRefreshGeneration,
  isPeopleHardRefreshScope,
  resetPeopleHardRefreshForTests,
  runPeopleDeckHardRefresh,
} from "./people/peopleDeckHardRefresh";
import {
  invalidateMatchDeckSessionScopeAfterHardRefresh,
  suspendMatchDeckSession,
  consumeMatchDeckSession,
  emptyMatchDeckScopeSnapshot,
  emptyGroupUpDeckScopeSnapshot,
} from "./matchDeckSession";
import { PEOPLE_DECK_PREFETCH_REMAINING } from "./people/matchDeckNavigation";
import {
  hasPairUpSeenLocalHistory,
  markPairUpOpportunitySeen,
} from "./people/peoplePairUpSeenHistory";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("People hard refresh", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    resetPeopleHardRefreshForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetPeopleHardRefreshForTests();
  });

  it("1–2: Duo hardRefresh replaces; soft merge remains in source", () => {
    const hook = read("hooks/usePairUpCandidates.ts");
    expect(hook).toContain("const hardRefresh = useCallback");
    expect(hook).toMatch(
      /hardRefresh[\s\S]*setCandidates\(uniqueByOpportunityId\(page\.candidates\)\)/
    );
    expect(hook).toContain("mergeMyPlansDeckPage(prev, page.candidates)");
    expect(hook).not.toContain("PEOPLE_TAB_REFRESH_EVENT");
  });

  it("3–5: Discover/Plans/Groups New hard refresh; Yours untouched", () => {
    expect(read("hooks/useOpenPlanCandidates.ts")).toContain("hardRefresh");
    expect(read("hooks/useGroupUpCandidates.ts")).toContain("hardRefresh");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain('kind: "groups_new"');
    expect(overlay).toContain("activeOrderedIdsByTab");
    expect(overlay).toContain("hardRefreshPeopleDeckScope");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).toMatch(
      /if \(browseTab === "new"\) \{[\s\S]*rebuildPairUpActiveOrderedIds/
    );
  });

  it("7–9: refresh does not clear seen; force hydrate used; hydrate fail OK", async () => {
    markPairUpOpportunitySeen("u1", "my_plans", "a");
    expect(hasPairUpSeenLocalHistory("u1", "my_plans")).toBe(true);

    let reset = false;
    const r = await runPeopleDeckHardRefresh({
      userId: "u1",
      scope: "my_plans",
      flushOutbox: async () => {},
      forceHydrateSeen: async () => {
        throw new Error("hydrate offline");
      },
      hardRefreshCandidates: async () => {},
      applyDeckReset: () => {
        reset = true;
      },
      isStillActive: () => true,
    });
    expect(r).toBe("refreshed");
    expect(reset).toBe(true);
    expect(hasPairUpSeenLocalHistory("u1", "my_plans")).toBe(true);

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("forceHydratePeopleDeckSeen");
  });

  it("10–11: candidate failure / both failure keep deck (no reset)", async () => {
    let reset = false;
    const a = await runPeopleDeckHardRefresh({
      userId: "u1",
      scope: "discover",
      flushOutbox: async () => {
        throw new Error("flush");
      },
      forceHydrateSeen: async () => {},
      hardRefreshCandidates: async () => {
        throw new Error("cand");
      },
      applyDeckReset: () => {
        reset = true;
      },
      isStillActive: () => true,
    });
    expect(a).toBe("candidate_failed");
    expect(reset).toBe(false);

    reset = false;
    const b = await runPeopleDeckHardRefresh({
      userId: "u1",
      scope: "open_plans",
      flushOutbox: async () => {},
      forceHydrateSeen: async () => {
        throw new Error("h");
      },
      hardRefreshCandidates: async () => {
        throw new Error("c");
      },
      applyDeckReset: () => {
        reset = true;
      },
      isStillActive: () => true,
    });
    expect(b).toBe("candidate_failed");
    expect(reset).toBe(false);
  });

  it("12–14: first unseen rebuild + all-seen pagination contracts", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("firstUnseenOpportunityId");
    expect(overlay).toContain("allLoadedSeen");
    expect(overlay).toContain("PEOPLE_DECK_PREFETCH_REMAINING");
    expect(PEOPLE_DECK_PREFETCH_REMAINING).toBe(8);
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
  });

  it("15–18: gen invalidates stale; single-flight; stale scope/account", async () => {
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "listGenerationRef"
    );
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "if (gen !== listGenerationRef.current) return"
    );

    let firstStarted = false;
    let firstDone = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const p1 = runPeopleDeckHardRefresh({
      userId: "u1",
      scope: "my_plans",
      flushOutbox: async () => {},
      forceHydrateSeen: async () => {},
      hardRefreshCandidates: async () => {
        firstStarted = true;
        await gate;
        firstDone = true;
      },
      applyDeckReset: () => {},
      isStillActive: () => true,
    });

    await vi.waitFor(() => expect(firstStarted).toBe(true));
    const p2 = runPeopleDeckHardRefresh({
      userId: "u1",
      scope: "my_plans",
      flushOutbox: async () => {},
      forceHydrateSeen: async () => {},
      hardRefreshCandidates: async () => {},
      applyDeckReset: () => {},
      isStillActive: () => true,
    });
    expect(await p2).toBe("busy");
    release();
    expect(await p1).toBe("refreshed");
    expect(firstDone).toBe(true);

    const gen = getPeopleHardRefreshGeneration();
    const stale = runPeopleDeckHardRefresh({
      userId: "alice",
      scope: "discover",
      expectedGeneration: gen,
      flushOutbox: async () => {},
      forceHydrateSeen: async () => {
        bumpPeopleHardRefreshGeneration();
      },
      hardRefreshCandidates: async () => {},
      applyDeckReset: () => {},
      isStillActive: () => true,
    });
    expect(await stale).toBe("stale");

    expect(
      await runPeopleDeckHardRefresh({
        userId: "u1",
        scope: "discover",
        flushOutbox: async () => {},
        forceHydrateSeen: async () => {},
        hardRefreshCandidates: async () => {},
        applyDeckReset: () => {},
        isStillActive: () => false,
      })
    ).toBe("stale");
  });

  it("19–24: PTR reuse + gesture safety source contracts", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("useHomePullToRefresh");
    expect(overlay).toContain("data-people-ptr-surface");
    expect(overlay).toContain("peopleTabsCovered");
    expect(overlay).toContain("acquirePullToRefreshBlock");
    expect(overlay).toContain("PeopleBottomDock");
    // Dock is sibling of ptr surface, not inside it.
    const ptrIdx = overlay.indexOf('data-people-ptr-surface="true"');
    const dockIdx = overlay.indexOf("<PeopleBottomDock");
    expect(ptrIdx).toBeGreaterThan(-1);
    expect(dockIdx).toBeGreaterThan(ptrIdx);

    const ptr = read("hooks/useHomePullToRefresh.ts");
    expect(ptr).toContain("COMMIT_DAMPED_PX = 52");
    expect(ptr).toContain("MIN_INTERVAL_MS = 1400");
    expect(ptr).toContain("Math.abs(dx) > dy");

    const carousel = read("pages/people/MatchDeckCarousel.tsx");
    expect(carousel).toContain("acquirePullToRefreshBlock");
    expect(carousel).toContain("pointerDown");
  });

  it("25–26: tab retap hard refresh; Groups Yours excluded", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("PEOPLE_TAB_REFRESH_EVENT");
    expect(overlay).toContain("hardRefreshPeopleDeckScope");
    expect(overlay).toContain('browseTab === "yours"');
    expect(overlay).toContain("hydrateSeenScope");
    expect(isPeopleHardRefreshScope("groups_yours")).toBe(false);
    expect(isPeopleHardRefreshScope("groups_new")).toBe(true);
    // PTR disabled when hydrateSeenScope is null (Groups Yours).
    expect(overlay).toContain("Boolean(hydrateSeenScope)");
  });

  it("27: stale session cannot restore pre-refresh state", () => {
    suspendMatchDeckSession({
      mode: "p2p",
      activeScope: "my_plans",
      scopes: {
        my_plans: {
          ...emptyMatchDeckScopeSnapshot(),
          currentOpportunityId: "old",
          activeOrderedIds: ["old", "x"],
        },
        discover: emptyMatchDeckScopeSnapshot(),
        open_plans: emptyMatchDeckScopeSnapshot(),
      },
      groupUp: {
        ...emptyGroupUpDeckScopeSnapshot(),
        currentOpportunityIdByTab: { new: "g-old", yours: "y-keep" },
        activeOrderedIdsByTab: { new: ["g-old"], yours: ["y-keep"] },
      },
    });
    invalidateMatchDeckSessionScopeAfterHardRefresh({
      kind: "pairUp",
      scope: "my_plans",
    });
    invalidateMatchDeckSessionScopeAfterHardRefresh({ kind: "groups_new" });
    const snap = consumeMatchDeckSession();
    expect(snap?.scopes.my_plans.currentOpportunityId).toBeNull();
    expect(snap?.scopes.my_plans.activeOrderedIds).toEqual([]);
    expect(snap?.groupUp?.currentOpportunityIdByTab.new).toBeNull();
    expect(snap?.groupUp?.activeOrderedIdsByTab.new).toEqual([]);
    expect(snap?.groupUp?.currentOpportunityIdByTab.yours).toBe("y-keep");
    expect(snap?.groupUp?.activeOrderedIdsByTab.yours).toEqual(["y-keep"]);
  });

  it("28–30: prefetch 8; page 20; DB/RPC untouched", () => {
    expect(PEOPLE_DECK_PREFETCH_REMAINING).toBe(8);
    expect(read("hooks/useOpenPlanCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useGroupUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    const mig = read(
      "../supabase/migrations/20260928140000_people_deck_seen.sql"
    );
    expect(mig).toContain("people_deck_seen");
    expect(read("pages/people/MatchDeckOverlay.tsx")).not.toContain(
      "list_pair_up_candidates"
    );
  });
});
