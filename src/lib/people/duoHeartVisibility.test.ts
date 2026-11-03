import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  duoHeartPressStartsConnect,
  markDuoInterestCleared,
  markDuoInterestExpressed,
  pairUpIngestExcludesExpressedInterest,
  visibleDuoCandidates,
} from "./duoHeartVisibility";

type Row = {
  opportunity_id: string;
  expressed_by_me: boolean;
  duo_commented_by_me: boolean | null;
};

function row(
  id: string,
  expressed: boolean,
  commented: boolean | null = false
): Row {
  return {
    opportunity_id: id,
    expressed_by_me: expressed,
    duo_commented_by_me: commented,
  };
}

describe("Duo pending heart visibility", () => {
  it("keeps an unmatched Duo heart visible and active", () => {
    const server = [row("opp-1", true), row("opp-2", false)];
    const visible = visibleDuoCandidates(server, new Set());
    expect(visible.map((item) => item.opportunity_id)).toEqual(["opp-1", "opp-2"]);
    expect(visible[0]?.expressed_by_me).toBe(true);
    expect(pairUpIngestExcludesExpressedInterest("my_plans", true)).toBe(false);
  });

  it("does not start Connect when the Duo heart is already active", () => {
    expect(duoHeartPressStartsConnect(true)).toBe(false);
    expect(duoHeartPressStartsConnect(false)).toBe(true);
  });

  it("restores the active heart from the refreshed server page", () => {
    const refreshed = visibleDuoCandidates(
      [row("opp-1", true), row("opp-2", false)],
      new Set()
    );
    expect(refreshed.find((item) => item.opportunity_id === "opp-1")?.expressed_by_me).toBe(
      true
    );
  });

  it("removes a confirmed match and does not keep a row the server dropped", () => {
    const before = [row("matched", true), row("expired", true), row("open", false)];
    const serverAfterMatch = before.filter((item) => item.opportunity_id !== "expired");
    const visible = visibleDuoCandidates(serverAfterMatch, new Set(["matched"]));
    expect(visible.map((item) => item.opportunity_id)).toEqual(["open"]);
  });

  it("marks one opportunity without changing another heart or its comment", () => {
    const next = markDuoInterestExpressed(
      [row("opp-1", false, true), row("opp-2", false, null)],
      "opp-1"
    );
    expect(next[0]).toEqual(row("opp-1", true, true));
    expect(next[1]).toEqual(row("opp-2", false, null));
    const cleared = markDuoInterestCleared(next, "opp-1");
    expect(cleared.map((item) => item.opportunity_id)).toEqual(["opp-1", "opp-2"]);
    expect(cleared[0]).toEqual(row("opp-1", false, true));
    expect(cleared[1]).toEqual(row("opp-2", false, null));
  });

  it("leaves Discover retention and comment wiring unchanged", () => {
    expect(pairUpIngestExcludesExpressedInterest("discover", true)).toBe(false);
    expect(pairUpIngestExcludesExpressedInterest("open_plans", true)).toBe(true);
    const root = join(__dirname, "../..");
    const overlay = readFileSync(join(root, "pages/people/MatchDeckOverlay.tsx"), "utf8");
    const runner = readFileSync(join(root, "lib/people/runMinePairUpConnect.ts"), "utf8");
    expect(overlay).toContain("duoHeartPressStartsConnect(target.expressed_by_me)");
    expect(overlay).toContain("withdrawDuoPairUpInterest");
    expect(overlay).toContain("runDuoHeartWithdrawal");
    expect(overlay).toContain("applyMatchedAndComplete");
    expect(overlay).toContain("completePairUpMatch");
    expect(overlay).toContain("withdrawDiscoverPairUpInterest");
    expect(overlay).toContain("duoCommentVisual");
    expect(runner).toContain("host.onDiscoverHeartExpressed?.(target.opportunity_id, true)");
    expect(runner).not.toContain(
      'host.applyUnmatchedRemoval(target.opportunity_id);\n      return "open";'
    );
  });
});
