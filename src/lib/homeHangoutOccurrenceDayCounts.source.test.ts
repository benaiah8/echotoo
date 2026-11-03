import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261102120000_home_hangout_occurrence_day_counts.sql";
const FEED_BASELINE =
  "supabase/migrations/20261031130000_v1_1_feed_hide_processing_video_from_everyone.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("home hangout occurrence day counts migration", () => {
  const sql = read(MIGRATION);
  const feed = read(FEED_BASELINE);

  it("defines get_home_hangout_occurrence_day_counts with expected signature", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.get_home_hangout_occurrence_day_counts("
    );
    expect(sql).toContain("p_month_start date");
    expect(sql).toContain("p_viewer_user_id uuid");
    expect(sql).toContain("p_friends_only boolean");
    expect(sql).toContain("p_occurs_tz text");
    expect(sql).toMatch(/RETURNS TABLE\s*\(\s*day date,\s*event_count integer\s*\)/s);
  });

  it("does not modify get_feed_with_related_data", () => {
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
    );
    expect(feed).toContain(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
    );
  });

  it("preserves feed eligible_base predicates (hangout discovery + video gate)", () => {
    const markers = [
      "post_has_nonready_attached_video",
      "users_are_blocked_pair",
      "COALESCE(p.status, 'published') = 'published'",
      "Africa/Addis_Ababa",
      "timezone('Africa/Addis_Ababa', now())",
      "mutual_follow.status = 'approved'",
      "reverse_follow.status = 'approved'",
    ];
    for (const m of markers) {
      expect(sql).toContain(m);
    }
  });

  it("uses bounded month series and single-pass aggregation", () => {
    expect(sql).toContain("date_trunc('month', p_month_start)");
    expect(sql).toContain("generate_series(v_month_start, v_month_end");
    expect(sql).toContain("SELECT DISTINCT ep.id AS post_id, md.day");
    expect(sql).toContain("LEFT JOIN counts c ON c.day = md.day");
  });

  it("matches feed single-day ISODOW recurrence codes", () => {
    expect(sql).toContain("EXTRACT(ISODOW FROM md.day)");
    expect(sql).toContain("WHEN 1 THEN 'MO'");
    expect(sql).toContain("WHEN 7 THEN 'SU'");
    expect(feed).toContain("EXTRACT(ISODOW FROM p_occurs_on)");
  });

  it("derives viewer identity only from auth.uid() (anonymous => NULL)", () => {
    expect(sql).toContain("v_viewer_user_id := auth.uid()");
    expect(sql).not.toMatch(
      /v_viewer_user_id\s*:=\s*p_viewer_user_id|IF v_viewer_user_id IS NULL[\s\S]*p_viewer_user_id/
    );
  });

  it("grants execute to anon and authenticated", () => {
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_home_hangout_occurrence_day_counts"
    );
    expect(sql).toContain("TO anon");
    expect(sql).toContain("TO authenticated");
  });

  it("uses SECURITY DEFINER and fixed search_path", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public', 'pg_temp'");
  });
});
