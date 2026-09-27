import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROFILE_KEY_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261011120000_open_plan_requester_profile_open_key.sql"
);
const VISIBILITY_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261010120000_open_plan_requester_identity_visibility.sql"
);

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + needle.length);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("Open Plan requester profile_open_key SQL", () => {
  const sql = readFileSync(PROFILE_KEY_SQL, "utf8");
  const visibilitySql = readFileSync(VISIBILITY_SQL, "utf8");
  const body = functionBody(sql, "list_open_plan_requesters");

  it("is a successor migration that only replaces list_open_plan_requesters", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.list_open_plan_requesters");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.request_open_plan");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.accept_open_plan_request");
    expect(sql).not.toContain("identity_visible_to_host boolean");
    expect(body).not.toMatch(/\bUPDATE\b/i);
    expect(visibilitySql).toContain("identity_visible_to_host");
  });

  it("gates display_name and profile_open_key behind identity_visible_to_host", () => {
    expect(body).toContain(
      "WHEN r.identity_visible_to_host IS TRUE THEN req_pr.display_name"
    );
    expect(body).toContain("WHEN r.identity_visible_to_host IS TRUE THEN");
    expect(body).toContain("NULLIF(btrim(req_pr.username), '')");
    expect(body).toContain("r.requester_id::text");
    expect(body).toContain("'profile_open_key', t.profile_open_key");
    expect(body).toContain("'display_name', t.display_name");
    expect(body).toContain("o.creator_id = v_me");
    expect(body).toContain("NOT public.users_are_blocked_pair");
    expect(body).toContain("public.open_plan_source_is_eligible");
  });

  it("does not expose email or ungated identity columns", () => {
    expect(body).not.toContain("'email'");
    expect(body).not.toContain("'username'");
    expect(body).not.toContain("'requester_id'");
    expect(body).not.toContain("'profile_id'");
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)"
    );
    expect(body).toContain(
      "REVOKE ALL ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)"
    );
  });
});
