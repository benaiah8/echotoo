import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Home calendar day count badges", () => {
  const body = read("src/components/create/CreateScheduleCalendarBody.tsx");
  const panel = read("src/components/home/HomeFilterCalendarPanel.tsx");
  const overlay = read("src/components/home/HomeFiltersOverlay.tsx");
  const css = read("src/App.css");

  it("shows positive counts only when status is ready", () => {
    expect(body).toContain('countsState.status === "ready"');
    expect(body).toContain("count > 0");
    expect(body).toContain("home-rdp-event-count");
  });

  it("positions count as top-right badge in day cell (shared default)", () => {
    expect(css).toContain(".rdp-theme .home-rdp-event-count");
    expect(css).toMatch(/\.home-rdp-event-count[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/top:\s*1px/);
    expect(css).toContain(".home-rdp-day-with-count");
    expect(css).toMatch(/\.home-rdp-day-with-count[\s\S]*position:\s*relative/);
  });

  it("uses Home-scoped stacked badge geometry inside the filters overlay", () => {
    expect(css).toContain("[data-home-filters-overlay] .rdp-theme .home-rdp-event-count");
    expect(css).toContain("position: static");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("min-height: 3.125rem");
    expect(css).toContain("font-size: 0.9375rem");
    expect(css).toContain("gap: 4px");
  });

  it("uses legible badge typography and compact pill dimensions", () => {
    const badgeBlock = css.match(
      /\.rdp-theme \.home-rdp-event-count\s*\{[\s\S]*?\}/,
    )?.[0];
    expect(badgeBlock).toBeTruthy();
    expect(badgeBlock).toContain("font-size: 11px");
    expect(badgeBlock).toContain("font-weight: 700");
    expect(badgeBlock).toContain("height: 17px");
    expect(badgeBlock).toContain("min-width: 17px");
  });

  it("does not enable count UI without homeDayEventCounts prop", () => {
    expect(body).toContain("if (!homeDayEventCounts) return undefined");
  });

  it("lazy fetch gated by calendarVisible while overlay is open", () => {
    expect(panel).toContain("enabled: calendarVisible");
    expect(panel).toContain("useHomeCalendarMonthCounts");
    expect(overlay).toContain("calendarVisible={open}");
    expect(panel).toContain('dayPickerClassName="rdp-theme--full-width"');
  });

  it("does not show error hint for missing RPC (pre-deploy)", () => {
    expect(panel).toContain("missingRpc");
  });

  it("explains calendar numbers below the calendar in the overlay", () => {
    expect(overlay).toContain(
      "Numbers show how many events are available on that day."
    );
    expect(overlay).toContain("HomeFilterCalendarPanel");
    const panelAt = overlay.indexOf("<HomeFilterCalendarPanel");
    const helpAt = overlay.indexOf(
      "Numbers show how many events are available on that day."
    );
    expect(helpAt).toBeGreaterThan(panelAt);
  });

  it("keeps feathered Home-only calendar contrast without a bordered card", () => {
    expect(css).toContain(
      "[data-home-filters-overlay] [data-home-filters-calendar]",
    );
    expect(css).toContain("radial-gradient");
    expect(css).toContain("border: 0");
    expect(css).toContain("box-shadow: none");
  });
});
