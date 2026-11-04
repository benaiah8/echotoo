import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDiscoverPage,
  applyDiscoverServerPage,
  mergeDiscoverSoftRevalidate,
} from "../../hooks/usePairUpCandidates";
import {
  discoverDiagMeasureRender,
  discoverSoftRevalidatePreservesTail,
} from "./discoverCompletenessDiag";
import { groupDiscoverOpportunities } from "./groupDiscoverOpportunities";
import { shouldLoadMoreForEmptyWindow } from "./matchDeckNavigation";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function cand(
  opportunity_id: string,
  creator_id: string,
  extras: Partial<{ expressed_by_me: boolean }> = {}
) {
  return {
    opportunity_id,
    source_post_id: `src-${creator_id}`,
    creator_id,
    description: null,
    discoverable_until: "2099-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    display_name: null,
    username: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    expressed_by_me: extras.expressed_by_me === true,
    duo_match_state: "none" as const,
    duo_commented_by_me: null,
    viewer_has_active_pair_up: null,
    profile_id: null,
    bio: null,
    source_caption: null,
    source_type: "hangout" as const,
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: null,
    source_recurrence_days: null,
  };
}

describe("Discover completeness — soft revalidate must not drop pagination tail", () => {
  it("page1 20/2 creators + page2 new creators survive soft page-0 revalidate", () => {
    const page1 = [
      ...Array.from({ length: 10 }, (_, i) => cand(`a${i}`, "ben")),
      ...Array.from({ length: 10 }, (_, i) => cand(`b${i}`, "other")),
    ];
    const page2 = [
      cand("c1", "creator3"),
      cand("c2", "creator4"),
      cand("c3", "creator5"),
    ];
    const firstPageIds = new Set(page1.map((r) => r.opportunity_id));
    const afterLoadMore = appendDiscoverPage(page1, page2);
    expect(afterLoadMore).toHaveLength(23);

    const broken = applyDiscoverServerPage(afterLoadMore, page1, 1);
    expect(broken.map((r) => r.opportunity_id)).not.toContain("c1");

    const fixed = mergeDiscoverSoftRevalidate(
      afterLoadMore,
      page1,
      firstPageIds,
      1
    );
    expect(fixed.map((r) => r.opportunity_id)).toEqual(
      expect.arrayContaining(["c1", "c2", "c3", "a0", "b0"])
    );
    expect(fixed).toHaveLength(23);

    const pure = discoverSoftRevalidatePreservesTail({
      previous: afterLoadMore,
      page0: page1,
      firstPageIds,
    });
    expect(pure.map((r) => r.creator_id)).toEqual(
      expect.arrayContaining(["creator3", "creator4", "creator5"])
    );
  });

  it("filtered-empty window still requests more while hasMore", () => {
    expect(
      shouldLoadMoreForEmptyWindow({
        visibleCount: 0,
        hasMore: true,
        loadMoreInFlight: false,
      })
    ).toBe(true);
    expect(
      shouldLoadMoreForEmptyWindow({
        visibleCount: 0,
        hasMore: false,
        loadMoreInFlight: false,
      })
    ).toBe(false);
  });

  it("render path surfaces page-2 creators after append + grouping", () => {
    const page1 = [
      ...Array.from({ length: 10 }, (_, i) => cand(`a${i}`, "ben")),
      ...Array.from({ length: 10 }, (_, i) => cand(`b${i}`, "other")),
    ];
    const page2 = [cand("c1", "creator3"), cand("d1", "creator4")];
    const merged = appendDiscoverPage(page1, page2);
    const appearances = groupDiscoverOpportunities(merged);
    const creators = new Set(
      appearances.flatMap((a) => a.opportunities.map((o) => o.creator_id))
    );
    expect(creators.has("creator3")).toBe(true);
    expect(creators.has("creator4")).toBe(true);

    const diag = discoverDiagMeasureRender({
      received: merged,
      afterFilter: merged,
      removedOrRetiredIds: [],
      hasMore: false,
    });
    expect(diag.received).toBe(22);
    expect(diag.creatorsAfterFilter).toBe(4);
    expect(diag.renderedOpportunityCount).toBe(22);
    expect(diag.uiThinksEnd).toBe(true);
  });

  it("wires soft-tail preserve + diagnostics into the active Discover path", () => {
    const hook = read("hooks/usePairUpCandidates.ts");
    expect(hook).toContain("mergeDiscoverSoftRevalidate");
    expect(hook).toContain("preserveTail");
    expect(hook).toContain("discoverDiagNotePage");
    expect(hook).toContain("discoverFirstPageIdsRef");

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("discoverDiagMeasureRender");
    expect(overlay).toContain("accountDeckUserRef");
    expect(overlay).toContain("orderDiscoverCandidates");

    const page = read("pages/people/PeoplePage.tsx");
    expect(page).toContain("PAIR_UP_DECK_KIND_DISCOVER");
    expect(page).toContain("MatchDeckOverlay");
    expect(page).toContain("usePairUpCandidates");
  });
});
