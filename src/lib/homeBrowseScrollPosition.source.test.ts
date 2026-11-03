/**
 * Home browse scroll restore — HomePage wiring contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("homeBrowseScrollPositionWiring", () => {
  const home = read("pages/HomePage.tsx");

  it("saves browse Y on Home → inactive using leave resolver", () => {
    expect(home).toContain("wasHomeTabActiveForScrollRef");
    expect(home).toContain("resolveHomeBrowseScrollYForLeave");
    expect(home).toContain("wasActive && !nowActive");
    expect(home).toContain("saveScrollPosition(browseFeedCacheKey, y)");
  });

  it("gates window scroll tracking with shouldTrackHomeBrowseWindowScroll", () => {
    expect(home).toContain("shouldTrackHomeBrowseWindowScroll");
    expect(home).toContain("isHomeTabActive: isHomeTabActiveRef.current");
    expect(home).toContain(
      "homePostSearchActive: homePostSearchActiveRef.current"
    );
  });

  it("restores on inactive → active without feed refetch", () => {
    expect(home).toContain("!wasActive && nowActive");
    expect(home).toContain("resolveHomeBrowseScrollYForRestore");
    expect(home).toContain("applyHomeBrowseScrollRestore");
    expect(home).not.toMatch(
      /!wasActive && nowActive[\s\S]{0,800}(?:getPublicFeed|runUnseenHomeReplacement|setHomeRefreshEpoch)/
    );
  });

  it("intentional top clears saved Y and suppresses stale restore", () => {
    expect(home).toContain("skipBrowseScrollRestoreRef");
    expect(home).toMatch(
      /scrollHomeFeedToTop[\s\S]*?skipBrowseScrollRestoreRef\.current = true[\s\S]*?saveScrollPosition\(browseFeedCacheKey, 0\)/
    );
  });

  it("does not restore browse scroll while search is active", () => {
    expect(home).toContain("if (homePostSearchActive || !isHomeTabActive) return");
    expect(home).toContain("!homePostSearchActiveRef.current");
  });

  it("keeps per-feed-key helpers and Post Detail path unchanged", () => {
    expect(home).toContain("saveHomeBrowseScrollPosition");
    expect(home).toContain("getHomeBrowseScrollPosition");
    expect(home).toContain("isPostDetailRoutePath");
    expect(home).toContain("subscribeAndroidHardwareBack");
    // BottomTab / PersistentTab ownership stays out of this fix.
    expect(read("components/BottomTab.tsx")).not.toContain(
      "homeBrowseScrollPosition"
    );
    expect(read("router/PersistentTabContainer.new.tsx")).not.toContain(
      "homeBrowseScrollPosition"
    );
  });
});
