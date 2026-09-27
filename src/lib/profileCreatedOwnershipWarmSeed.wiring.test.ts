import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("profile Created ownership warm-seed wiring", () => {
  const other = read("src/sections/profile/OtherProfilePostsSection.tsx");
  const own = read("src/sections/profile/OwnProfilePostsSection.tsx");

  it("Other Profile: ownership remount epoch participates in warm seed + guarded cache write", () => {
    expect(other).toContain("ownershipFeedRemountEpoch");
    expect(other).toContain("createdWarmSeedEpoch");
    expect(other).toContain("readProfileCreatedWarmInitialItems");
    expect(other).toContain("setCachedCreatedGuarded");
    expect(other).toContain("setCachedItems={setCachedCreatedGuarded}");
    expect(other).toContain("noteProfileCreatedExclusion");
    expect(other).toContain("onPostOwnershipChanged");
    expect(other).toContain("onPostDeleted");
    // Remount key still bumps with ownership epoch.
    expect(other).toMatch(/key=\{`created-\$\{userId\}-r\$\{feedRefreshEpoch\}-own\$\{ownershipFeedRemountEpoch\}`\}/);
  });

  it("Own Profile: same ownership warm-seed + guarded write protection", () => {
    expect(own).toContain("ownershipFeedRemountEpoch");
    expect(own).toContain("createdWarmSeedEpoch");
    expect(own).toContain("readProfileCreatedWarmInitialItems");
    expect(own).toContain("setCachedCreatedGuarded");
    expect(own).toContain("setCachedItems={setCachedCreatedGuarded}");
    expect(own).toContain("noteProfileCreatedExclusion");
    expect(own).toContain("onPostOwnershipChanged");
    expect(own).toContain("onPostDeleted");
    expect(own).toMatch(
      /key=\{`created-\$\{userId\}-r\$\{feedRefreshEpoch\}-ld\$\{localDraftEpoch\}-own\$\{ownershipFeedRemountEpoch\}`\}/
    );
  });
});
