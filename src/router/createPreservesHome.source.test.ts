import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCreateFlowPath, Paths } from "./Paths";

const root = resolve(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("isCreateFlowPath", () => {
  it("matches create tree only", () => {
    expect(isCreateFlowPath(Paths.create)).toBe(true);
    expect(isCreateFlowPath(Paths.createFinalize)).toBe(true);
    expect(isCreateFlowPath(`${Paths.create}/preview`)).toBe(true);
    expect(isCreateFlowPath(Paths.home)).toBe(false);
    expect(isCreateFlowPath(Paths.people)).toBe(false);
  });
});

describe("Create keeps PersistentTabContainer mounted", () => {
  it("AppRouter mounts tabs under Create without rewriting create routes", () => {
    const src = readSrc("router/AppRouter.tsx");
    expect(src).toContain("isCreateRoute");
    expect(src).toContain("tabsCovered={isCreateRoute}");
    expect(src).toContain("isCreateFlowPath");
    // Must not fold Create into effectiveBackground (would drop /create Routes).
    expect(src).toContain(
      "Create must NOT use effectiveBackground"
    );
  });

  it("useTabActive is false while tabsCovered", () => {
    const src = readSrc("router/PersistentTabContainer.new.tsx");
    expect(src).toContain("tabsCovered");
    expect(src).toContain("if (covered) return false");
    expect(src).toContain("tabVisible");
  });
});
