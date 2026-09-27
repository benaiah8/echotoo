import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Home search overflow containment", () => {
  it("search results scroller clips horizontal overflow without capturing Event-rail pan", () => {
    const searchDock = read("src/components/home/HomeSearchDock.tsx");
    expect(searchDock).toContain("overflow-y-auto");
    expect(searchDock).toContain("overflow-x-clip");
    expect(searchDock).not.toMatch(
      /overflow-y-auto overflow-x-clip|overflow-x-clip overflow-y-auto/
    );
    expect(searchDock).not.toContain("touch-pan-x");

    const eventRail = read("src/sections/home/HomeHorizontalRail.tsx");
    expect(eventRail).toContain("overflow-x-auto");
    expect(eventRail).not.toContain("touch-pan-x");
  });
});
