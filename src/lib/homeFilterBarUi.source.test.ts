/**
 * Compact Home filter bar — fixed end caps + scrollable chip track (UI only).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Home filter bar UI structure", () => {
  const topBar = read("src/components/HomeTopBar.tsx");

  it("uses three zones: fixed filter, scroll track, fixed clear", () => {
    expect(topBar).toContain('data-home-filter-chip-track=""');
    expect(topBar).toContain("overflow-x-auto");
    expect(topBar).toContain("scroll-hide");
    expect(topBar).toContain("[touch-action:pan-x]");
    expect(topBar).toContain("filterBarEndCapClass");
    expect(topBar).toContain('aria-label="Open filters"');
    expect(topBar).toContain('aria-label="Clear filters"');
  });

  it("orders chips from buildHomeCompactFilterBarChips with stable keys", () => {
    expect(topBar).toContain("buildHomeCompactFilterBarChips");
    expect(topBar).toContain("compactFilterChips.map");
    expect(topBar).toContain("key={chip.id}");
    expect(topBar).toContain("handleCompactChipClick");
  });

  it("resets chip-track scroll when selected filters change", () => {
    expect(topBar).toContain("chipTrackRef");
    expect(topBar).toContain("scrollLeft = 0");
    expect(topBar).toMatch(/\[dateFilter,\s*customOccursOn,\s*viewMode,\s*friendsFilter\]/);
  });

  it("preserves existing filter actions via chip click routing", () => {
    expect(topBar).toContain('onToggleTypeFilter("hangouts")');
    expect(topBar).toContain('onToggleTypeFilter("experiences")');
    expect(topBar).toContain("onToggleDateFilter(chip.dateTarget)");
    expect(topBar).toContain("onToggleCustomDate(chip.customOccursOn)");
    expect(topBar).toContain("HomeFiltersOverlay");
    expect(topBar).toContain("onToggleFriends()");
    expect(topBar).toContain('data-tour-target="home-filter-shortcuts"');
    expect(topBar).toContain('data-tour-target="home-filters"');
  });

  it("opens full-screen filters overlay (calendar expanded inside overlay)", () => {
    expect(topBar).toContain("filtersOverlayOpen");
    expect(topBar).toContain("HomeFiltersOverlay");
    expect(topBar).toContain("onCloseFilters");
    expect(topBar).not.toContain("calendarSectionExpanded");
    expect(topBar).not.toContain("max-h-[min(420px,72vh)]");
  });

  it("caps filter bar width at min(475px, 75vw) without forcing full width", () => {
    expect(topBar).toContain('FILTER_BAR_MAX_WIDTH = "min(475px, 75vw)"');
    expect(topBar).toContain("maxWidth: FILTER_BAR_MAX_WIDTH");
    expect(topBar).toContain("inline-flex w-fit max-w-full");
    expect(topBar).not.toMatch(
      /filterBarMaxWidth\s*=\s*atTop/,
    );
  });

  it("uses theme --bg solid end caps without outline borders", () => {
    const endCapFn = topBar.match(
      /const filterBarEndCapClass[\s\S]*?^};/m,
    )?.[0];
    expect(endCapFn).toBeTruthy();
    expect(endCapFn).toContain("h-6 w-6");
    expect(endCapFn).toContain("rounded-full border-0");
    expect(endCapFn).toContain("bg-[var(--bg)]");
    expect(endCapFn).not.toContain("border border-");
    expect(endCapFn).not.toContain("bg-neutral-800");
    expect(endCapFn).not.toContain("app-dark:bg-white/[0.88]");
  });

  it("keeps height stable and hides scrollbar on the chip track", () => {
    expect(topBar).toContain("h-[18px]");
    expect(topBar).toContain("scroll-hide");
    expect(topBar).toContain("overflow-y-hidden");
  });

  it("masks chip edges under end caps with theme glass surface", () => {
    expect(topBar).toContain("bg-[var(--glass-bg)]");
    expect(topBar).toContain("mask-image:linear-gradient");
    expect(topBar).toContain("z-[2]");
  });
});
