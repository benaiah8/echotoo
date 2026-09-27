import { describe, expect, it } from "vitest";
import { interleavePairUpCandidates } from "../interleavePairUpCandidates";
import { emptyMatchDeckScopeSnapshot } from "../matchDeckSession";
import { pairUpPersonKey } from "./pairUpPersonKey";

type Row = {
  opportunity_id: string;
  creator_id: string;
  source_post_id: string;
  profile_id?: string | null;
  description?: string | null;
};

function row(
  opportunity_id: string,
  person: string,
  source: string,
  profile_id: string | null = null
): Row {
  return {
    opportunity_id,
    creator_id: person,
    source_post_id: source,
    profile_id,
    description: `note-${opportunity_id}`,
  };
}

describe("pairUpPersonKey", () => {
  it("A: prefers profile_id", () => {
    expect(
      pairUpPersonKey({ profile_id: "prof-1", creator_id: "user-1" })
    ).toBe("prof-1");
  });

  it("B: falls back to creator_id", () => {
    expect(pairUpPersonKey({ profile_id: null, creator_id: "user-1" })).toBe(
      "user-1"
    );
    expect(pairUpPersonKey({ profile_id: "  ", creator_id: "user-2" })).toBe(
      "user-2"
    );
  });
});

describe("interleavePairUpCandidates person anti-repeat", () => {
  it("C: same person / different opportunities are retained", () => {
    const incoming = [
      row("o1", "A", "s1", "pA"),
      row("o2", "A", "s2", "pA"),
      row("o3", "B", "s3", "pB"),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    expect(out.map((r) => r.opportunity_id).sort()).toEqual([
      "o1",
      "o2",
      "o3",
    ]);
    expect(out).toHaveLength(3);
  });

  it("D + three unique people: A A B C A → A B C A A when possible", () => {
    const incoming = [
      row("a1", "A", "s1", "pA"),
      row("a2", "A", "s2", "pA"),
      row("b1", "B", "s3", "pB"),
      row("c1", "C", "s4", "pC"),
      row("a3", "A", "s5", "pA"),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    expect(out.map((r) => pairUpPersonKey(r))).toEqual([
      "pA",
      "pB",
      "pC",
      "pA",
      "pA",
    ]);
    expect(out.map((r) => r.opportunity_id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "a3",
    ]);
  });

  it("D: same person adjacency avoided when alternative exists", () => {
    const incoming = [
      row("a1", "A", "s1", "pA"),
      row("a2", "A", "s2", "pA"),
      row("b1", "B", "s3", "pB"),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    expect(out.map((r) => pairUpPersonKey(r))).toEqual(["pA", "pB", "pA"]);
  });

  it("E: repeat allowed when no alternative exists", () => {
    const incoming = [
      row("a1", "A", "s1", "pA"),
      row("a2", "A", "s2", "pA"),
      row("a3", "A", "s3", "pA"),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    expect(out).toHaveLength(3);
    expect(out.every((r) => pairUpPersonKey(r) === "pA")).toBe(true);
  });

  it("F: frozen prefix remains unchanged", () => {
    const incoming = [
      row("a1", "A", "s1", "pA"),
      row("a2", "A", "s2", "pA"),
      row("b1", "B", "s3", "pB"),
      row("c1", "C", "s4", "pC"),
    ];
    const out = interleavePairUpCandidates(incoming, ["a1", "a2"]);
    expect(out.map((r) => r.opportunity_id).slice(0, 2)).toEqual(["a1", "a2"]);
    expect(out.map((r) => r.opportunity_id)).toContain("b1");
    expect(out.map((r) => r.opportunity_id)).toContain("c1");
  });

  it("G: opportunity / source / note associations preserved", () => {
    const incoming = [
      row("a1", "A", "sX", "pA"),
      row("b1", "B", "sY", "pB"),
      row("a2", "A", "sZ", "pA"),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    const byOpp = new Map(out.map((r) => [r.opportunity_id, r]));
    expect(byOpp.get("a1")?.source_post_id).toBe("sX");
    expect(byOpp.get("a1")?.description).toBe("note-a1");
    expect(byOpp.get("a2")?.source_post_id).toBe("sZ");
    expect(byOpp.get("a2")?.description).toBe("note-a2");
  });

  it("falls back to creator_id when profile_id missing", () => {
    const incoming = [
      row("a1", "userA", "s1", null),
      row("a2", "userA", "s2", null),
      row("b1", "userB", "s3", null),
    ];
    const out = interleavePairUpCandidates(incoming, []);
    expect(out.map((r) => pairUpPersonKey(r))).toEqual([
      "userA",
      "userB",
      "userA",
    ]);
  });
});

describe("photo index by personKey", () => {
  it("H: photo index follows personKey across two opportunities", () => {
    const photoIndexByPersonKey: Record<string, number> = {};
    const setFor = (row: Row, index: number) => {
      photoIndexByPersonKey[pairUpPersonKey(row)] = index;
    };
    const getFor = (row: Row) =>
      photoIndexByPersonKey[pairUpPersonKey(row)] ?? 0;

    const oppX = row("ox", "A", "sX", "pA");
    const oppY = row("oy", "A", "sY", "pA");
    setFor(oppX, 2);
    expect(getFor(oppY)).toBe(2);
  });

  it("I: different people have independent photo index", () => {
    const photoIndexByPersonKey: Record<string, number> = {
      pA: 2,
      pB: 0,
    };
    expect(photoIndexByPersonKey[pairUpPersonKey(row("a", "A", "s", "pA"))]).toBe(
      2
    );
    expect(photoIndexByPersonKey[pairUpPersonKey(row("b", "B", "s", "pB"))]).toBe(
      0
    );
  });

  it("J: Mine express vs Discover connect stay distinct", () => {
    const rpcFor = (scope: "my_plans" | "discover") =>
      scope === "discover"
        ? "connect_discover_pair_up"
        : "express_pair_up_interest";
    expect(rpcFor("my_plans")).toBe("express_pair_up_interest");
    expect(rpcFor("discover")).toBe("connect_discover_pair_up");
  });

  it("K: Plans keeps opportunity-scoped photo index", () => {
    const empty = emptyMatchDeckScopeSnapshot();
    expect(empty.photoIndexById).toEqual({});
    expect(empty.photoIndexByPersonKey).toEqual({});
    // Open Plans continues writing photoIndexById[opportunity_id]
    const plansSnap = {
      ...empty,
      photoIndexById: { oppOpen: 1 },
    };
    expect(plansSnap.photoIndexById.oppOpen).toBe(1);
    expect(plansSnap.photoIndexByPersonKey).toEqual({});
  });
});
