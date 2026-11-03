/**
 * Home filters overlay — centered content-height panel + presentation polish.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("HomeFiltersOverlay", () => {
  const overlay = read("src/components/home/HomeFiltersOverlay.tsx");
  const topBar = read("src/components/HomeTopBar.tsx");
  const home = read("src/pages/HomePage.tsx");
  const panel = read("src/components/home/HomeFilterCalendarPanel.tsx");
  const css = read("src/App.css");

  it("centers a content-height panel at max 90% of the safe shell", () => {
    expect(overlay).toContain('data-home-filters-shell="true"');
    expect(overlay).toContain("items-center");
    expect(overlay).toContain("justify-center");
    expect(overlay).toContain("h-fit");
    expect(overlay).toContain("self-center");
    expect(overlay).toContain("max-h-[90%]");
    expect(overlay).toContain("overflow-y-auto");
    expect(overlay).toContain("overscroll-contain");
    expect(overlay).not.toMatch(
      /data-home-filters-content="true"[\s\S]{0,220}\bh-full\b/,
    );
  });

  it("lets empty frosted margins hit the backdrop dismiss control", () => {
    expect(overlay).toContain('data-home-filters-backdrop="true"');
    expect(overlay).toContain('aria-label="Dismiss filters"');
    expect(overlay).toContain("playAnimatedDismiss()");
    expect(overlay).toContain(
      "relative z-10 flex h-full w-full items-center justify-center pointer-events-none",
    );
    expect(overlay).toContain('data-home-filters-content="true"');
    expect(overlay).toContain("pointer-events-auto");
  });

  it("uses a stronger frosted dark tint without going opaque", () => {
    expect(overlay).toContain("createPortal");
    expect(overlay).toContain("bg-black/65");
    expect(overlay).toContain("backdrop-blur-md");
    expect(overlay).toContain("[backdrop-filter:blur(12px)]");
    expect(overlay).toContain("[-webkit-backdrop-filter:blur(12px)]");
    expect(overlay).toContain("useOverlayBackgroundScrollLock");
    expect(overlay).not.toContain("bg-black/50");
    expect(overlay).not.toContain("bg-[var(--bg)]");
    expect(overlay).not.toContain("bg-black/90");
  });

  it("centers Filters title and places Clear + X in a bottom action row", () => {
    expect(overlay).toContain('id="home-filters-overlay-title"');
    expect(overlay).toContain("text-center text-[15px] font-semibold");
    expect(overlay).toMatch(/<h2[\s\S]*?>\s*Filters\s*<\/h2>/);
    expect(overlay).not.toContain("justify-between gap-2 pb-3");
    expect(overlay).toContain('data-home-filters-bottom-actions="true"');
    expect(overlay).toContain('aria-label="Close filters"');
    const titleAt = overlay.indexOf("home-filters-overlay-title");
    const socialAt = overlay.indexOf("home-filters-social-heading");
    const clearAt = overlay.indexOf("Clear all filters");
    const closeAt = overlay.indexOf('aria-label="Close filters"');
    expect(titleAt).toBeGreaterThan(-1);
    expect(titleAt).toBeLessThan(socialAt);
    expect(clearAt).toBeGreaterThan(socialAt);
    expect(closeAt).toBeGreaterThan(clearAt);
  });

  it("does not render scroll-edge fades or Profile scroll-edge wiring", () => {
    expect(overlay).not.toContain("deriveProfileActionSheetScrollEdges");
    expect(overlay).not.toContain("updateScrollEdges");
    expect(overlay).not.toContain("canScrollUp");
    expect(overlay).not.toContain("canScrollDown");
    expect(overlay).not.toContain("data-home-filters-scroll-fade");
    expect(overlay).not.toContain("data-home-filters-panel-chrome");
    expect(overlay).not.toContain("onScroll={updateScrollEdges}");
  });

  it("hides the overlay scrollbar without disabling scroll", () => {
    expect(overlay).toContain("scroll-hide");
    expect(overlay).toContain("overflow-y-auto");
    expect(overlay).toContain("overscroll-contain");
    expect(overlay).toContain("[-webkit-overflow-scrolling:touch]");
  });

  it("applies feathered calendar contrast only inside the Home filters overlay", () => {
    expect(css).toContain(
      "[data-home-filters-overlay] [data-home-filters-calendar]",
    );
    expect(css).toContain("radial-gradient");
    expect(css).toContain("transparent 76%");
    expect(css).toContain("border: 0");
    expect(css).toContain("box-shadow: none");
    expect(css).toContain(
      "html.theme-light [data-home-filters-overlay] [data-home-filters-calendar]",
    );
    expect(panel).toContain('dayPickerClassName="rdp-theme--full-width"');
    expect(panel).toContain("bg-transparent");
  });

  it("tightens Social→Date divider and opens Date heading→chips spacing", () => {
    expect(overlay).toContain('data-home-filters-divider="social-date"');
    expect(overlay).toContain("socialToDateDividerClass");
    expect(overlay).toContain("mt-5 mb-2.5");
    expect(overlay).toContain("dateSectionLabelClass");
    expect(overlay).toContain(
      "w-full pb-4 text-center text-[10px] font-semibold uppercase tracking-[0.14em]",
    );
    expect(overlay).toContain('data-home-filters-divider="date-calendar"');
    expect(overlay).toContain("my-5");
  });

  it("separates Social/Date/Calendar with spaced hairline dividers", () => {
    expect(overlay.match(/role="separator"/g)?.length).toBe(2);
    expect(overlay).toContain("border-t");
    expect(overlay).toContain("var(--border)");
  });

  it("styles Clear with hasActiveFilters yellow selected chip look", () => {
    expect(overlay).toContain("hasActiveFilters");
    expect(overlay).toContain("chipButtonClass(hasActiveFilters)");
    expect(topBar).toContain("hasActiveFilters={hasActiveFilters}");
    expect(overlay).toContain("inline-flex h-8");
  });

  it("allows full-width calendar content swipe with month-nav exclusions only", () => {
    expect(overlay).toContain("useOverlayEdgeSwipeDismiss");
    expect(overlay).toContain("useOverlayContentSwipeDismiss");
    expect(overlay).toContain("edgeStripProps");
    expect(overlay).toContain("HOME_FILTERS_CONTENT_SWIPE_EXCLUDE");
    expect(overlay).toContain(
      ".rdp-button_previous, .rdp-button_next, .rdp-nav",
    );
    expect(overlay).toContain("startZoneMaxXVw: 1");
    expect(overlay).toContain("startZoneMaxPx: 10000");
    expect(overlay).not.toContain("startZoneMaxXVw: 0.45");
    expect(overlay).not.toContain("startZoneMaxPx: 180");
    expect(overlay).toContain("allowButtonTargets: true");
    expect(overlay).toContain("commitThresholdPx: 48");
    expect(overlay).toContain("horizontalLockPx: 12");
    expect(overlay).not.toContain(".rdp-day_button");
    expect(overlay).not.toContain("[data-home-filters-calendar]");
    expect(panel).not.toContain("data-no-overlay-swipe");
  });

  it("keeps overlay open on filter apply; close does not clear", () => {
    expect(home).toContain("handleCloseHomeFilters");
    expect(home).toContain("onCloseFilters={handleCloseHomeFilters}");
    const applyStart = home.indexOf("const applyHomeFilterAction");
    const closeStart = home.indexOf("const handleCloseHomeFilters");
    const clearStart = home.indexOf("const clearAllHomeFilters");
    const applyFn = home.slice(applyStart, closeStart);
    expect(applyFn).toContain("scheduleScrollHomeFeedToTop");
    expect(applyFn).not.toContain("setFiltersOpen(false)");
    const clearEnd = home.indexOf("const handleToggleDateFilter", clearStart);
    const clearFn = home.slice(clearStart, clearEnd);
    expect(clearFn).toContain("setFiltersOpen(false)");
    expect(clearFn).toContain('setSearch("")');
  });

  it("preserves Escape, Android back, tour targets and borderless calendar", () => {
    expect(overlay).toContain('e.key === "Escape"');
    expect(overlay).toContain("subscribeAndroidHardwareBack");
    expect(overlay).toContain('data-tour-target="home-filter-panel"');
    expect(overlay).toContain('data-tour-target="home-filter-dates"');
    expect(topBar).toContain('data-tour-target="home-filter-trigger"');
    expect(topBar).toContain('data-tour-target="home-filter-shortcuts"');
    expect(panel).toContain('data-tour-target="home-filter-calendar"');
    expect(panel).toContain('dayPickerClassName="rdp-theme--full-width"');
  });
});
