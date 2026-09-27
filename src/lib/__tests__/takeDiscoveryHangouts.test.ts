import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sortDiscoveryHangoutsBySocialSignal,
  takeDiscoveryHangouts,
} from "../horizontalRailFilters";
import type { FeedItemWithDates } from "../feedSorting";

function item(
  id: string,
  type: FeedItemWithDates["type"],
  discoverable_group_count?: number | null,
  discoverable_pair_count?: number | null,
  social_discovery_boosted_at?: string | null
): FeedItemWithDates {
  return {
    id,
    type,
    caption: id,
    created_at: "2099-01-01T00:00:00.000Z",
    discoverable_group_count,
    discoverable_pair_count,
    social_discovery_boosted_at,
  } as FeedItemWithDates;
}

describe("takeDiscoveryHangouts", () => {
  it("keeps hangouts only, preserves order, and caps without mutating input", () => {
    const input = [
      item("e1", "experience"),
      item("h1", "hangout"),
      item("h2", "hangout"),
      item("e2", "experience"),
      item("h3", "hangout"),
      item("h4", "hangout"),
    ];
    const snapshot = [...input];
    const out = takeDiscoveryHangouts(input, 3);
    expect(out.map((p) => p.id)).toEqual(["h1", "h2", "h3"]);
    expect(out.every((p) => p.type === "hangout")).toBe(true);
    expect(input).toEqual(snapshot);
  });

  it("returns empty for invalid max or empty input", () => {
    expect(takeDiscoveryHangouts([], 8)).toEqual([]);
    expect(takeDiscoveryHangouts([item("h1", "hangout")], 0)).toEqual([]);
  });
});

describe("sortDiscoveryHangoutsBySocialSignal", () => {
  it("orders by admin boost then pair+group total without mutating input", () => {
    const input = [
      item("a", "hangout", 1, 0),
      item("b", "hangout", 5, 0),
      item("c", "hangout", 0, 0),
      item("d", "hangout", 2, 3),
    ];
    const snapshot = [...input];
    const out = sortDiscoveryHangoutsBySocialSignal(input);
    expect(out.map((p) => p.id)).toEqual(["b", "d", "a", "c"]);
    expect(input).toEqual(snapshot);
  });

  it("treats missing/null/non-finite counts as 0", () => {
    const input = [
      item("z", "hangout", null),
      item("y", "hangout", undefined),
      item("x", "hangout", 2),
      item("w", "hangout", Number.NaN),
    ];
    const out = sortDiscoveryHangoutsBySocialSignal(input);
    expect(out.map((p) => p.id)).toEqual(["x", "z", "y", "w"]);
  });

  it("keeps stable feed order for equal counts", () => {
    const input = [
      item("first", "hangout", 0),
      item("second", "hangout", null),
      item("third", "hangout", 0),
    ];
    expect(sortDiscoveryHangoutsBySocialSignal(input).map((p) => p.id)).toEqual(
      ["first", "second", "third"]
    );
  });

  it("prefers boosted Events before organic totals", () => {
    const input = [
      item("organic", "hangout", 99, 99),
      item("boosted", "hangout", 0, 0, "2099-06-01T00:00:00.000Z"),
    ];
    expect(sortDiscoveryHangoutsBySocialSignal(input).map((p) => p.id)).toEqual(
      ["boosted", "organic"]
    );
  });
});

describe("Home discovery rail Event-only wiring (source)", () => {
  it("HomePage rail loaders take hangouts, social-sort, then cap", () => {
    const src = readFileSync(
      join(process.cwd(), "src/pages/HomePage.tsx"),
      "utf8"
    );
    expect(src).toContain("takeDiscoveryHangouts");
    expect(src).toContain("sortDiscoveryHangoutsBySocialSignal");
  });
});
