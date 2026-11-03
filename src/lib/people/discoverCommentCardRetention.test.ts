/**
 * Discover comment retention: one session row, no interest, Duo merge unchanged.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendDiscoverPage,
  applyDiscoverPageReplacement,
  clearDiscoverCommentRetention,
  releaseDiscoverCommentRetention,
  retainDiscoverCommentCandidate,
} from "../../hooks/usePairUpCandidates";
import type { PairUpCandidate } from "./types";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(
  id: string,
  name: string,
  expressed = false
): PairUpCandidate {
  return {
    opportunity_id: id,
    source_post_id: "post-1",
    creator_id: "creator-1",
    display_name: name,
    expressed_by_me: expressed,
  } as PairUpCandidate;
}

describe("Discover comment card retention", () => {
  it("keeps the commented row after a page-0 refresh and leaves the heart neutral", () => {
    clearDiscoverCommentRetention();
    const current = row("opp-1", "Ada");
    retainDiscoverCommentCandidate(current);
    const next = applyDiscoverPageReplacement(
      [current, row("opp-2", "Bea")],
      [row("opp-2", "Bea")],
      new Map([["opp-1", current]])
    );
    expect(next.map((item) => item.opportunity_id)).toEqual(["opp-1", "opp-2"]);
    expect(next[0]?.expressed_by_me).toBe(false);
    expect(next[0]?.display_name).toBe("Ada");
  });

  it("keeps a single row across repeated refreshes and prefers the server row", () => {
    const previous = row("opp-1", "Ada");
    const fresh = row("opp-1", "Ada updated");
    const once = applyDiscoverPageReplacement(
      [previous],
      [fresh, row("opp-3", "Cy")],
      new Map([["opp-1", previous]])
    );
    const twice = applyDiscoverPageReplacement(
      once,
      [fresh],
      new Map([["opp-1", previous]])
    );
    expect(twice).toHaveLength(1);
    expect(twice[0]?.display_name).toBe("Ada updated");
    expect(twice[0]?.expressed_by_me).toBe(false);
  });

  it("does not duplicate a retained row when the next page arrives", () => {
    const retained = row("opp-1", "Ada");
    const page = applyDiscoverPageReplacement(
      [retained],
      [row("opp-2", "Bea")],
      new Map([["opp-1", retained]])
    );
    const more = appendDiscoverPage(page, [retained, row("opp-4", "Dee")]);
    expect(more.map((item) => item.opportunity_id)).toEqual([
      "opp-1",
      "opp-2",
      "opp-4",
    ]);
  });

  it("drops a released match on the next replace and clears on session reset", () => {
    const current = row("opp-1", "Ada");
    retainDiscoverCommentCandidate(current);
    releaseDiscoverCommentRetention("opp-1");
    const afterMatch = applyDiscoverPageReplacement(
      [current],
      [],
      new Map()
    );
    expect(afterMatch).toEqual([]);

    retainDiscoverCommentCandidate(current);
    clearDiscoverCommentRetention();
    const afterReset = applyDiscoverPageReplacement([current], [], new Map());
    expect(afterReset).toEqual([]);
  });

  it("notifies Discover only after a new comment joins the pool", () => {
    const composer = read("components/people/PeopleCommentComposerOverlay.tsx");
    const failedSend = composer.indexOf("if (!result.ok)");
    const joined = composer.indexOf("noteConfirmedDuoComment({");
    expect(failedSend).toBeGreaterThan(-1);
    expect(joined).toBeGreaterThan(failedSend);
    expect(composer).toContain("onDiscoverCommentJoined?.(commentOpportunityId)");
    expect(composer).not.toContain("onAfterMessageDelivered?.(");
    expect(composer).not.toContain("runPairUpConnectForTarget");
    expect(composer).not.toContain("expressed_by_me: true");
  });

  it("wires retention in Discover and still removes completed matches", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const hook = read("hooks/usePairUpCandidates.ts");
    expect(overlay).toContain("onDiscoverCommentJoined");
    expect(overlay).toContain("retainDiscoverCommentCandidate(row)");
    expect(overlay).toContain("onAfterMessageDelivered");
    expect(overlay).toContain('scope === "discover" && !row.expressed_by_me');
    expect(overlay).toContain(
      'if (scope === "discover") releaseDiscoverCommentRetention(leavingId);'
    );
    expect(overlay).toContain("!removedIds.has(row.opportunity_id)");
    expect(hook).toContain("mergeMyPlansDeckPage(prev, page.candidates)");
    expect(hook).toContain("clearDiscoverCommentRetention()");
    expect(hook).toContain("applyDiscoverPageReplacement");
    expect(hook).not.toContain("localStorage");
  });
});
