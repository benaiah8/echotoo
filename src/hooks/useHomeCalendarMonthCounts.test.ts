import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("useHomeCalendarMonthCounts hook contract", () => {
  const hook = read("src/hooks/useHomeCalendarMonthCounts.ts");

  it("does not fetch when enabled is false", () => {
    expect(hook).toContain('if (!enabled)');
    expect(hook).toContain('setState(INITIAL)');
  });

  it("uses request sequence to drop stale responses", () => {
    expect(hook).toContain("requestSeq");
    expect(hook).toContain("seq !== requestSeq.current");
  });

  it("invalidates cache when refreshEpoch changes", () => {
    expect(hook).toContain("invalidateHomeCalendarMonthCountsCache");
    expect(hook).toContain("refreshEpoch");
  });

  it("clears counts on error (no fake zeros)", () => {
    expect(hook).toContain('status: "error"');
    expect(hook).toContain("countsByYmd: null");
  });
});
