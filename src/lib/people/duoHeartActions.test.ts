import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  duoHeartPressKind,
  resetDuoHeartPressForTests,
  runDuoHeartWithdrawal,
} from "./duoHeartActions";
import { visibleDuoCandidates } from "./duoHeartVisibility";

beforeEach(() => {
  resetDuoHeartPressForTests();
});

describe("Duo heart withdrawal", () => {
  it("connects an idle heart and withdraws an active heart", () => {
    expect(
      duoHeartPressKind({
        expressedByMe: false,
        completionLocked: false,
        pending: false,
      })
    ).toBe("connect");
    expect(
      duoHeartPressKind({
        expressedByMe: true,
        completionLocked: false,
        pending: false,
      })
    ).toBe("withdraw");
  });

  it("routes match states without withdrawing a mutual or completed heart", () => {
    expect(
      duoHeartPressKind({
        expressedByMe: false,
        matchState: "none",
        completionLocked: false,
        pending: false,
      })
    ).toBe("connect");
    expect(
      duoHeartPressKind({
        expressedByMe: true,
        matchState: "outgoing",
        completionLocked: false,
        pending: false,
      })
    ).toBe("withdraw");
    expect(
      duoHeartPressKind({
        expressedByMe: true,
        matchState: "mutual_pending",
        completionLocked: false,
        pending: false,
      })
    ).toBe("complete");
    expect(
      duoHeartPressKind({
        expressedByMe: true,
        matchState: "completed",
        completionLocked: false,
        pending: false,
      })
    ).toBe("blocked");
  });

  it("does not withdraw mutual_pending or completed hearts through the withdrawal path", async () => {
    let called = false;
    const mutual = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      matchState: "mutual_pending",
      completionLocked: false,
      withdraw: async () => {
        called = true;
        return { withdrawn: true };
      },
    });
    expect(mutual).toEqual({ type: "ignored" });
    const completed = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      matchState: "completed",
      completionLocked: false,
      withdraw: async () => {
        called = true;
        return { withdrawn: true };
      },
    });
    expect(completed).toEqual({ type: "ignored" });
    expect(called).toBe(false);
  });

  it("withdraws an active heart and accepts an already-withdrawn result", async () => {
    const calls: string[] = [];
    const first = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        calls.push("withdraw");
        return { withdrawn: true };
      },
    });
    expect(first).toEqual({ type: "withdrawn", withdrawn: true });
    const second = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        calls.push("again");
        return { withdrawn: false };
      },
    });
    expect(second).toEqual({ type: "withdrawn", withdrawn: false });
    expect(calls).toEqual(["withdraw", "again"]);
  });

  it("does not withdraw while a match is completing", async () => {
    let called = false;
    const result = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: true,
      withdraw: async () => {
        called = true;
        return { withdrawn: true };
      },
    });
    expect(result).toEqual({ type: "ignored" });
    expect(called).toBe(false);
    expect(
      duoHeartPressKind({
        expressedByMe: true,
        completionLocked: true,
        pending: false,
      })
    ).toBe("blocked");
  });

  it("keeps a matched interest and a Discover-sourced interest", async () => {
    const matched = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        throw new Error("Duo interest is matched");
      },
    });
    expect(matched).toEqual({ type: "matched-interest" });
    const discoverSourced = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        throw new Error("Not a Duo interest");
      },
    });
    expect(discoverSourced).toEqual({ type: "discover-sourced" });
  });

  it("keeps the candidate when the server still lists it without interest", () => {
    const visible = visibleDuoCandidates(
      [
        { opportunity_id: "opp-1", expressed_by_me: false },
        { opportunity_id: "opp-2", expressed_by_me: true },
      ],
      new Set()
    );
    expect(visible.map((row) => row.opportunity_id)).toEqual(["opp-1", "opp-2"]);
  });

  it("blocks a second tap while the first withdrawal is pending", async () => {
    let release: (value: { withdrawn: boolean }) => void = () => {};
    const first = runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const second = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        throw new Error("duplicate");
      },
    });
    expect(second).toEqual({ type: "ignored" });
    release({ withdrawn: true });
    await expect(first).resolves.toEqual({ type: "withdrawn", withdrawn: true });
  });

  it("drops a result when the viewer changes", async () => {
    let viewer: string | null = "viewer-1";
    const result = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => viewer,
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        viewer = "viewer-2";
        return { withdrawn: true };
      },
    });
    expect(result).toEqual({ type: "ignored" });
  });

  it("classifies a stale opportunity without clearing a matched heart", async () => {
    const result = await runDuoHeartWithdrawal({
      viewerId: "viewer-1",
      liveViewerId: () => "viewer-1",
      opportunityId: "opp-1",
      expressedByMe: true,
      completionLocked: false,
      withdraw: async () => {
        throw new Error("Target is not an active Pair Up");
      },
    });
    expect(result).toEqual({ type: "failed", stale: true });
  });

  it("keeps Discover withdrawal and comments on their own paths", () => {
    const root = join(__dirname, "../..");
    const overlay = readFileSync(join(root, "pages/people/MatchDeckOverlay.tsx"), "utf8");
    const api = readFileSync(join(root, "api/services/pairUp.ts"), "utf8");
    const duoAt = api.indexOf("export async function withdrawDuoPairUpInterest");
    const discoverAt = api.indexOf("export async function withdrawDiscoverPairUpInterest");
    expect(duoAt).toBeGreaterThan(discoverAt);
    expect(api.slice(duoAt)).toContain("withdraw_duo_pair_up_interest");
    expect(api.slice(duoAt)).not.toContain("withdraw_discover_pair_up_interest");
    expect(api.slice(duoAt)).not.toContain("leave_pair_up");
    expect(overlay).toContain("withdrawDiscoverPairUpInterest");
    expect(overlay).toContain("duoCommentVisual");
    const duoHandler = overlay.slice(
      overlay.indexOf("const withdrawDuoHeart"),
      overlay.indexOf("const handleConnect")
    );
    expect(duoHandler).toContain("withdrawDuoPairUpInterest");
    expect(duoHandler).not.toContain("withdrawDiscoverPairUpInterest");
  });
});
