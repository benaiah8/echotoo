import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const VISIBILITY_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261010120000_open_plan_requester_identity_visibility.sql"
);
const GROUPS_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261009120000_open_plan_request_groups.sql"
);

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + needle.length);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("Open Plan requester identity visibility SQL", () => {
  const sql = readFileSync(VISIBILITY_SQL, "utf8");
  const groupsSql = readFileSync(GROUPS_SQL, "utf8");
  const requestBody = functionBody(sql, "request_open_plan");
  const requestersBody = functionBody(sql, "list_open_plan_requesters");
  const groupsBody = functionBody(groupsSql, "list_my_open_plan_request_groups");

  it("adds identity_visible_to_host defaulting false", () => {
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS identity_visible_to_host boolean NOT NULL DEFAULT false"
    );
  });

  it("replaces one-arg request_open_plan without leaving an overload", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.request_open_plan(uuid)");
    expect(sql).toContain("p_identity_visible_to_host boolean DEFAULT false");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid, boolean)"
    );
    expect(sql).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid);"
    );
    expect(requestBody).toContain("v_identity_visible boolean := COALESCE(p_identity_visible_to_host, false)");
    expect(requestBody).toContain("identity_visible_to_host");
    expect(requestBody).toContain("v_identity_visible");
  });

  it("never flips visibility on existing unresolved request reuse", () => {
    const reuseIdx = requestBody.indexOf("Existing unresolved request");
    const insertIdx = requestBody.indexOf("INSERT INTO public.open_plan_requests");
    expect(reuseIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(reuseIdx);
    const reuseBlock = requestBody.slice(reuseIdx, insertIdx);
    expect(reuseBlock).not.toMatch(/^\s*UPDATE\b/im);
    expect(reuseBlock).toContain("RETURN jsonb_build_object");
    expect(reuseBlock).not.toContain("identity_visible_to_host");
    expect(reuseBlock).toContain("FOR UPDATE");
  });

  it("gates display_name in list_open_plan_requesters and omits other identity keys", () => {
    expect(requestersBody).toContain("WHEN r.identity_visible_to_host IS TRUE THEN req_pr.display_name");
    expect(requestersBody).toContain("'display_name', t.display_name");
    expect(requestersBody).toContain("'request_id', t.request_id");
    expect(requestersBody).not.toContain("'username'");
    expect(requestersBody).not.toContain("'email'");
    expect(requestersBody).not.toContain("'requester_id'");
    expect(requestersBody).not.toContain("'profile_id'");
    expect(requestersBody).toContain("o.creator_id = v_me");
    expect(requestersBody).toContain("NOT public.users_are_blocked_pair");
    expect(requestersBody).toContain("public.open_plan_source_is_eligible");
  });

  it("leaves grouped summary previews anonymous", () => {
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.list_my_open_plan_request_groups/
    );
    expect(groupsBody).not.toContain("'display_name'");
    expect(groupsBody).toContain("'preview_requesters'");
    expect(groupsBody).toContain("'avatar_url', s.avatar_url");
  });
});
