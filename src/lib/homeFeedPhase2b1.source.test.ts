import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PHASE_2B1 =
  "supabase/migrations/20260909201736_feed_phase2b1_default_all_ranking.sql";
const PHASE_2A =
  "supabase/migrations/20260909011556_feed_phase2a_filtered_ranking.sql";

const REL_PTS = [
  "      CASE er.rel_rank",
  "        WHEN 1 THEN 4",
  "        WHEN 2 THEN 3",
  "        WHEN 0 THEN 1",
  "        ELSE 0",
  "      END AS rel_pts",
].join("\n");

const FRESHNESS_PTS = [
  "        WHEN er.created_at >= (now() - interval '1 day') THEN 4",
  "        WHEN er.created_at >= (now() - interval '3 days') THEN 3",
  "        WHEN er.created_at >= (now() - interval '7 days') THEN 2",
  "        WHEN er.created_at >= (now() - interval '30 days') THEN 1",
].join("\n");

const DUO_OWN_ACTIVE = [
  "      CASE",
  "        WHEN p_viewer_user_id IS NULL THEN NULL",
  "        WHEN p.type = 'hangout' THEN (viewer_pair_own.source_post_id IS NOT NULL)",
  "        WHEN p.type = 'experience' THEN (viewer_open_plan_own.source_post_id IS NOT NULL)",
  "        ELSE false",
  "      END AS duo_own_active",
].join("\n");

describe("Home Feed Phase 2B.1 source guards", () => {
  it("is a local-only get_feed_with_related_data based on Phase 2A", () => {
    const sql = read(PHASE_2B1);
    expect(sql).toContain("LOCAL ONLY — DO NOT APPLY");
    expect(sql).toContain("20260909011556_feed_phase2a_filtered_ranking.sql");
    expect(sql).toContain("Do NOT use older local get_feed_with_related_data");
    expect(
      (sql.match(/CREATE OR REPLACE FUNCTION public\.get_feed_with_related_data/g) ?? [])
        .length
    ).toBe(1);
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/
    );
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS/i);
    expect(sql).not.toMatch(/^\s*DROP FUNCTION/im);
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/CREATE INDEX/i);
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).toContain("STABLE SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(sql).toContain("Africa/Addis_Ababa");
  });

  it("activates all_score only for true default All, not search/tags/filters", () => {
    const sql = read(PHASE_2B1);
    const ordered = sql.slice(
      sql.indexOf("ordered_ids AS ("),
      sql.indexOf("page_ids AS (")
    );
    expect(ordered).toContain("p_type IS NULL");
    expect(ordered).toContain("AND NOT COALESCE(p_friends_only, false)");
    expect(ordered).toContain("AND p_search IS NULL");
    expect(ordered).toContain("AND p_tags IS NULL");
    expect(ordered).toContain(
      "AND (p_occurs_from IS NULL OR p_occurs_to IS NULL OR p_occurs_tz IS NULL)"
    );
    expect(ordered).toContain("AND (p_occurs_on IS NULL OR p_occurs_tz IS NULL)");
    expect(ordered).toContain("THEN (\n              rk.freshness_pts");
    expect(ordered).toContain("+ rk.engagement_pts\n            )\n            ELSE NULL");

    const scoreWhen = ordered.slice(
      ordered.indexOf("WHEN p_type IS NULL"),
      ordered.indexOf("ELSE NULL")
    );
    expect(scoreWhen).toContain("AND p_search IS NULL");
    expect(scoreWhen).toContain("AND p_tags IS NULL");
    expect(scoreWhen).toContain("AND NOT COALESCE(p_friends_only, false)");
    expect(scoreWhen).not.toContain("p_type = 'hangout'");
    expect(scoreWhen).not.toContain("p_type = 'experience'");
  });

  it("does not apply all_score in Events, Places, Friends, or date ORDER BY keys", () => {
    const sql = read(PHASE_2B1);
    const ordered = sql.slice(
      sql.indexOf("ordered_ids AS ("),
      sql.indexOf("page_ids AS (")
    );
    expect(ordered).toContain("THEN rk.next_relevant_day");
    expect(ordered).toContain("THEN rk.rel_rank");
    expect(ordered).toContain("THEN rk.urgency_bucket");
    expect(ordered).toContain("THEN rk.earliest_match_day");
    expect(ordered).not.toMatch(/p_type = 'hangout'[\s\S]{0,400}all_score/);
    expect(ordered).not.toMatch(/p_type = 'experience'[\s\S]{0,400}all_score/);
    expect(ordered).not.toMatch(/p_friends_only[\s\S]{0,400}all_score/);
    expect(ordered).not.toMatch(/p_occurs_from IS NOT NULL[\s\S]{0,400}all_score/);
  });

  it("implements internal all_score without exposing it in JSON", () => {
    const sql = read(PHASE_2B1);
    expect(sql).toContain(FRESHNESS_PTS);
    expect(sql).toContain(REL_PTS);
    expect(sql).toContain("END AS urgency_pts");
    expect(sql).toContain("LEAST(\n        2,");
    expect(sql).toContain("AS all_score");
    expect(sql).toContain("rk.created_at DESC");
    expect(sql).toContain("rk.id DESC");
    expect(sql).toContain("ORDER BY page_ids.page_ord ASC");
    expect(sql).toContain(") ORDER BY fp.page_ord ASC");
    expect(sql).not.toContain("'all_score'");
    expect(sql).not.toContain("'freshness_pts'");
    expect(sql).not.toContain("'rel_pts'");
    expect(sql).not.toContain("'urgency_pts'");
    expect(sql).not.toContain("'engagement_pts'");
    expect(sql).not.toContain("'rel_rank'");
    expect(sql).not.toContain("'next_relevant_day',");
    expect(sql).not.toContain("'page_ord',");
    const pageIds = sql.slice(
      sql.indexOf("page_ids AS ("),
      sql.indexOf("viewer_pair_own AS (")
    );
    expect(pageIds).not.toContain("all_score");
    expect(pageIds).toContain("page_ord");
  });

  it("keeps one row per post and scalar MIN next_relevant_day for default All", () => {
    const sql = read(PHASE_2B1);
    const eligible = sql.slice(
      sql.indexOf("eligible_base AS ("),
      sql.indexOf("true_total_cte AS (")
    );
    expect(eligible).toContain("SELECT DISTINCT");
    expect(eligible).toContain("p.id");
    expect(sql).toContain("SELECT MIN(cands.d)");
    expect(sql).not.toMatch(/LEAST\s*\(\s*cands/i);
    expect(sql).toContain("COALESCE(p.like_count, 0) AS like_count");
    const ranked = sql.slice(
      sql.indexOf("ranked_keys AS ("),
      sql.indexOf("ordered_ids AS (")
    );
    expect(ranked).not.toContain("FROM public.social_opportunities");
    expect(ranked).not.toContain("rsvp");
  });

  it("extends next_relevant_day to true default All and keeps Phase 2A filtered ranking", () => {
    const sql = read(PHASE_2B1);
    const nextDay = sql.slice(
      sql.indexOf("END AS earliest_match_day"),
      sql.indexOf("ranked_keys AS (")
    );
    expect(nextDay).toContain("AND p_search IS NULL");
    expect(nextDay).toContain("AND p_tags IS NULL");
    expect(nextDay).toContain("AND NOT COALESCE(p_friends_only, false)");
    expect(nextDay).toContain("p_type = 'hangout'");
    expect(nextDay).toContain("COALESCE(p_friends_only, false)");
    expect(sql).toContain(
      "AND er.next_relevant_day < ((timezone('Africa/Addis_Ababa', now()))::date + 7)"
    );
    expect(sql).toContain(DUO_OWN_ACTIVE);
    expect(sql).toContain("'group_own_active', fp.group_own_active");
    expect(sql).toContain("'discoverable_group_count', fp.discoverable_group_count");
    expect(sql).toContain("'count', COALESCE(v_true_total, 0)");
  });

  it("does not implement Phase 2B.2 recently-shown, random, or new RPC args", () => {
    const sql = read(PHASE_2B1);
    expect(sql).not.toContain("recently_shown");
    expect(sql).not.toContain("seen_ids");
    expect(sql).not.toContain("random()");
    expect(sql).not.toContain("p_exclude");
    expect(sql).not.toContain("p_seed");
    expect(sql).not.toContain("overfetch");
    const signature = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.get_feed_with_related_data("),
      sql.indexOf("RETURNS jsonb")
    );
    const baseSig = read(PHASE_2A).slice(
      read(PHASE_2A).indexOf(
        "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data("
      ),
      read(PHASE_2A).indexOf("RETURNS jsonb")
    );
    expect(signature.replace(/\s+/g, " ")).toBe(baseSig.replace(/\s+/g, " "));
  });

  it("client true default All skips sort and personalize; search/tags keep sort", () => {
    const gate = read("src/lib/homeMatchedOccurrence.ts");
    const feed = read("src/api/queries/getPublicFeed.ts");
    const personalize = read("src/lib/homeVerticalFilters.ts");
    const home = read("src/pages/HomePage.tsx");
    expect(gate).toContain("export function isTrueDefaultAllFeed");
    expect(gate).toContain("if (isTrueDefaultAllFeed(ctx)) return false;");
    expect(gate).toContain('if (ctx.q && ctx.q.trim() !== "") return false;');
    expect(gate).toContain("if (ctx.tags && ctx.tags.length > 0) return false;");
    expect(feed).toContain("shouldApplyLegacyFeedDateSort(opts)");
    expect(feed).toContain("p_search: q && q.trim() ? q.trim() : null");
    expect(feed).toContain("p_tags: tags && tags.length > 0 ? tags : null");
    expect(personalize).toContain("return false;");
    expect(home).toContain("shouldPersonalizeHomeVerticalFeed");
    expect(home).toContain("personalizeFeedBatch");
    expect(read("src/lib/feedPersonalization.ts")).toContain(
      "export function personalizeFeedBatch"
    );
    expect(read("src/components/ProgressiveFeed.tsx")).toContain(
      "const consumedOffset = normalized.consumedOffset"
    );
  });

  it("does not touch Profile RPC, Create, or Phase 2A filtered client skip-sort", () => {
    const profile = read("src/api/queries/getUserPostsCreated.ts");
    const create = read("src/components/home/HomeFilterEndState.tsx");
    const gate = read("src/lib/homeMatchedOccurrence.ts");
    expect(profile).not.toContain("all_score");
    expect(profile).not.toContain("filterExpiredHangouts");
    expect(create).toContain("onClick={() => openChooser()}");
    expect(gate).toContain("if (ctx.friendsOnly) return false;");
    expect(gate).toContain(
      'if (ctx.type === "hangout" || ctx.type === "experience") return false;'
    );
    expect(gate).toContain("if (hasActiveHomeOccurrenceFilter(ctx)) return false;");
  });
});
