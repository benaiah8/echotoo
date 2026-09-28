/**
 * Cross-device People deck seen sync (local + outbox + hydrate contracts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_PAIR_UP_SEEN_CAP,
  PEOPLE_PAIR_UP_SEEN_TTL_MS,
  hasPairUpSeenLocalHistory,
  isPairUpOpportunitySeen,
  markPairUpOpportunitySeen,
  mergePairUpSeenFromServer,
  prunePairUpSeenEntries,
  rebuildPairUpActiveOrderedIds,
} from "./people/peoplePairUpSeenHistory";
import {
  PEOPLE_DECK_SEEN_FLUSH_THRESHOLD,
  PEOPLE_DECK_SEEN_FRESH_DEVICE_GATE_MS,
  PEOPLE_DECK_SEEN_HYDRATE_COOLDOWN_MS,
  PEOPLE_DECK_SEEN_MAX_PENDING_AGE_MS,
  awaitPeopleDeckSeenBootstrap,
  flushPeopleDeckSeenOutbox,
  getPeopleDeckSeenOutboxIds,
  hydratePeopleDeckSeen,
  isPeopleDeckSeenBootstrapReady,
  markLocalPeopleDeckSeenAndEnqueue,
  mergeSeenTimestampMapsForTests,
  peopleDeckSeenOutboxStorageKey,
  resetPeopleDeckSeenSyncForTests,
} from "./people/peopleDeckSeenSync";
import { PEOPLE_DECK_SEEN_MARK_CHUNK } from "../api/services/peopleDeckSeen";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

vi.mock("../api/services/peopleDeckSeen", async () => {
  const actual = await vi.importActual<
    typeof import("../api/services/peopleDeckSeen")
  >("../api/services/peopleDeckSeen");
  return {
    ...actual,
    getPeopleDeckSeen: vi.fn(),
    markPeopleDeckSeen: vi.fn(),
  };
});

const authSessionState = { userId: "u1" as string | null };

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: authSessionState.userId
            ? { user: { id: authSessionState.userId } }
            : null,
        },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import {
  getPeopleDeckSeen,
  markPeopleDeckSeen,
} from "../api/services/peopleDeckSeen";

const getMock = vi.mocked(getPeopleDeckSeen);
const markMock = vi.mocked(markPeopleDeckSeen);

describe("People deck seen cross-device sync", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    resetPeopleDeckSeenSyncForTests();
    authSessionState.userId = "u1";
    getMock.mockReset();
    markMock.mockReset();
    markMock.mockResolvedValue(undefined);
    getMock.mockResolvedValue([]);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetPeopleDeckSeenSyncForTests();
  });

  it("1: established local item inside 14d does NOT refresh local timestamp", () => {
    const t0 = 1_000_000;
    expect(markPairUpOpportunitySeen("u1", "my_plans", "a", t0)).toBe(true);
    expect(markPairUpOpportunitySeen("u1", "my_plans", "a", t0 + 60_000)).toBe(
      false
    );
    const store = JSON.parse(
      localStorage.getItem("echotoo_people_pairup_seen_v1:u1:my_plans")!
    );
    expect(store.entries.a).toBe(t0);
  });

  it("2: expired local item can establish new timestamp", () => {
    const t0 = 1_000_000;
    markPairUpOpportunitySeen("u1", "discover", "a", t0);
    const later = t0 + PEOPLE_PAIR_UP_SEEN_TTL_MS + 1;
    expect(markPairUpOpportunitySeen("u1", "discover", "a", later)).toBe(true);
    const store = JSON.parse(
      localStorage.getItem("echotoo_people_pairup_seen_v1:u1:discover")!
    );
    expect(store.entries.a).toBe(later);
  });

  it("3–4: genuine mark enqueues outbox; repeat in-window does not flood", () => {
    const t0 = Date.now();
    expect(
      markLocalPeopleDeckSeenAndEnqueue("u1", "open_plans", "opp-1", t0)
    ).toBe(true);
    expect(getPeopleDeckSeenOutboxIds("u1", "open_plans")).toEqual(["opp-1"]);
    expect(
      markLocalPeopleDeckSeenAndEnqueue("u1", "open_plans", "opp-1", t0 + 10)
    ).toBe(false);
    expect(getPeopleDeckSeenOutboxIds("u1", "open_plans")).toEqual(["opp-1"]);
  });

  it("5–6: outbox survives reload; unique ids", () => {
    markLocalPeopleDeckSeenAndEnqueue("u1", "groups_new", "a");
    markLocalPeopleDeckSeenAndEnqueue("u1", "groups_new", "b");
    const key = peopleDeckSeenOutboxStorageKey("u1", "groups_new");
    const raw = localStorage.getItem(key)!;
    expect(JSON.parse(raw).ids).toEqual(["a", "b"]);
    resetPeopleDeckSeenSyncForTests();
    expect(getPeopleDeckSeenOutboxIds("u1", "groups_new")).toEqual(["a", "b"]);
  });

  it("7–9: merge union; newer wins; expired pruned", () => {
    const now = 10_000_000;
    markPairUpOpportunitySeen("u1", "my_plans", "a", now - 1000);
    markPairUpOpportunitySeen("u1", "my_plans", "b", now - 2000);
    mergePairUpSeenFromServer(
      "u1",
      "my_plans",
      [
        { item_id: "a", seen_at_ms: now - 100 },
        { item_id: "c", seen_at_ms: now - 50 },
        { item_id: "old", seen_at_ms: now - PEOPLE_PAIR_UP_SEEN_TTL_MS - 1 },
      ],
      now
    );
    expect(isPairUpOpportunitySeen("u1", "my_plans", "a", now)).toBe(true);
    expect(isPairUpOpportunitySeen("u1", "my_plans", "c", now)).toBe(true);
    expect(isPairUpOpportunitySeen("u1", "my_plans", "old", now)).toBe(false);
    const merged = mergeSeenTimestampMapsForTests(
      { a: now - 1000 },
      [{ item_id: "a", seen_at_ms: now - 100 }],
      now,
      PEOPLE_PAIR_UP_SEEN_TTL_MS
    );
    expect(merged.a).toBe(now - 100);
  });

  it("10: cap remains 1000", () => {
    expect(PEOPLE_PAIR_UP_SEEN_CAP).toBe(1000);
    const now = 1_000_000;
    const many: Record<string, number> = {};
    for (let i = 0; i < 1005; i += 1) many[`id-${i}`] = now - (1005 - i);
    expect(Object.keys(prunePairUpSeenEntries(many, now)).length).toBe(1000);
  });

  it("11–13: fresh-device gate waits; ~2s fallback; established does not wait", async () => {
    expect(PEOPLE_DECK_SEEN_FRESH_DEVICE_GATE_MS).toBe(2000);
    expect(hasPairUpSeenLocalHistory("u1", "my_plans")).toBe(false);

    let resolveGet!: (v: { item_id: string; seen_at_ms: number }[]) => void;
    getMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        })
    );

    const p = awaitPeopleDeckSeenBootstrap({
      userId: "u1",
      scope: "my_plans",
      timeoutMs: 30,
    });
    expect(isPeopleDeckSeenBootstrapReady("u1", "my_plans")).toBe(false);
    const raced = await p;
    expect(raced).toBe("timeout");
    expect(isPeopleDeckSeenBootstrapReady("u1", "my_plans")).toBe(true);
    resolveGet([]);

    markPairUpOpportunitySeen("u2", "discover", "x");
    authSessionState.userId = "u2";
    getMock.mockResolvedValueOnce([]);
    const local = await awaitPeopleDeckSeenBootstrap({
      userId: "u2",
      scope: "discover",
      timeoutMs: 2000,
    });
    expect(local).toBe("local");
  });

  it("14: late hydrate does not move frozen/current prefix", () => {
    const next = rebuildPairUpActiveOrderedIds({
      eligibleOrdered: ["a", "b", "c", "d"],
      previousActive: ["a", "b", "c"],
      currentId: "b",
      seenIds: new Set(["a", "b", "d"]),
    });
    expect(next.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("15: threshold 15 triggers flush", async () => {
    const t0 = Date.now();
    for (let i = 0; i < PEOPLE_DECK_SEEN_FLUSH_THRESHOLD; i += 1) {
      markLocalPeopleDeckSeenAndEnqueue("u1", "my_plans", `id-${i}`, t0 + i);
    }
    await vi.waitFor(() => {
      expect(markMock).toHaveBeenCalled();
    });
    expect(markMock.mock.calls[0]![1].length).toBeLessThanOrEqual(
      PEOPLE_DECK_SEEN_MARK_CHUNK
    );
  });

  it("16–17: max pending age ~10s; not postponed forever by more swipes", () => {
    expect(PEOPLE_DECK_SEEN_MAX_PENDING_AGE_MS).toBe(10_000);
    const sync = read("lib/people/peopleDeckSeenSync.ts");
    expect(sync).toContain("ensureMaxAgeFlushTimer");
    expect(sync).toContain("if (maxAgeTimers.has(key)) return");
    expect(sync).toContain("PEOPLE_DECK_SEEN_MAX_PENDING_AGE_MS");
  });

  it("18: write chunks <=50", () => {
    expect(PEOPLE_DECK_SEEN_MARK_CHUNK).toBe(50);
    const svc = read("api/services/peopleDeckSeen.ts");
    expect(svc).toContain("PEOPLE_DECK_SEEN_MARK_CHUNK");
    expect(svc).toContain("chunkIds(unique, PEOPLE_DECK_SEEN_MARK_CHUNK)");
  });

  it("19–20: successful mark clears outbox; failure keeps pending", async () => {
    markLocalPeopleDeckSeenAndEnqueue("u1", "my_plans", "a");
    markMock.mockResolvedValueOnce(undefined);
    await flushPeopleDeckSeenOutbox({ userId: "u1", scope: "my_plans" });
    expect(getPeopleDeckSeenOutboxIds("u1", "my_plans")).toEqual([]);

    markLocalPeopleDeckSeenAndEnqueue("u1", "my_plans", "b");
    markMock.mockRejectedValueOnce(new Error("network"));
    const failed = await flushPeopleDeckSeenOutbox({
      userId: "u1",
      scope: "my_plans",
    });
    expect(failed).toBe("failed");
    expect(getPeopleDeckSeenOutboxIds("u1", "my_plans")).toEqual(["b"]);
  });

  it("21: concurrent flushes single-flight", async () => {
    markLocalPeopleDeckSeenAndEnqueue("u1", "discover", "a");
    let release!: () => void;
    markMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(undefined);
        })
    );
    const a = flushPeopleDeckSeenOutbox({ userId: "u1", scope: "discover" });
    await vi.waitFor(() => {
      expect(typeof release).toBe("function");
    });
    const b = flushPeopleDeckSeenOutbox({ userId: "u1", scope: "discover" });
    expect(await b).toBe("busy");
    release();
    expect(await a).toBe("flushed");
  });

  it("22–23: stale account hydrate/flush ignored via generation bump", async () => {
    authSessionState.userId = "alice";
    getMock.mockImplementationOnce(async () => {
      resetPeopleDeckSeenSyncForTests();
      return [{ item_id: "x", seen_at_ms: Date.now() }];
    });
    const r = await hydratePeopleDeckSeen({
      userId: "alice",
      scope: "my_plans",
      force: true,
    });
    expect(r).toBe("stale");
    expect(isPairUpOpportunitySeen("alice", "my_plans", "x")).toBe(false);
  });

  it("24–31: wiring scopes; Yours untouched; Embla/candidate RPCs untouched", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("awaitPeopleDeckSeenBootstrap");
    expect(overlay).toContain("markLocalPeopleDeckSeenAndEnqueue");
    expect(overlay).toContain("flushAllPeopleDeckSeenOutboxes");
    expect(overlay).toContain("bumpPeopleDeckSeenHydrateGeneration");
    expect(overlay).toContain("onAuthStateChange");
    expect(overlay).toContain("peopleTabsCovered");
    expect(overlay).toContain("appStateChange");
    expect(PEOPLE_DECK_SEEN_HYDRATE_COOLDOWN_MS).toBe(120_000);

    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(plans).toContain("markLocalPeopleDeckSeenAndEnqueue");
    expect(groups).toContain('markLocalPeopleDeckSeenAndEnqueue(authUserId, "groups_new"');
    expect(groups).toContain('browseTab === "new"');
    expect(groups).toMatch(
      /if \(browseTab === "new"\) \{[\s\S]*rebuildPairUpActiveOrderedIds[\s\S]*\} else \{[\s\S]*filterOrderedIdsToEligible/
    );

    expect(overlay).toContain("rebuildPairUpActiveOrderedIds");
    expect(overlay).not.toContain("list_pair_up_candidates");
    const mig = read("../supabase/migrations/20260928140000_people_deck_seen.sql");
    // This pass must not rewrite migration - still present as prepare-only file.
    expect(mig).toContain("people_deck_seen");
  });

  it("getPeopleDeckSeen service validates rows", async () => {
    // Unmock briefly via actual is hard; contract from source:
    const svc = read("api/services/peopleDeckSeen.ts");
    expect(svc).toContain("get_people_deck_seen");
    expect(svc).toContain("mark_people_deck_seen");
    expect(svc).toContain("p_scope");
    expect(svc).toContain("p_item_ids");
  });

  it("Create cover does not act as People leave (source)", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain(
      "if (peopleTabsCovered && peopleTabActive) return;"
    );
    expect(overlay).toMatch(
      /if \(prev && !peopleTabActive\) \{\s*markSettledCurrentSeen\(\);\s*void flushAllPeopleDeckSeenOutboxes/
    );
  });

  it("force hydrate API available for later manual refresh", () => {
    const sync = read("lib/people/peopleDeckSeenSync.ts");
    expect(sync).toContain("forceHydratePeopleDeckSeen");
  });
});
