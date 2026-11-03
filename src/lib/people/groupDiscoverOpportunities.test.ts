import { describe, expect, it } from "vitest";
import {
  DISCOVER_OPPORTUNITIES_PER_APPEARANCE,
  flattenDiscoverAppearanceOpportunityIds,
  groupDiscoverOpportunities,
  type DiscoverPersonAppearance,
} from "./groupDiscoverOpportunities";

type Row = {
  opportunity_id: string;
  creator_id: string;
  profile_id?: string | null;
};

function row(
  opportunity_id: string,
  creator_id: string,
  profile_id?: string | null
): Row {
  return { opportunity_id, creator_id, profile_id };
}

describe("groupDiscoverOpportunities", () => {
  it("caps each appearance at three opportunities", () => {
    const ordered = [
      row("a1", "alice"),
      row("a2", "alice"),
      row("a3", "alice"),
      row("a4", "alice"),
      row("b1", "bob"),
    ];
    const groups = groupDiscoverOpportunities(ordered);
    expect(
      groups.every(
        (g) => g.opportunities.length <= DISCOVER_OPPORTUNITIES_PER_APPEARANCE
      )
    ).toBe(true);
    expect(groups[0]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
    // Remaining stream starts with a4 (same person) then bob — second appearance is alice again.
    expect(groups[1]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a4",
    ]);
    expect(groups[2]?.personKey).toBe("bob");
  });

  it("repeats the same person with later opportunities", () => {
    const ordered = [
      row("a1", "alice"),
      row("a2", "alice"),
      row("a3", "alice"),
      row("a4", "alice"),
      row("a5", "alice"),
      row("a6", "alice"),
      row("a7", "alice"),
    ];
    const groups = groupDiscoverOpportunities(ordered);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.personKey === "alice")).toBe(true);
    expect(flattenDiscoverAppearanceOpportunityIds(groups)).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
    ]);
  });

  it("never duplicates or drops opportunity ids", () => {
    const ordered = [
      row("a1", "alice"),
      row("b1", "bob"),
      row("a2", "alice"),
      row("c1", "carol"),
      row("a3", "alice"),
      row("a4", "alice"),
      row("b2", "bob"),
    ];
    const groups = groupDiscoverOpportunities(ordered);
    const flat = flattenDiscoverAppearanceOpportunityIds(groups);
    expect(flat.length).toBe(ordered.length);
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(
      new Set(ordered.map((r) => r.opportunity_id))
    );
  });

  it("pulls same-person later rows into an open appearance when capacity remains", () => {
    const ordered = [
      row("a1", "alice"),
      row("b1", "bob"),
      row("a2", "alice"),
      row("a3", "alice"),
    ];
    const groups = groupDiscoverOpportunities(ordered);
    expect(groups[0]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
    expect(groups[1]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "b1",
    ]);
  });

  it("freezes previous appearances when pagination appends", () => {
    const page1 = [
      row("a1", "alice"),
      row("a2", "alice"),
      row("b1", "bob"),
    ];
    const first = groupDiscoverOpportunities(page1);
    expect(first[0]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a1",
      "a2",
    ]);

    const page2 = [
      ...page1,
      row("a3", "alice"),
      row("a4", "alice"),
      row("c1", "carol"),
    ];
    const second = groupDiscoverOpportunities(page2, { previous: first });
    expect(second[0]?.appearanceKey).toBe(first[0]?.appearanceKey);
    expect(second[0]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(second[1]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "b1",
    ]);
    const aliceLater = second.filter(
      (g) => g.personKey === "alice" && g.appearanceKey !== first[0]?.appearanceKey
    );
    expect(aliceLater.length).toBeGreaterThanOrEqual(1);
    expect(
      aliceLater.flatMap((g) => g.opportunities.map((o) => o.opportunity_id))
    ).toEqual(["a3", "a4"]);
    expect(flattenDiscoverAppearanceOpportunityIds(second)).toEqual(
      page2.map((r) => r.opportunity_id)
    );
  });

  it("does not enlarge a frozen group when more same-person rows arrive", () => {
    const previous: DiscoverPersonAppearance<Row>[] = [
      {
        appearanceKey: "alice:a1",
        personKey: "alice",
        opportunities: [row("a1", "alice"), row("a2", "alice")],
      },
    ];
    const ordered = [
      row("a1", "alice"),
      row("a2", "alice"),
      row("a3", "alice"),
    ];
    const groups = groupDiscoverOpportunities(ordered, { previous });
    expect(groups[0]?.opportunities).toHaveLength(2);
    expect(groups[1]?.opportunities.map((o) => o.opportunity_id)).toEqual([
      "a3",
    ]);
  });

  it("uses distinct appearance keys for singleton-like merges without profile merge across people", () => {
    const ordered = [row("x1", "p1"), row("y1", "p2")];
    const groups = groupDiscoverOpportunities(ordered);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.personKey).not.toBe(groups[1]?.personKey);
  });
});
