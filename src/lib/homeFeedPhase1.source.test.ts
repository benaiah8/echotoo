import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Home Feed Phase 1 source guards", () => {
  it("Profile Created path still has no filterExpiredHangouts", () => {
    const src = read("src/api/queries/getUserPostsCreated.ts");
    expect(src).not.toContain("filterExpiredHangouts");
  });

  it("HomePage no longer calls resolveDateSpotlightWithFallback", () => {
    const src = read("src/pages/HomePage.tsx");
    expect(src).not.toContain("resolveDateSpotlightWithFallback");
    expect(src).not.toContain("runFriendsPreflight");
  });

  it("filtered Home does not introduce a ranking sorter", () => {
    const src = read("src/pages/HomePage.tsx");
    expect(src).toContain("personalizeFeedBatch");
    expect(src).toContain("shouldPersonalizeHomeVerticalFeed");
    expect(src).not.toContain("rankFilteredHome");
    expect(src).not.toContain("reorderFiltered");
  });

  it("end-state Create CTA calls openChooser with no extra args", () => {
    const src = read("src/components/home/HomeFilterEndState.tsx");
    expect(src).toContain("onClick={() => openChooser()}");
    expect(src).not.toContain("openChooser({");
    expect(src).not.toContain("/create/finalize");
    expect(src).not.toContain("bg-[var(--brand)]");
    expect(src).toContain("getOwlLogoPath");
    expect(src).not.toContain("btmtabicon.svg");
    expect(src).toContain("mt-4");
    expect(src).toContain("ring-amber-400/80");
    expect(src).toContain("text-amber-500");
    expect(src).toContain("aria-label={primaryLabel}");
    expect(src).toContain("<PiPlus");
    expect(src).toContain("bg-[var(--text)]");
    expect(src).toContain("text-[var(--bg)]");
  });

  it("occurrence-filtered public feed skips unconditional sortFeedItems", () => {
    const src = read("src/api/queries/getPublicFeed.ts");
    expect(src).toContain("shouldApplyLegacyFeedDateSort");
    expect(src).not.toMatch(
      /^\s*const sortedData = sortFeedItems\(/m
    );
  });

  it("ProgressiveFeed keeps default exhausted copy when no exhaustedSurface", () => {
    const src = read("src/components/ProgressiveFeed.tsx");
    expect(src).toContain("You're all caught up! No more posts to show.");
    expect(src).toContain("exhaustedSurface");
    expect(src).toContain("emptySurface");
  });

  it("local migration keeps ORDER BY created_at DESC, id DESC and does not replace Profile RPC", () => {
    const sql = read(
      "supabase/migrations/20260908002731_feed_hangout_calendar_day_eligibility.sql"
    );
    expect(sql).toContain("LOCAL ONLY");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(sql).toContain("Africa/Addis_Ababa");
    expect(sql).toContain("p_type IS NULL");
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/
    );
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS/i);
    expect(sql).not.toMatch(/^\s*DROP FUNCTION/im);
    expect(sql).not.toMatch(/elem::timestamptz\) >= now\(\)/);
  });
});
