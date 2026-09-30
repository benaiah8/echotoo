import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_FEED_DISPLAY_TTL_MS } from "./homeFeedListCache";
import {
  HOME_RECOVERY_BACKGROUND_MS,
  HOME_RECOVERY_COALESCE_MS,
  createHomeRecoveryState,
  loadGenerationStillOwns,
  reduceHomeRecovery,
  type HomeRecoveryState,
} from "./homeFeedRecovery";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function online(
  state: HomeRecoveryState,
  now: number,
  homeVisible = true,
) {
  return reduceHomeRecovery(state, { type: "online", now, homeVisible });
}

function foreground(
  state: HomeRecoveryState,
  now: number,
  homeVisible = true,
) {
  return reduceHomeRecovery(state, { type: "foreground", now, homeVisible });
}

describe("home recovery policy", () => {
  it("uses the existing 10 minute display TTL", () => {
    expect(HOME_RECOVERY_BACKGROUND_MS).toBe(HOME_FEED_DISPLAY_TTL_MS);
    expect(HOME_RECOVERY_BACKGROUND_MS).toBe(10 * 60 * 1000);
  });

  it("offline to online while visible publishes one empty-error cycle", () => {
    const started = createHomeRecoveryState(false);
    const first = online(started, 1_000);
    const second = online(first.state, 1_100);
    expect(first.publish).toEqual({
      epoch: 1,
      emptyErrorRetry: true,
      filteredSoftRefresh: false,
    });
    expect(second.publish).toBeNull();
  });

  it("a failed cycle does not loop until a new offline edge", () => {
    let state = createHomeRecoveryState(false);
    state = online(state, 1_000).state;
    expect(online(state, 5_000).publish).toBeNull();
    state = reduceHomeRecovery(state, { type: "offline" }).state;
    const again = online(state, 6_000);
    expect(again.publish?.epoch).toBe(2);
    expect(again.publish?.emptyErrorRetry).toBe(true);
  });

  it("background under the TTL does not refresh", () => {
    let state = createHomeRecoveryState(true);
    state = reduceHomeRecovery(state, {
      type: "background-start",
      now: 0,
    }).state;
    const back = foreground(state, HOME_RECOVERY_BACKGROUND_MS - 1);
    expect(back.publish).toBeNull();
  });

  it("background at the TTL publishes one filtered soft refresh and one empty retry", () => {
    let state = createHomeRecoveryState(true);
    state = reduceHomeRecovery(state, {
      type: "background-start",
      now: 0,
    }).state;
    const back = foreground(state, HOME_RECOVERY_BACKGROUND_MS);
    expect(back.publish).toEqual({
      epoch: 1,
      emptyErrorRetry: true,
      filteredSoftRefresh: true,
    });
    expect(foreground(back.state, HOME_RECOVERY_BACKGROUND_MS + 5_000).publish).toBeNull();
  });

  it("online and foreground inside the coalesce window share one epoch", () => {
    let state = createHomeRecoveryState(false);
    state = reduceHomeRecovery(state, {
      type: "background-start",
      now: 0,
    }).state;
    const cameOnline = online(state, HOME_RECOVERY_BACKGROUND_MS);
    const resumed = foreground(
      cameOnline.state,
      HOME_RECOVERY_BACKGROUND_MS + HOME_RECOVERY_COALESCE_MS - 1,
    );
    expect(cameOnline.publish?.epoch).toBe(1);
    expect(cameOnline.publish?.emptyErrorRetry).toBe(true);
    expect(resumed.publish).toEqual({
      epoch: 1,
      emptyErrorRetry: false,
      filteredSoftRefresh: true,
    });
  });

  it("does not publish while Home is hidden, then publishes once when it returns", () => {
    const state = createHomeRecoveryState(false);
    const hidden = online(state, 50, false);
    expect(hidden.publish).toBeNull();
    const shown = reduceHomeRecovery(hidden.state, {
      type: "home-visible",
      now: 60,
    });
    const shownAgain = reduceHomeRecovery(shown.state, {
      type: "home-visible",
      now: 70,
    });
    expect(shown.publish).toEqual({
      epoch: 1,
      emptyErrorRetry: true,
      filteredSoftRefresh: false,
    });
    expect(shownAgain.publish).toBeNull();
  });

  it("a long background while hidden is one cycle when Home is visible again", () => {
    let state = createHomeRecoveryState(true);
    state = reduceHomeRecovery(state, {
      type: "background-start",
      now: 0,
    }).state;
    const hidden = foreground(state, HOME_RECOVERY_BACKGROUND_MS, false);
    expect(hidden.publish).toBeNull();
    const shown = reduceHomeRecovery(hidden.state, {
      type: "home-visible",
      now: HOME_RECOVERY_BACKGROUND_MS + 10,
    });
    expect(shown.publish?.epoch).toBe(1);
    expect(shown.publish?.filteredSoftRefresh).toBe(true);
    expect(
      reduceHomeRecovery(shown.state, {
        type: "home-visible",
        now: HOME_RECOVERY_BACKGROUND_MS + 20,
      }).publish,
    ).toBeNull();
  });
});

describe("stale load ownership", () => {
  it("rejects a superseded or unmounted generation", () => {
    expect(loadGenerationStillOwns(1, 1, true)).toBe(true);
    expect(loadGenerationStillOwns(1, 2, true)).toBe(false);
    expect(loadGenerationStillOwns(1, 1, false)).toBe(false);
  });
});

describe("Home recovery wiring", () => {
  it("keeps native resume on one listener and does not rotate default All", () => {
    const home = read("src/pages/HomePage.tsx");
    const resumeIdx = home.indexOf('App.addListener("resume"');
    expect(resumeIdx).toBeGreaterThan(-1);
    expect(home.indexOf('App.addListener("resume"', resumeIdx + 1)).toBe(-1);
    const resumeBlock = home.slice(resumeIdx, resumeIdx + 520);
    expect(resumeBlock).toContain("setHomeFeedSoftRefreshEpoch");
    expect(resumeBlock).not.toContain("runUnseenHomeReplacement");
    expect(resumeBlock).not.toContain("wrapTrueDefaultAllCycle");
    expect(home).toContain("!browseIsTrueDefaultAllRef.current");
    expect(home).toContain('type: "foreground"');
    expect(home).toContain('type: "online"');
    expect(home).toContain("if (isNativeApp()) return;");
    expect(home).not.toContain("@capacitor/network");
    expect(home).not.toContain("refreshSession");
    expect(home).not.toContain("startAutoRefresh");
  });

  it("vertical empty-error recovery matches manual Retry and rail waits a turn", () => {
    const feed = read("src/components/ProgressiveFeed.tsx");
    const rail = read("src/components/ProgressiveHorizontalRail.tsx");
    const posts = read("src/sections/home/HomePostsSection.tsx");
    expect(feed).toContain("home-recovery-retry");
    expect(feed).toContain("consumedRecoveryEpochRef.current = homeRecoveryEpoch");
    expect(feed).toContain("void loadMoreRef.current?.()");
    expect(feed).toMatch(
      /onRetry=\{\(\) => \{\s*setError\(null\);\s*loadMore\(\);/,
    );
    const recoveryAt = feed.indexOf("home-recovery-retry");
    const recoveryBlock = feed.slice(recoveryAt, recoveryAt + 500);
    expect(recoveryBlock).not.toContain("setTimeout");
    expect(rail).toContain("home-recovery-retry");
    expect(rail).toContain("window.setTimeout");
    expect(rail).toContain("if (items.length > 0 || !error) return;");
    expect(posts).toContain("homeRecoveryEpoch={homeRecoveryEpoch}");
    expect(read("src/sections/profile/OwnProfilePostsSection.tsx")).not.toContain(
      "homeRecoveryEpoch",
    );
  });

  it("success and failure both honor load generation", () => {
    const feed = read("src/components/ProgressiveFeed.tsx");
    const rail = read("src/components/ProgressiveHorizontalRail.tsx");
    expect(feed.split("loadGenerationStillOwns").length).toBeGreaterThan(4);
    expect(rail.split("loadGenerationStillOwns").length).toBeGreaterThan(3);
    expect(feed).toContain("if (attempt < 3)");
  });

  it("does not add a network package or change the feed RPC", () => {
    const pkg = read("package.json");
    const feedQuery = read("src/api/queries/getPublicFeed.ts");
    const manager = read("src/lib/requestManager.ts");
    expect(pkg).not.toContain("@capacitor/network");
    expect(feedQuery).toContain("get_feed_with_related_data");
    expect(feedQuery).not.toContain(".abortSignal(");
    expect(manager).not.toContain("refCount");
    expect(read("src/lib/supabaseClient.ts")).toContain("autoRefreshToken: true");
    expect(read("src/lib/supabaseClient.ts")).not.toContain("startAutoRefresh");
  });
});
