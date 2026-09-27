import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const HOTFIX =
  "supabase/migrations/20260908172915_feed_fix_duo_own_active_viewer_guard.sql";

const DUO_OWN_ACTIVE = [
  "      CASE",
  "        WHEN p_viewer_user_id IS NULL THEN NULL",
  "        WHEN p.type = 'hangout' THEN (viewer_pair_own.source_post_id IS NOT NULL)",
  "        WHEN p.type = 'experience' THEN (viewer_open_plan_own.source_post_id IS NOT NULL)",
  "        ELSE false",
  "      END AS duo_own_active",
].join("\n");

const GROUP_OWN_ACTIVE = [
  "      CASE",
  "        WHEN p_viewer_user_id IS NULL THEN NULL",
  "        ELSE (viewer_group_own.source_post_id IS NOT NULL)",
  "      END AS group_own_active",
].join("\n");

describe("Home Feed Phase 1.2 duo_own_active hotfix source guards", () => {
  it("restores the viewer-null guard on duo_own_active only", () => {
    const sql = read(HOTFIX);
    const body = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(body).toContain(DUO_OWN_ACTIVE);
    expect(body).not.toContain("WHEN p_viewer_user_id IS NOT NULL THEN NULL");
    expect(body).toContain(GROUP_OWN_ACTIVE);
  });

  it("keeps Phase 1.2 range-order markers and does not replace Profile RPC", () => {
    const sql = read(HOTFIX);
    expect(sql).toContain("eligible_ranked AS (");
    expect(sql).toContain("earliest_match_day");
    expect(sql).toContain(
      "ORDER BY fp.earliest_match_day ASC NULLS LAST, fp.created_at DESC, fp.id DESC"
    );
    expect(sql).toContain("ORDER BY page_ids.earliest_match_day ASC NULLS LAST, p.created_at DESC, p.id DESC");
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
});
