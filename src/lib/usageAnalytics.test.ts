import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  configureUsageAnalyticsForTests,
  flushUsageQueue,
  resetUsageAnalyticsForTests,
  setUsageAnalyticsUserForTests,
  trackAppActive,
  trackPeopleDestination,
  trackPeopleVisit,
  trackPostDetailOpen,
  trackProfileView,
  trackUsage,
  USAGE_BATCH_LIMIT,
  USAGE_FLUSH_INTERVAL_MS,
  USAGE_MAX_ATTEMPTS,
  usageQueueForTests,
} from "./usageAnalytics";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function memoryStorage() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
  };
}

function setup(now = 1_700_000_000_000) {
  const storage = memoryStorage();
  const rpc = vi.fn(
    async (_events: { metric: string; dedupe_id: string }[]) => undefined
  );
  let clock = now;
  let n = 0;
  configureUsageAnalyticsForTests({
    now: () => clock,
    rpc,
    storage,
    randomId: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
    getUserId: async () => null,
  });
  return {
    storage,
    rpc,
    setNow: (value: number) => {
      clock = value;
    },
  };
}

afterEach(() => {
  resetUsageAnalyticsForTests();
  vi.useRealTimers();
});

describe("usage queue", () => {
  it("does not send on each event and flushes at most 20", async () => {
    const { rpc } = setup();
    setUsageAnalyticsUserForTests("user-a");
    for (let i = 0; i < 25; i += 1) trackUsage("post_save");
    expect(rpc).not.toHaveBeenCalled();
    expect(usageQueueForTests()).toHaveLength(25);

    await flushUsageQueue();
    expect(rpc).toHaveBeenCalledTimes(1);
    const first = rpc.mock.calls[0]?.[0] ?? [];
    expect(first).toHaveLength(USAGE_BATCH_LIMIT);
    expect(first.every((row) => Object.keys(row).sort().join() === "dedupe_id,metric")).toBe(
      true
    );
    expect(usageQueueForTests()).toHaveLength(5);

    await flushUsageQueue();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]?.[0]).toHaveLength(5);
    expect(usageQueueForTests()).toHaveLength(0);
  });

  it("keeps the same dedupe id across a failed flush", async () => {
    const { rpc } = setup();
    setUsageAnalyticsUserForTests("user-a");
    trackUsage("duo_express");
    const firstId = usageQueueForTests()[0]?.dedupeId;
    rpc.mockRejectedValueOnce(new Error("offline"));

    await expect(flushUsageQueue()).resolves.toBeUndefined();
    expect(usageQueueForTests()).toEqual([
      expect.objectContaining({ dedupeId: firstId, attempts: 1, metric: "duo_express" }),
    ]);

    await flushUsageQueue();
    const retried = rpc.mock.calls[1]?.[0] ?? [];
    expect(retried[0]?.dedupe_id).toBe(firstId);
    expect(usageQueueForTests()).toHaveLength(0);
  });

  it("drops an event after 3 failed attempts", async () => {
    const { rpc } = setup();
    setUsageAnalyticsUserForTests("user-a");
    trackUsage("post_unsave");
    rpc.mockRejectedValue(new Error("offline"));

    for (let i = 0; i < USAGE_MAX_ATTEMPTS; i += 1) {
      await flushUsageQueue();
    }

    expect(rpc).toHaveBeenCalledTimes(USAGE_MAX_ATTEMPTS);
    expect(usageQueueForTests()).toHaveLength(0);
    expect(() => trackUsage("post_save")).not.toThrow();
  });

  it("does not send one account's events under another session", async () => {
    const { rpc, storage } = setup();
    setUsageAnalyticsUserForTests("user-a");
    trackUsage("people_visit");
    trackUsage("tab_duo");
    const savedA = storage.rows.get("echotoo_usage_outbox_v1:user-a");

    setUsageAnalyticsUserForTests("user-b");
    trackUsage("tab_discover");
    await flushUsageQueue();

    const sent = rpc.mock.calls[0]?.[0] ?? [];
    expect(sent.map((row) => row.metric)).toEqual(["tab_discover"]);
    expect(storage.rows.get("echotoo_usage_outbox_v1:user-a")).toBe(savedA);

    setUsageAnalyticsUserForTests("user-a");
    expect(usageQueueForTests().map((item) => item.metric)).toEqual([
      "people_visit",
      "tab_duo",
    ]);
  });

  it("counts app active once per UTC day and collapses rapid repeats", () => {
    const { setNow } = setup(Date.parse("2026-11-10T00:00:00.000Z"));
    setUsageAnalyticsUserForTests("user-a");

    trackAppActive("user-a");
    trackAppActive("user-a");
    trackPeopleVisit();
    trackPeopleVisit();
    trackPeopleDestination("discover");
    trackPeopleDestination("discover");
    trackPostDetailOpen("post-1");
    trackPostDetailOpen("post-1");
    trackProfileView("me");
    trackProfileView("Ada");
    trackProfileView("Ada");

    const metrics = usageQueueForTests().map((item) => item.metric);
    expect(metrics).toEqual([
      "app_active",
      "people_visit",
      "tab_discover",
      "post_detail_open",
      "profile_view",
    ]);
    expect(JSON.stringify(usageQueueForTests())).not.toContain("post-1");
    expect(JSON.stringify(usageQueueForTests())).not.toContain("Ada");

    setNow(Date.parse("2026-11-10T00:00:00.500Z"));
    trackPostDetailOpen("post-2");
    trackPeopleDestination("duo");
    expect(usageQueueForTests().map((item) => item.metric)).toEqual([
      "app_active",
      "people_visit",
      "tab_discover",
      "post_detail_open",
      "profile_view",
      "post_detail_open",
      "tab_duo",
    ]);

    setNow(Date.parse("2026-11-11T00:00:00.000Z"));
    trackAppActive("user-a");
    expect(
      usageQueueForTests().filter((item) => item.metric === "app_active")
    ).toHaveLength(2);
  });

  it("schedules a full batch without waiting the idle interval", () => {
    vi.useFakeTimers();
    setup();
    setUsageAnalyticsUserForTests("user-a");
    const spy = vi.spyOn(globalThis, "setTimeout");
    for (let i = 0; i < USAGE_BATCH_LIMIT; i += 1) trackUsage("duo_withdraw");
    const delays = spy.mock.calls.map((call) => Number(call[1]));
    expect(delays[delays.length - 1]).toBe(0);
    expect(delays.every((delay) => delay <= USAGE_FLUSH_INTERVAL_MS)).toBe(true);
    spy.mockRestore();
  });
});

describe("usage tracking stays on successful product actions", () => {
  const pairUp = read("src/api/services/pairUp.ts");
  const saved = read("src/api/services/savedPosts.ts");

  it("records Duo express, withdraw, and complete only after the RPC succeeds", () => {
    const express = pairUp.slice(
      pairUp.indexOf("export async function expressPairUpInterest"),
      pairUp.indexOf("export async function connectDiscoverPairUp")
    );
    const discover = pairUp.slice(
      pairUp.indexOf("export async function connectDiscoverPairUp"),
      pairUp.indexOf("export async function completePairUpMatch")
    );
    const complete = pairUp.slice(
      pairUp.indexOf("export async function completePairUpMatch"),
      pairUp.indexOf("export async function withdrawDiscoverPairUpInterest")
    );
    const discoverWithdraw = pairUp.slice(
      pairUp.indexOf("export async function withdrawDiscoverPairUpInterest"),
      pairUp.indexOf("export async function withdrawDuoPairUpInterest")
    );
    const duoWithdraw = pairUp.slice(
      pairUp.indexOf("export async function withdrawDuoPairUpInterest")
    );

    expect(express.indexOf('throw new Error("Express failed")')).toBeLessThan(
      express.indexOf('trackUsage("duo_express")')
    );
    expect(discover).not.toContain("trackUsage");
    expect(complete.indexOf("row?.created === true")).toBeLessThan(
      complete.indexOf('trackUsage("duo_complete")')
    );
    expect(discoverWithdraw).not.toContain("trackUsage");
    expect(duoWithdraw.indexOf("row.withdrawn === true")).toBeLessThan(
      duoWithdraw.indexOf('trackUsage("duo_withdraw")')
    );
    for (const body of [express, complete, duoWithdraw]) {
      const catchAt = body.indexOf("/* analytics must not affect");
      expect(catchAt).toBeGreaterThan(body.indexOf("trackUsage("));
      expect(body.slice(catchAt, catchAt + 180)).not.toContain("throw ");
    }
  });

  it("records saves only after the write succeeds and leaves other product services alone", () => {
    const save = saved.slice(
      saved.indexOf("export async function savePost"),
      saved.indexOf("export async function unsavePost")
    );
    const unsave = saved.slice(saved.indexOf("export async function unsavePost"));
    expect(save.indexOf("if (!error)")).toBeLessThan(save.indexOf('trackUsage("post_save")'));
    expect(save).not.toContain('trackUsage("post_save",');
    expect(unsave.indexOf("if (!error)")).toBeLessThan(
      unsave.indexOf('trackUsage("post_unsave")')
    );
    expect(unsave.indexOf("trackUsage")).toBeGreaterThan(unsave.indexOf(".delete()"));
    expect(save).toContain("/* analytics must not affect save */");
    expect(unsave).toContain("/* analytics must not affect unsave */");
    expect(save.slice(save.indexOf("catch {"))).not.toMatch(/throw /);

    for (const rel of [
      "src/api/services/comments.ts",
      "src/api/services/openPlans.ts",
      "src/api/services/groupUp.ts",
    ]) {
      expect(read(rel)).not.toContain("usageAnalytics");
    }
  });

  it("wires visits, tabs, detail opens, and profile views without sending their keys", () => {
    const people = read("src/pages/people/PeoplePage.tsx");
    const overlay = read("src/pages/people/MatchDeckOverlay.tsx");
    const detail = read("src/components/PostDetailModal.tsx");
    const profile = read("src/pages/OtherProfilePage.tsx");
    const app = read("src/App.tsx");

    expect(people).toContain("trackPeopleVisit()");
    expect(overlay).toContain("trackPeopleDestination(destination)");
    expect(overlay).toContain("USAGE_DESTINATION_SETTLE_MS");
    expect(overlay).not.toContain('trackUsage("duo_express")');
    expect(detail).toContain("trackPostDetailOpen(postId)");
    expect(profile).toContain('name.toLowerCase() === "me"');
    expect(profile).toContain("trackProfileView(name)");
    expect(profile).toContain("isOtherProfileTabVisible");
    expect(app).toContain("<UsageAnalyticsMount />");
  });
});
