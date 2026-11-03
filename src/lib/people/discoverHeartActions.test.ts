/**
 * Discover Heart connect, withdrawal, and refresh reconciliation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyDiscoverPageReplacement,
  applyDiscoverServerPage,
  clearDiscoverCommentRetention,
} from "../../hooks/usePairUpCandidates";
import type { PairUpCandidate } from "./types";
import {
  isDiscoverInterestMatchedError,
  runDiscoverHeartAction,
} from "./discoverHeartActions";
import {
  markDiscoverHeartUnavailable,
  readDiscoverHeartPhase,
  resetDiscoverHeartStateForTests,
  setDiscoverHeartViewer,
  startDiscoverHeartListFetch,
} from "./discoverHeartState";

function row(
  id: string,
  expressed = false,
  extras: Partial<PairUpCandidate> = {}
): PairUpCandidate {
  return {
    opportunity_id: id,
    source_post_id: "post-1",
    creator_id: "creator-1",
    display_name: id,
    expressed_by_me: expressed,
    duo_commented_by_me: false,
    viewer_has_active_pair_up: true,
    ...extras,
  } as PairUpCandidate;
}

describe("discover heart actions", () => {
  beforeEach(() => {
    resetDiscoverHeartStateForTests();
    setDiscoverHeartViewer("viewer-1");
    clearDiscoverCommentRetention();
  });

  it("connects an idle heart and keeps that opportunity active", async () => {
    const connect = vi.fn(async () => "open" as const);
    const result = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect,
      withdraw: vi.fn(),
    });
    expect(result).toEqual({ type: "connected" });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(readDiscoverHeartPhase("opp-1", false)).toBe("active");
    expect(readDiscoverHeartPhase("opp-2", false)).toBe("idle");
  });

  it("removes a matched connect from local heart state", async () => {
    const result = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect: async () => "matched",
      withdraw: vi.fn(),
    });
    expect(result.type).toBe("matched");
    expect(readDiscoverHeartPhase("opp-1", false)).toBe("idle");
  });

  it("withdraws an active heart without requiring a pool change", async () => {
    const withdraw = vi.fn(async () => ({ withdrawn: true }));
    const result = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: true,
      connect: vi.fn(),
      withdraw,
    });
    expect(result).toEqual({ type: "withdrawn", withdrawn: true });
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(readDiscoverHeartPhase("opp-1", true)).toBe("idle");
  });

  it("keeps the active heart when withdrawal fails or the interest is matched", async () => {
    const failed = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: true,
      connect: vi.fn(),
      withdraw: async () => {
        throw new Error("network");
      },
    });
    expect(failed).toEqual({ type: "failed", stale: false });
    expect(readDiscoverHeartPhase("opp-1", true)).toBe("active");

    const matched = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: true,
      connect: vi.fn(),
      withdraw: async () => {
        throw new Error("Discover interest is matched");
      },
    });
    expect(matched.type).toBe("matched-interest");
    expect(isDiscoverInterestMatchedError(new Error("Discover interest is matched"))).toBe(
      true
    );
    expect(readDiscoverHeartPhase("opp-1", true)).toBe("active");
  });

  it("ignores a duplicate tap and keeps other opportunities independent", async () => {
    const gate: { release: () => void } = {
      release: () => {
        throw new Error("connect did not start");
      },
    };
    const first = runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect: () =>
        new Promise((resolve) => {
          gate.release = () => resolve("open");
        }),
      withdraw: vi.fn(),
    });
    const duplicate = await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect: vi.fn(async () => "open" as const),
      withdraw: vi.fn(),
    });
    const other = runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-2",
      serverExpressed: false,
      connect: async () => "open",
      withdraw: vi.fn(),
    });
    expect(duplicate.type).toBe("ignored");
    expect(readDiscoverHeartPhase("opp-1", false)).toBe("pending");
    expect(readDiscoverHeartPhase("opp-2", false)).toBe("pending");
    gate.release();
    await first;
    await other;
    expect(readDiscoverHeartPhase("opp-1", false)).toBe("active");
    expect(readDiscoverHeartPhase("opp-2", false)).toBe("active");
  });

  it("does not change comment or pool fields while reconciling the heart", () => {
    const fetchSeq = startDiscoverHeartListFetch();
    const current = row("opp-1", false, {
      duo_commented_by_me: true,
      viewer_has_active_pair_up: true,
    });
    const confirmed = runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect: async () => "open",
      withdraw: vi.fn(),
    });
    return confirmed.then(() => {
      const stale = row("opp-1", false, {
        duo_commented_by_me: true,
        viewer_has_active_pair_up: true,
        display_name: "Server",
      });
      const next = applyDiscoverServerPage([current], [stale], fetchSeq);
      expect(next[0]?.expressed_by_me).toBe(true);
      expect(next[0]?.duo_commented_by_me).toBe(true);
      expect(next[0]?.viewer_has_active_pair_up).toBe(true);
      expect(next[0]?.display_name).toBe("Server");
    });
  });

  it("keeps a confirmed heart across a stale page and follows a later server page", async () => {
    const staleSeq = startDiscoverHeartListFetch();
    await runDiscoverHeartAction({
      viewerId: "viewer-1",
      opportunityId: "opp-1",
      serverExpressed: false,
      connect: async () => "open",
      withdraw: vi.fn(),
    });
    const held = applyDiscoverServerPage(
      [row("opp-1", true)],
      [row("opp-2", false)],
      staleSeq
    );
    expect(held.map((item) => item.opportunity_id)).toEqual(["opp-1", "opp-2"]);

    const freshSeq = startDiscoverHeartListFetch();
    const dropped = applyDiscoverServerPage(
      held,
      [row("opp-2", false)],
      freshSeq
    );
    expect(dropped.map((item) => item.opportunity_id)).toEqual(["opp-2"]);
    const visible = applyDiscoverPageReplacement(dropped, [row("opp-2")], new Map());
    expect(visible).toHaveLength(1);
  });

  it("clears heart state for a different viewer and can mark one heart unavailable", () => {
    markDiscoverHeartUnavailable("viewer-1", "opp-1");
    expect(readDiscoverHeartPhase("opp-1", true)).toBe("unavailable");
    setDiscoverHeartViewer("viewer-2");
    expect(readDiscoverHeartPhase("opp-1", false)).toBe("idle");
  });

  it("keeps Duo connect removal and does not withdraw through leave_pair_up", () => {
    const root = join(__dirname, "../..");
    const overlay = readFileSync(join(root, "pages/people/MatchDeckOverlay.tsx"), "utf8");
    const api = readFileSync(join(root, "api/services/pairUp.ts"), "utf8");
    const runner = readFileSync(join(root, "lib/people/runMinePairUpConnect.ts"), "utf8");
    const withdrawAt = api.indexOf("export async function withdrawDiscoverPairUpInterest");
    expect(withdrawAt).toBeGreaterThan(-1);
    expect(api.slice(withdrawAt)).not.toContain("leave_pair_up");
    expect(overlay).toContain("withdrawDiscoverPairUpInterest");
    expect(overlay).toContain("heartAlreadyPending: discoverHeart");
    expect(overlay).toContain("pairUpIngestExcludesExpressedInterest");
    expect(overlay).toContain("duoHeartPressStartsConnect");
    expect(runner).toContain('scope === "discover"');
    expect(runner).toContain("host.applyUnmatchedRemoval(target.opportunity_id)");
    expect(overlay).not.toContain("leave_pair_up");
    expect(overlay).toContain("duoCommentedByMe");
    expect(overlay).not.toContain("noteConfirmedDuoComment");
  });
});
