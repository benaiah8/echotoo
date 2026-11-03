import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("homeTour wiring", () => {
  it("adds filter cue + panel targets without behavior changes", () => {
    const topBar = read("src/components/HomeTopBar.tsx");
    const overlay = read("src/components/home/HomeFiltersOverlay.tsx");
    const home = read("src/pages/HomePage.tsx");

    expect(topBar).toContain('data-tour-target="home-search-filters"');
    expect(overlay).toContain('data-tour-target="home-filter-panel"');
    expect(overlay).toContain('data-tour-target="home-filter-dates"');
    expect(topBar).toContain('data-tour-target="home-filter-shortcuts"');
    expect(topBar).toContain('data-tour-target="home-filter-trigger"');
    expect(topBar).toContain('data-tour-target="home-filters"');
    expect(home).toContain("onPrepareTourStart");
    expect(home).toContain("onOpenTourFilters");
    expect(home).toContain("onCloseTourFilters");
  });

  it("filter shortcuts wrap compact chip bar (Today/Events/Posts via builders)", () => {
    const topBar = read("src/components/HomeTopBar.tsx");
    const start = topBar.indexOf('data-tour-target="home-filter-shortcuts"');
    expect(start).toBeGreaterThan(-1);
    const region = topBar.slice(start, start + 4500);
    expect(region).toContain("compactFilterChips.map");
    expect(region).toContain("{chip.label}");
    expect(region).toContain('data-tour-target="home-filters"');
    expect(topBar).toContain("buildHomeCompactFilterBarChips");
    expect(region).not.toContain("Places");
  });

  it("filter trigger is the top funnel button", () => {
    const topBar = read("src/components/HomeTopBar.tsx");
    const idx = topBar.indexOf('data-tour-target="home-filter-trigger"');
    expect(idx).toBeGreaterThan(-1);
    const nearby = topBar.slice(idx - 80, idx + 200);
    expect(nearby).toContain('aria-label="Open filters"');
    expect(nearby).toContain("onToggleFilters");
  });
});
