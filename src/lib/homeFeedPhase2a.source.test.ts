import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PHASE_2A =
  "supabase/migrations/20260909011556_feed_phase2a_filtered_ranking.sql";
const PHASE_1_2_HOTFIX =
  "supabase/migrations/20260908172915_feed_fix_duo_own_active_viewer_guard.sql";

const REL_RANK = [
  "      CASE",
  "        WHEN v_viewer_profile_id IS NULL THEN 3",
  "        WHEN v_viewer_profile_id = author_profile.id THEN 0",
  "        WHEN mutual_follow.status = 'approved'",
  "             AND reverse_follow.status = 'approved'",
  "        THEN 1",
  "        WHEN mutual_follow.status = 'approved' THEN 2",
  "        ELSE 3",
  "      END AS rel_rank",
].join("\n");

const DUO_OWN_ACTIVE = [
  "      CASE",
  "        WHEN p_viewer_user_id IS NULL THEN NULL",
  "        WHEN p.type = 'hangout' THEN (viewer_pair_own.source_post_id IS NOT NULL)",
  "        WHEN p.type = 'experience' THEN (viewer_open_plan_own.source_post_id IS NOT NULL)",
  "        ELSE false",
  "      END AS duo_own_active",
].join("\n");

describe("Home Feed Phase 2A source guards", () => {
  it("reuses one local-only get_feed_with_related_data based on 08172915", () => {
    const sql = read(PHASE_2A);
    const base = read(PHASE_1_2_HOTFIX);
    expect(sql).toContain("LOCAL ONLY — DO NOT APPLY");
    expect(sql).toContain("20260908172915_feed_fix_duo_own_active_viewer_guard.sql");
    expect(sql).toContain("Do NOT use 20260919120000 or 20260924120000");
    expect(sql).toContain("Africa/Addis_Ababa");
    expect(sql).toContain("p_type IS NULL");
    expect(sql).toContain("eligible_ranked AS (");
    expect(sql).toContain("earliest_match_day");
    expect(base).toContain("SELECT DISTINCT p.id, p.created_at");
    expect(sql).toContain("SELECT DISTINCT");
    expect(sql).toContain("p.id");
    expect(
      (sql.match(/CREATE OR REPLACE FUNCTION public\.get_feed_with_related_data/g) ?? [])
        .length
    ).toBe(1);
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/
    );
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS/i);
    expect(sql).not.toMatch(/^\s*DROP FUNCTION/im);
  });

  it("computes rel_rank in eligible_base from existing follow joins", () => {
    const sql = read(PHASE_2A);
    const eligible = sql.slice(
      sql.indexOf("eligible_base AS ("),
      sql.indexOf("true_total_cte AS (")
    );
    expect(eligible).toContain(REL_RANK);
    expect(eligible).toContain("mutual_follow.follower_id = v_viewer_profile_id");
    expect(eligible).toContain("reverse_follow.follower_id = author_profile.id");
    const jsonAgg = sql.slice(sql.indexOf("'follow_status', fp.follow_status"));
    expect(jsonAgg).not.toContain("'rel_rank'");
    expect(sql).not.toContain("fp.follow_status AS rel_rank");
  });

  it("derives next_relevant_day from Addis selected dates and recurring today through today+6", () => {
    const sql = read(PHASE_2A);
    expect(sql).toContain(
      "((trim(sched))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date"
    );
    expect(sql).toContain(
      ">= (timezone('Africa/Addis_Ababa', now()))::date"
    );
    expect(sql).toContain(
      "((timezone('Africa/Addis_Ababa', now()))::date + 6)::timestamp"
    );
    expect(sql).toContain("SELECT MIN(cands.d)");
    expect(sql).not.toMatch(/LEAST\s*\(/);
    expect(sql).not.toContain("'next_relevant_day',");
    expect(sql).not.toContain("'urgency_bucket',");
    expect(sql).not.toContain("'page_ord',");
  });

  it("uses mode-dependent ORDER BY and preserves JSON via page_ord", () => {
    const sql = read(PHASE_2A);
    expect(sql).toContain("THEN rk.next_relevant_day");
    expect(sql).toContain("THEN rk.rel_rank");
    expect(sql).toContain("THEN rk.urgency_bucket");
    expect(sql).toContain("AND rk.urgency_bucket = 0");
    expect(sql).toContain(
      "THEN rk.next_relevant_day\n            ELSE NULL"
    );
    expect(sql).toContain(
      "AND er.next_relevant_day < ((timezone('Africa/Addis_Ababa', now()))::date + 7)"
    );
    expect(sql).toContain("ORDER BY page_ids.page_ord ASC");
    expect(sql).toContain(") ORDER BY fp.page_ord ASC");
    expect(sql).not.toContain(
      "ORDER BY fp.earliest_match_day ASC NULLS LAST, fp.created_at DESC, fp.id DESC"
    );
  });

  it("keeps corrected duo_own_active and does not redesign All JSON keys", () => {
    const sql = read(PHASE_2A);
    expect(sql).toContain(DUO_OWN_ACTIVE);
    expect(sql).not.toContain("WHEN p_viewer_user_id IS NOT NULL THEN NULL");
    expect(sql).toContain("'follow_status', fp.follow_status");
    expect(sql).toContain("'media_order', fp.media_order");
    expect(sql).toContain("'post_media', fp.post_media");
  });

  it("client skip-sort covers occurrence, hangout, experience, and friendsOnly", () => {
    const gate = read("src/lib/homeMatchedOccurrence.ts");
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(gate).toContain("if (ctx.friendsOnly) return false;");
    expect(gate).toContain('if (ctx.type === "hangout" || ctx.type === "experience") return false;');
    expect(feed).toContain("shouldApplyLegacyFeedDateSort(opts)");
    expect(feed).not.toContain("sortByEarliestMatchDay");
    expect(feed).not.toMatch(/^\s*const sortedData = sortFeedItems\(/m);
    const home = read("src/pages/HomePage.tsx");
    expect(home).toContain("shouldPersonalizeHomeVerticalFeed");
    expect(home).toContain("personalizeFeedBatch");
    expect(home).not.toContain("rankFilteredHome");
  });
});
