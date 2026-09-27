import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PHASE_1_2_MIGRATION =
  "supabase/migrations/20260908023431_feed_range_occurrence_order.sql";

describe("Home Feed Phase 1.2 source guards", () => {
  it("local range-order migration keeps one post per card and does not replace Profile RPC", () => {
    const sql = read(PHASE_1_2_MIGRATION);
    expect(sql).toContain("LOCAL ONLY");
    expect(sql).toContain("SELECT DISTINCT p.id, p.created_at");
    expect(sql).toContain("eligible_ranked AS (");
    expect(sql).toContain("SELECT MIN(matches.match_day)");
    expect(sql).not.toMatch(/LEAST\s*\(/);
    expect(sql).toContain(
      "ORDER BY fp.earliest_match_day ASC NULLS LAST, fp.created_at DESC, fp.id DESC"
    );
    expect(sql).not.toMatch(
      /'earliest_match_day',\s*fp\.earliest_match_day/
    );
    expect(sql).toContain("Africa/Addis_Ababa");
    expect(sql).toContain("p_type IS NULL");
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/
    );
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS/i);
    expect(sql).not.toMatch(/^\s*DROP FUNCTION/im);
    expect(sql).not.toMatch(/elem::timestamptz\) >= now\(\)/);
  });

  it("HomePage closes the filter drawer when a filter action is applied", () => {
    const src = read("src/pages/HomePage.tsx");
    const applyBlock = src.slice(
      src.indexOf("const applyHomeFilterAction"),
      src.indexOf("const clearAllHomeFilters")
    );
    expect(applyBlock).toContain("setFiltersOpen(false)");
    expect(src).not.toContain("rankFilteredHome");
    expect(src).not.toContain("sortRangeOccurrences");
  });

  it("end-state is a feed-post block with circular owl avatar, caption, and one-row chips", () => {
    const src = read("src/components/home/HomeFilterEndState.tsx");
    expect(src).toContain("getOwlLogoPath");
    expect(src).not.toContain("btmtabicon.svg");
    expect(src).toContain("mt-4");
    expect(src).toContain("pt-4");
    expect(src).toContain("rounded-full");
    expect(src).not.toContain("rounded-2xl");
    expect(src).toContain("ring-amber-400/80");
    expect(src).toContain("translate-y-[2.5px]");
    expect(src).toContain("text-amber-500");
    expect(src).toContain("flex gap-3");
    expect(src).toContain("flex-nowrap");
    expect(src).toContain("width={40}");
    expect(src).toContain("text-[13px] leading-snug");
    expect(src).toContain("text-[var(--text)]/70");
    expect(src).toContain("text-[11px] font-semibold");
    expect(src).toContain("h-7 min-h-7");
    expect(src).toContain("PiPlus");
    expect(src).toContain("bg-[var(--text)]");
    expect(src).toContain("text-[var(--bg)]");
    expect(src).toContain("aria-label={primaryLabel}");
    expect(src).toContain("onClick={() => openChooser()}");
    expect(src).not.toContain("openChooser({");
    expect(src).not.toContain("bg-[var(--brand)]");
    expect(src).not.toContain("bg-yellow-500");
    expect(src).not.toContain("--brand-yellow");
    expect((src.match(/type="button"/g) ?? []).length).toBe(3);
    const secondaryIdx = src.indexOf("onClick={onSecondary}");
    const createIdx = src.indexOf("onClick={() => openChooser()}");
    const tertiaryIdx = src.indexOf("onClick={onTertiary}");
    expect(secondaryIdx).toBeGreaterThan(0);
    expect(createIdx).toBeGreaterThan(secondaryIdx);
    expect(tertiaryIdx).toBeGreaterThan(createIdx);
  });

  it("HomePostsSection still wires secondary filter action and Back to Feed", () => {
    const src = read("src/sections/home/HomePostsSection.tsx");
    expect(src).toContain(
      "onSecondary={() => onHomeFilterAction(filterEndCopy.secondaryAction)}"
    );
    expect(src).toContain("onTertiary={onBackToFeed}");
    expect(src).toContain(
      "onHomeFilterAction(filterExhaustedCopy.secondaryAction)"
    );
  });

  it("occurrence-filtered public feed still skips the legacy date sorter", () => {
    const src = read("src/api/queries/getPublicFeed.ts");
    expect(src).toContain("shouldApplyLegacyFeedDateSort");
    expect(src).not.toContain("sortByEarliestMatchDay");
    expect(src).not.toMatch(/^\s*const sortedData = sortFeedItems\(/m);
  });
});
