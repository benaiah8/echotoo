import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SELF_VIEW_MIG =
  "supabase/migrations/20261002120000_list_profile_social_opportunities_self_view.sql";
const ORIGINAL_MIG =
  "supabase/migrations/20261001120000_profile_social_opportunities.sql";

function readSql(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("list_profile_social_opportunities self-view follow-up (source)", () => {
  it("is a new local migration and does not rewrite the live original as the fix", () => {
    const follow = readSql(SELF_VIEW_MIG);
    const original = readSql(ORIGINAL_MIG);
    expect(follow).toMatch(/^-- LOCAL ONLY/m);
    expect(follow).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(follow).not.toContain(
      "CREATE OR REPLACE FUNCTION public.connect_profile_pair_up"
    );
    // Original still has the pre-self Discover gate (no is_self bypass).
    const origBody = sqlBody(original);
    expect(origBody).toContain("p2p_discover_enabled IS NOT TRUE");
    expect(origBody).not.toContain("v_is_self");
  });

  it("gates Discover OFF for other viewers only; self bypasses Discover hide", () => {
    const body = sqlBody(readSql(SELF_VIEW_MIG));
    expect(body).toContain("v_is_self := (v_me = p_profile_user_id)");
    expect(body).toContain(
      "IF NOT v_is_self AND v_owner.p2p_discover_enabled IS NOT TRUE THEN"
    );
    expect(body).not.toMatch(
      /IF v_owner\.p2p_discover_enabled IS NOT TRUE THEN/
    );
  });

  it("allows self Duo and self hosted Group while keeping other-view exclusions", () => {
    const body = sqlBody(readSql(SELF_VIEW_MIG));
    expect(body).toContain("AND (v_is_self OR o.creator_id <> v_me)");
    expect(body).toContain("o.creator_id = p_profile_user_id");
    expect(body).toContain("o.kind = 'pair_up'");
    expect(body).toContain("o.kind = 'group_up'");
    // Private follow gate still other-only
    expect(body).toContain("AND NOT v_is_self THEN");
    // Owner block gate also other-only (self cannot block self)
    expect(body).toMatch(
      /IF NOT v_is_self\s+AND public\.users_are_blocked_pair\(v_me, p_profile_user_id\) THEN/
    );
  });

  it("keeps LIMIT 8, payload safety, and grants", () => {
    const body = sqlBody(readSql(SELF_VIEW_MIG));
    const orderIdx = body.indexOf(
      "ORDER BY m.sort_at ASC NULLS LAST, m.created_at ASC, m.opportunity_id ASC"
    );
    const limitIdx = body.indexOf("LIMIT 8", orderIdx);
    expect(orderIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(orderIdx);

    const aggStart = body.indexOf("jsonb_agg(");
    const aggEnd = body.indexOf("INTO v_rows", aggStart);
    const agg = body.slice(aggStart, aggEnd);
    expect(agg).not.toContain("'conversation_id'");
    expect(agg).not.toContain("'discoverable_until'");
    expect(agg).not.toContain("'match'");
    expect(agg).not.toContain("'peer'");
    expect(agg).not.toContain("'p2p_discover_enabled'");

    expect(body).toMatch(
      /\bREVOKE ALL ON FUNCTION public\.list_profile_social_opportunities/
    );
    expect(body).toMatch(
      /\bGRANT EXECUTE ON FUNCTION public\.list_profile_social_opportunities/
    );
  });
});
