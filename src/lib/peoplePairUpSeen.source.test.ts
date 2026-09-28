/**
 * People unseen-first browsing (Duo / Discover / Plans / Groups New).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_PAIR_UP_SEEN_CAP,
  PEOPLE_PAIR_UP_SEEN_TTL_MS,
  firstUnseenOpportunityId,
  getPairUpSeenOpportunityIdSet,
  isPairUpOpportunitySeen,
  markPairUpOpportunitySeen,
  pairUpSeenStorageKey,
  partitionOpportunityIdsUnseenFirst,
  prunePairUpSeenEntries,
  rebuildPairUpActiveOrderedIds,
} from "./people/peoplePairUpSeenHistory";
import { PEOPLE_DECK_PREFETCH_REMAINING } from "./people/matchDeckNavigation";
import {
  PEOPLE_MINE_FRONT_SHADOW,
  PEOPLE_MINE_PHOTO_EDGE,
  PEOPLE_MINE_UNSEEN_FRONT_SHADOW,
  PEOPLE_MINE_UNSEEN_PHOTO_EDGE,
} from "./people/peopleCandidateMediaPresentation";
import { groupUpDeckRowId } from "./groupUpDeckRowId";

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

describe("People unseen-first browsing (Duo/Discover/Plans/Groups New)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("1–4: leave marks settled current for Duo / Discover / Plans / Groups New", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("markSettledCurrentSeen");
    expect(overlay).toContain("markSettledCurrentSeenForIdentity");
    expect(overlay).toContain('identity === "my_plans"');
    expect(overlay).toContain('identity === "discover"');
    expect(overlay).toContain('identity === "open_plans"');
    expect(overlay).toContain('identity === "groups_new"');
    expect(overlay).toContain("suspendDeckSession");
    expect(overlay).toMatch(
      /const suspendDeckSession = useCallback\(\(\) => \{\s*markSettledCurrentSeen\(\);/
    );
    expect(overlay).toContain("peopleShellActiveTab");
    expect(overlay).toContain('peopleShellActiveTab === "people"');
    expect(overlay).toContain("useTabVisibility");

    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    expect(plans).toContain(
      'markLocalPeopleDeckSeenAndEnqueue(authUserId, "open_plans"'
    );
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).toContain(
      'markLocalPeopleDeckSeenAndEnqueue(authUserId, "groups_new"'
    );
  });

  it("5: Create cover alone does not mark seen", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const tab = read("router/PersistentTabContainer.new.tsx");
    expect(tab).toContain("useTabVisibility");
    expect(tab).toContain("covered");
    // Leave mark keys off activeTab !== people — Create keeps activeTab people.
    expect(overlay).toContain("peopleTabsCovered");
    expect(overlay).toContain("prevPeopleTabActiveRef");
    expect(overlay).toContain(
      "if (peopleTabsCovered && peopleTabActive) return;"
    );
    expect(overlay).toMatch(
      /if \(prev && !peopleTabActive\) \{\s*markSettledCurrentSeen\(\);/
    );
  });

  it("6: partial/aborted swipe does not mark seen (ownership-only)", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toMatch(
      /previousId &&\s*id &&\s*previousId !== id/
    );
    expect(overlay).not.toContain("onPointerMove");
    expect(overlay).not.toContain("dragProgress");
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    expect(plans).toMatch(
      /previousId && id && previousId !== id/
    );
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).toMatch(
      /previousId &&\s*id &&\s*previousId !== id/
    );
  });

  it("7: live deck return preserves current/index (no reshuffle under user)", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    // Live React scopeState survives tab hide; rebuild freezes prefix.
    expect(overlay).toContain("rebuildPairUpActiveOrderedIds");
    expect(overlay).toContain("previousActive");
    const next = rebuildPairUpActiveOrderedIds({
      eligibleOrdered: ["a", "b", "c", "d"],
      previousActive: ["a", "b", "c"],
      currentId: "b",
      seenIds: new Set(["a", "b"]),
    });
    expect(next.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("8: fresh session restore preserves frozen window", () => {
    const next = rebuildPairUpActiveOrderedIds({
      eligibleOrdered: ["x", "y", "z"],
      previousActive: ["y", "z"],
      currentId: "y",
      seenIds: new Set(["z"]),
    });
    expect(next[0]).toBe("y");
    expect(next.slice(0, 1)).toEqual(["y"]);
  });

  it("9: cold rebuild starts with first unseen", () => {
    const ordered = rebuildPairUpActiveOrderedIds({
      eligibleOrdered: ["a", "b", "c"],
      previousActive: [],
      currentId: null,
      seenIds: new Set(["a"]),
    });
    expect(ordered).toEqual(["b", "c", "a"]);
    expect(firstUnseenOpportunityId(ordered, new Set(["a"]))).toBe("b");
  });

  it("10: unseen orders before seen", () => {
    const seen = new Set(["c", "a"]);
    expect(partitionOpportunityIdsUnseenFirst(["a", "b", "c", "d"], seen)).toEqual(
      ["b", "d", "a", "c"]
    );
  });

  it("11: frozen prefix never reorders", () => {
    const seen = new Set(["a", "d"]);
    const next = rebuildPairUpActiveOrderedIds({
      eligibleOrdered: ["a", "b", "c", "d", "e"],
      previousActive: ["a", "b", "c", "d"],
      currentId: "b",
      seenIds: seen,
    });
    expect(next.slice(0, 2)).toEqual(["a", "b"]);
    expect(next.slice(2)).toEqual(["c", "e", "d"]);
  });

  it("12–13: hasMore loads before seen recycle; recycle only after hasMore=false", () => {
    for (const rel of [
      "pages/people/MatchDeckOverlay.tsx",
      "pages/people/OpenPlanDeckBody.tsx",
      "pages/people/GroupUpDeckBody.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("allLoadedSeen");
      expect(src).toContain("!hasMore");
      expect(src).toContain("PEOPLE_DECK_PREFETCH_REMAINING");
    }
  });

  it("14: Plans uses opportunity_id", () => {
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    expect(plans).toContain('getPairUpSeenOpportunityIdSet(authUserId, "open_plans")');
    expect(plans).toContain("row.opportunity_id");
    expect(plans).toContain("isUnseen={!plansSeenIds.has(row.opportunity_id)}");
    markPairUpOpportunitySeen("u1", "open_plans", "opp-plan-1");
    expect(isPairUpOpportunitySeen("u1", "open_plans", "opp-plan-1")).toBe(true);
    expect(pairUpSeenStorageKey("u1", "open_plans")).toBe(
      "echotoo_people_pairup_seen_v1:u1:open_plans"
    );
  });

  it("15: Groups New uses groupUpDeckRowId", () => {
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).toContain("groupUpDeckRowId");
    expect(groups).toContain('getPairUpSeenOpportunityIdSet(authUserId, "groups_new")');
    expect(groups).toContain("browseTab === \"new\"");
    expect(groupUpDeckRowId({ opportunity_id: "o1", conversation_id: "c1" })).toBe(
      "o1"
    );
    expect(
      groupUpDeckRowId({ opportunity_id: null, conversation_id: "c-fallback" })
    ).toBe("c-fallback");
    markPairUpOpportunitySeen("u1", "groups_new", "deck-row-1");
    expect(isPairUpOpportunitySeen("u1", "groups_new", "deck-row-1")).toBe(true);
  });

  it("16: Groups Yours is untouched by seen browsing", () => {
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).toContain('browseTab === "new"');
    expect(groups).toContain("Groups New only");
    expect(groups).toContain("filterOrderedIdsToEligible");
    // Seen rebuild is gated to New; Yours keeps append-only path.
    expect(groups).toMatch(
      /if \(browseTab === "new"\) \{[\s\S]*rebuildPairUpActiveOrderedIds[\s\S]*\} else \{[\s\S]*filterOrderedIdsToEligible/
    );
    expect(groups).not.toContain('"groups_yours"');
    const hist = read("lib/people/peoplePairUpSeenHistory.ts");
    expect(hist).not.toContain("groups_yours");
    // Mark-on-nav only for New
    expect(groups).toMatch(
      /browseTab === "new" &&\s*authUserId &&\s*previousId/
    );
  });

  it("17: storage remains account-scoped / 14d / cap 1000", () => {
    expect(PEOPLE_PAIR_UP_SEEN_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(PEOPLE_PAIR_UP_SEEN_CAP).toBe(1000);
    markPairUpOpportunitySeen("alice", "my_plans", "opp-1");
    markPairUpOpportunitySeen("bob", "my_plans", "opp-1");
    expect(pairUpSeenStorageKey("alice", "my_plans")).toBe(
      "echotoo_people_pairup_seen_v1:alice:my_plans"
    );
    expect(pairUpSeenStorageKey("bob", "my_plans")).not.toBe(
      pairUpSeenStorageKey("alice", "my_plans")
    );
    expect(isPairUpOpportunitySeen("alice", "discover", "opp-1")).toBe(false);

    const now = 1_000_000;
    const expired = prunePairUpSeenEntries(
      { old: now - PEOPLE_PAIR_UP_SEEN_TTL_MS - 1, fresh: now },
      now
    );
    expect(expired.old).toBeUndefined();
    expect(expired.fresh).toBe(now);

    const many: Record<string, number> = {};
    for (let i = 0; i < 1005; i += 1) {
      many[`id-${i}`] = now - (1005 - i);
    }
    const capped = prunePairUpSeenEntries(many, now);
    expect(Object.keys(capped).length).toBe(1000);
    expect(capped["id-0"]).toBeUndefined();
    expect(capped["id-1004"]).toBeDefined();

    const app = read("App.tsx");
    expect(app).not.toContain("peoplePairUpSeenHistory");
    expect(app).not.toContain("echotoo_people_pairup_seen_v1");
  });

  it("18: no DB/RPC changes in this pass", () => {
    const hist = read("lib/people/peoplePairUpSeenHistory.ts");
    expect(hist).toContain("localStorage");
    expect(hist).not.toContain("supabase");
    expect(hist).not.toContain(".rpc(");
    expect(hist).toContain('"open_plans"');
    expect(hist).toContain('"groups_new"');
  });

  it("19–20: prefetch remains 8; page size remains 20", () => {
    expect(PEOPLE_DECK_PREFETCH_REMAINING).toBe(8);
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useOpenPlanCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useGroupUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
  });

  it("overlay marks Duo/Discover on goToIndex ownership change", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("markLocalPeopleDeckSeenAndEnqueue");
    expect(overlay).toMatch(
      /const goToIndex = useCallback\([\s\S]*markLocalPeopleDeckSeenAndEnqueue/
    );
    expect(overlay).toContain("visitedIds: [...scopeSnap.visitedIds, id]");
  });

  it("Plans/Groups New wire isUnseen visual tokens", () => {
    expect(PEOPLE_MINE_UNSEEN_PHOTO_EDGE).toContain("linear-gradient");
    expect(PEOPLE_MINE_UNSEEN_PHOTO_EDGE).toContain("#2563EB");
    expect(PEOPLE_MINE_UNSEEN_PHOTO_EDGE).toContain("#D946EF");
    expect(PEOPLE_MINE_UNSEEN_PHOTO_EDGE).toContain("#EF4444");
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("var(--text)");
    expect(PEOPLE_MINE_UNSEEN_FRONT_SHADOW).toContain("0 4px 12px");
    expect(PEOPLE_MINE_UNSEEN_FRONT_SHADOW).not.toContain("linear-gradient");
    expect(PEOPLE_MINE_FRONT_SHADOW).toContain(PEOPLE_MINE_PHOTO_EDGE);

    const openSlide = read("components/people/PeopleOpenPlanCandidateSlide.tsx");
    expect(openSlide).toContain("isUnseen");
    const groupMedia = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(groupMedia).toContain("PEOPLE_MINE_UNSEEN_FRONT_SHADOW");
    expect(groupMedia).toContain("peopleMineUnseenEdgeRingStyle");
    expect(groupMedia).toContain("isUnseen");
    expect(groupMedia).toContain("data-people-group-media-unseen");
  });

  it("Connect/Join styling not keyed off isUnseen", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).not.toMatch(/isUnseen[\s\S]{0,80}Connect/);
    expect(overlay).not.toMatch(/pairUpSeenIds[\s\S]{0,80}primaryAction/);
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).not.toMatch(/isUnseen[\s\S]{0,80}Join/);
  });

  it("Duo/Discover storage keys preserved", () => {
    markPairUpOpportunitySeen("u1", "my_plans", "opp-duo");
    markPairUpOpportunitySeen("u1", "discover", "opp-disc");
    expect(getPairUpSeenOpportunityIdSet("u1", "my_plans").has("opp-duo")).toBe(
      true
    );
    expect(getPairUpSeenOpportunityIdSet("u1", "discover").has("opp-disc")).toBe(
      true
    );
    expect(pairUpSeenStorageKey("u1", "my_plans")).toBe(
      "echotoo_people_pairup_seen_v1:u1:my_plans"
    );
    expect(pairUpSeenStorageKey("u1", "discover")).toBe(
      "echotoo_people_pairup_seen_v1:u1:discover"
    );
  });
});
