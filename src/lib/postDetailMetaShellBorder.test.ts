/**
 * Post Detail Schedule/Date + Location: border-only shells (no fill / amber glow).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Post Detail schedule + location border-only shells", () => {
  it("Schedule/Date block is transparent with theme border only", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    const start = body.indexOf("{showScheduleBlock && (");
    const end = body.indexOf("{!composeFinalizeShell && publishedCarrierSlot0Location");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = body.slice(start, end);
    expect(block).toContain("border border-[var(--border)]/70");
    expect(block).toContain("bg-transparent");
    expect(block).toContain("app-dark:border-white/22");
    expect(block).not.toContain("bg-[color-mix(in_oklab,var(--surface)_18%");
    expect(block).not.toContain("app-dark:bg-white/[0.05]");
    expect(block).not.toContain("shadow-[inset_0_1px_0");
    expect(block).not.toContain("drop-shadow-[0_0_8px_var(--create-accent-icon-glow)]");
    expect(block).toContain("Schedule / Date");
    expect(block).toContain("PiCalendarBlank");
    expect(block).toContain("data-schedule-status");
    expect(block).toContain("scheduleStatusLine");
    expect(block).toContain("rounded-xl");
    expect(block).not.toContain("aria-expanded");
    expect(body).toContain("formatPostDetailScheduleStatus");
    expect(body).toContain("formatFinalizeRecurrenceSummaryLine");
  });

  it("Location read-only shell drops filled meta surface + amber shadow", () => {
    const loc = read("src/components/detail/PostV4LocationReadOnly.tsx");
    expect(loc).not.toContain("finalizeMetaSurfaceClass");
    expect(loc).toContain("border border-[var(--border)]/70");
    expect(loc).toContain("bg-transparent");
    expect(loc).toContain("app-dark:border-white/22");
    expect(loc).not.toContain("rgba(247,208,71");
    expect(loc).not.toContain("shadow-[0_2px_8px");
    expect(loc).toContain("openMapsLocationUrl");
    expect(loc).toContain("PiMapPin");
    expect(loc).toContain("PiArrowSquareOut");
  });

  it("Create/Feed shared finalizeMetaSurfaceClass remains filled for other surfaces", () => {
    const surface = read("src/lib/createFlowFinalizeMetaSurface.ts");
    expect(surface).toContain("finalizeMetaSurfaceClass");
    expect(surface).toContain("bg-[color-mix(in_oklab,var(--surface-2)_52%,white)]");
    expect(surface).toContain("rgba(247,208,71");
  });
});
