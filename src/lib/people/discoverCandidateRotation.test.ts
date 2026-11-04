import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVER_RECENT_SEEN_LIMIT,
  clearDiscoverRecentSeenHistory,
  diversifyDiscoverCreators,
  getDiscoverRecentSeenIds,
  noteDiscoverOpportunitiesDisplayed,
  orderDiscoverCandidates,
  preferLessRecentlyShown,
  preferLessRecentlyShownCreators,
} from "./discoverCandidateRotation";
import { DISCOVER_OPPORTUNITIES_PER_APPEARANCE } from "./groupDiscoverOpportunities";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(
  opportunity_id: string,
  creator_id: string,
  source_post_id = "src"
) {
  return { opportunity_id, creator_id, source_post_id, profile_id: null };
}

describe("discoverCandidateRotation", () => {
  beforeEach(() => {
    clearDiscoverRecentSeenHistory();
  });

  it("keeps Discover preference DEFAULT true contract and 3-per-appearance product rule", () => {
    expect(DISCOVER_OPPORTUNITIES_PER_APPEARANCE).toBe(3);
    const migration = read(
      "../supabase/migrations/20260829120000_p2p_discover_enabled.sql"
    );
    expect(migration).toContain(
      "p2p_discover_enabled boolean NOT NULL DEFAULT true"
    );
    expect(read("api/services/pairUp.ts")).toContain(
      "isOwnP2pDiscoverDisabled"
    );
    expect(read("api/services/pairUp.ts")).toContain(
      "pair_up_candidates:${userId}:${kind}:mixed:"
    );
  });

  it("bounds recent-seen history per account and clears per user", () => {
    const ids = Array.from({ length: DISCOVER_RECENT_SEEN_LIMIT + 5 }, (_, i) =>
      `opp-${i}`
    );
    noteDiscoverOpportunitiesDisplayed("u1", ids);
    expect(getDiscoverRecentSeenIds("u1")).toHaveLength(
      DISCOVER_RECENT_SEEN_LIMIT
    );
    expect(getDiscoverRecentSeenIds("u1")[0]).toBe("opp-5");
    noteDiscoverOpportunitiesDisplayed("u2", ["other"]);
    clearDiscoverRecentSeenHistory("u1");
    expect(getDiscoverRecentSeenIds("u1")).toEqual([]);
    expect(getDiscoverRecentSeenIds("u2")).toEqual(["other"]);
  });

  it("prefers never-shown then least-recently-shown without dropping ids", () => {
    noteDiscoverOpportunitiesDisplayed("u1", ["a", "b"]);
    const ordered = preferLessRecentlyShown(
      [row("b", "c1"), row("c", "c2"), row("a", "c1")],
      getDiscoverRecentSeenIds("u1")
    );
    expect(ordered.map((r) => r.opportunity_id)).toEqual(["c", "a", "b"]);
  });

  it("spaces creators on fresh windows and exhausted rotation", () => {
    const pool = [
      row("a1", "c1"),
      row("a2", "c1"),
      row("b1", "c2"),
      row("c1", "c3"),
    ];
    noteDiscoverOpportunitiesDisplayed("u1", ["a1", "a2"]);
    const byCreator = preferLessRecentlyShownCreators(pool, ["a1", "a2"]);
    expect(byCreator[0]?.creator_id).not.toBe("c1");
    const fresh = orderDiscoverCandidates({
      userId: "u1",
      candidates: pool,
      previousOrderedIds: [],
      hasMore: false,
    });
    expect(fresh.map((r) => r.opportunity_id).sort()).toEqual(
      pool.map((r) => r.opportunity_id).sort()
    );
    // First card should not be a recently shown c1 card when alternatives exist.
    expect(["b1", "c1"]).toContain(fresh[0]!.opportunity_id);
    expect(fresh[0]!.creator_id).not.toBe("c1");

    const rotated = orderDiscoverCandidates({
      userId: "u1",
      candidates: pool,
      previousOrderedIds: ["a1", "a2", "b1", "c1"],
      hasMore: false,
      rotateExhausted: true,
    });
    expect(rotated.map((r) => r.opportunity_id).sort()).toEqual(
      pool.map((r) => r.opportunity_id).sort()
    );
    for (let i = 1; i < rotated.length; i += 1) {
      if (rotated[i]!.creator_id === rotated[i - 1]!.creator_id) {
        const alternatives = rotated
          .slice(i)
          .some((r) => r.creator_id !== rotated[i - 1]!.creator_id);
        expect(alternatives).toBe(false);
      }
    }
  });

  it("round-robins creators so one person cannot monopolize the head of a page", () => {
    const concentrated = [
      row("a1", "c1"),
      row("a2", "c1"),
      row("a3", "c1"),
      row("b1", "c2"),
      row("b2", "c2"),
      row("d1", "c3"),
    ];
    const diversified = diversifyDiscoverCreators(concentrated);
    expect(diversified.map((r) => r.opportunity_id).sort()).toEqual(
      concentrated.map((r) => r.opportunity_id).sort()
    );
    expect(diversified.slice(0, 3).map((r) => r.creator_id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("does not invent candidates when the eligible pool is empty", () => {
    expect(
      orderDiscoverCandidates({
        userId: "u1",
        candidates: [],
        previousOrderedIds: [],
        hasMore: false,
        rotateExhausted: true,
      })
    ).toEqual([]);
  });

  it("wires Discover ordering + account-scoped session into overlay/App", () => {
    const hook = read("hooks/usePairUpCandidates.ts");
    expect(hook).toContain("listGenerationRef.current += 1");
    expect(hook).toContain("userIdRef.current !== uid");
    expect(hook).toContain("loadMore:missingCursor");
    expect(hook).toContain("isOwnP2pDiscoverDisabled(uid)");
    expect(hook).toContain("discoverCycleReceivedIdsRef");
    expect(hook).toContain("noteDiscoverCycleReceived");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("orderDiscoverCandidates");
    expect(overlay).toContain("noteDiscoverOpportunitiesDisplayed");
    expect(overlay).toContain("userId: authUserId");
    expect(overlay).toContain("accountDeckUserRef");
    expect(overlay).toContain("discoverEndRotateLatchRef");
    expect(overlay).toContain("discoverRotateEpoch");
    expect(overlay).toContain("rotateExhausted");
    expect(overlay).toContain("discoverAppearancesFreezeEpochRef");
    expect(overlay).toContain("clearDiscoverRecentSeenHistory");
    expect(read("lib/people/discoverCandidateRotation.ts")).toContain(
      "diversifyDiscoverCreators"
    );
    expect(read("lib/people/discoverCandidateRotation.ts")).toContain(
      "preferLessRecentlyShownCreators"
    );
    expect(read("lib/people/discoverCandidateRotation.ts")).toContain(
      "rotateExhaustedDiscoverPool"
    );

    const app = read("App.tsx");
    expect(app).toContain("invalidateAllPairUpCache");
    expect(app).toContain("clearMatchDeckSession");
    expect(app).toContain("clearDiscoverRecentSeenHistory");

    const session = read("lib/matchDeckSession.ts");
    expect(session).toContain("expectedUserId");
    expect(session).toContain("userId?: string | null");
  });

  it("changes exhausted rotation order across epochs when alternatives exist", () => {
    const pool = [
      row("a1", "c1"),
      row("b1", "c2"),
      row("c1", "c3"),
      row("d1", "c4"),
    ];
    const first = orderDiscoverCandidates({
      userId: "u1",
      candidates: pool,
      previousOrderedIds: pool.map((r) => r.opportunity_id),
      hasMore: false,
      rotateExhausted: true,
      rotationEpoch: 0,
    });
    const second = orderDiscoverCandidates({
      userId: "u1",
      candidates: pool,
      previousOrderedIds: pool.map((r) => r.opportunity_id),
      hasMore: false,
      rotateExhausted: true,
      rotationEpoch: 1,
    });
    expect(first.map((r) => r.opportunity_id).sort()).toEqual(
      second.map((r) => r.opportunity_id).sort()
    );
    expect(first.map((r) => r.opportunity_id).join(",")).not.toBe(
      second.map((r) => r.opportunity_id).join(",")
    );
  });
});
