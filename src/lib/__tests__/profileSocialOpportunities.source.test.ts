import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIG =
  "supabase/migrations/20261001120000_profile_social_opportunities.sql";

function readSql(): string {
  return readFileSync(resolve(process.cwd(), MIG), "utf8");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("profile social opportunities migration (source)", () => {
  it("defines list + profile connect RPCs with discoverability and safety gates", () => {
    const sql = readSql();
    const body = sqlBody(sql);

    expect(sql).toMatch(/^-- LOCAL ONLY/m);
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.list_profile_social_opportunities"
    );
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.connect_profile_pair_up"
    );

    // Discoverability OFF → empty (server-side; never return the column in payload)
    expect(body).toContain("p2p_discover_enabled IS NOT TRUE");
    expect(body).not.toContain("'p2p_discover_enabled'");

    // Reuse eligibility helpers
    expect(body).toContain("people_source_is_eligible");
    expect(body).toContain("group_up_source_is_eligible");
    expect(body).toContain("can_view_post");
    expect(body).toContain("users_are_blocked_pair");

    // Duo + hosted Group only
    expect(body).toContain("o.kind = 'pair_up'");
    expect(body).toContain("o.kind = 'group_up'");
    expect(body).toContain("o.creator_id = p_profile_user_id");

    // No Open Plans
    expect(body).not.toContain("open_plan");

    // Profile connect: no viewer Discover requirement; target Discover required
    expect(body).toContain("connect_profile_pair_up");
    expect(body).toContain("join_pair_up");
    expect(body).toContain("express_pair_up_interest");
    expect(body).not.toMatch(
      /connect_profile_pair_up[\s\S]*Discover is not enabled/
    );
    expect(body).toContain("Target is not available on Profile");

    // Does not rewrite global Discover Connect
    expect(body).not.toContain(
      "CREATE OR REPLACE FUNCTION public.connect_discover_pair_up"
    );

    expect(body).toMatch(/\bREVOKE ALL ON FUNCTION public\.list_profile_social_opportunities/);
    expect(body).toMatch(/\bGRANT EXECUTE ON FUNCTION public\.list_profile_social_opportunities/);
    expect(body).toMatch(/\bREVOKE ALL ON FUNCTION public\.connect_profile_pair_up/);
    expect(body).toMatch(/\bGRANT EXECUTE ON FUNCTION public\.connect_profile_pair_up/);
  });

  it("orders mixed rows by sort_at then created_at/id, then caps at 8", () => {
    const body = sqlBody(readSql());
    const orderIdx = body.indexOf(
      "ORDER BY m.sort_at ASC NULLS LAST, m.created_at ASC, m.opportunity_id ASC"
    );
    const limitIdx = body.indexOf("LIMIT 8", orderIdx);
    expect(orderIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(orderIdx);
    expect(body).toContain("bounded AS");
    expect(body).toMatch(/FROM bounded b/);
    // Cap applies after mixed ordering; no pagination knobs.
    expect(body).not.toContain("OFFSET");
    expect(body).not.toContain("p_limit");
  });

  it("omits unused list payload fields while keeping action/state fields", () => {
    const body = sqlBody(readSql());
    const aggStart = body.indexOf("jsonb_agg(");
    const aggEnd = body.indexOf("INTO v_rows", aggStart);
    expect(aggStart).toBeGreaterThan(-1);
    expect(aggEnd).toBeGreaterThan(aggStart);
    const agg = body.slice(aggStart, aggEnd);
    expect(agg).not.toContain("'conversation_id'");
    expect(agg).not.toContain("'discoverable_until'");
    expect(agg).not.toContain("'sort_at'");
    expect(agg).toContain("'viewer_duo_joined'");
    expect(agg).toContain("'request_id'");
    expect(agg).toContain("'occurs_at'");
  });
});
