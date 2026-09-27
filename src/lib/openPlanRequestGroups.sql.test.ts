import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GROUPS_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261009120000_open_plan_request_groups.sql"
);
const ACCEPT_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260908120000_match_context_messages.sql"
);
const INBOX_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260912120000_open_plan_occurs_time_explicit.sql"
);

const IDENTITY_JSON_KEYS = [
  "'requester_id'",
  "'requester_user_id'",
  "'profile_id'",
  "'requester_profile_id'",
  "'display_name'",
  "'username'",
  "'email'",
  "'user_id'",
  "'creator_id'",
] as const;

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + needle.length);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

function jsonbBuildObjects(sql: string): string[] {
  return [...sql.matchAll(/jsonb_build_object\s*\(([\s\S]*?)\)/g)].map(
    (match) => match[1]
  );
}

describe("Open Plan grouped request SQL contracts", () => {
  const sql = readFileSync(GROUPS_SQL, "utf8");
  const acceptSql = readFileSync(ACCEPT_SQL, "utf8");
  const inboxSql = readFileSync(INBOX_SQL, "utf8");
  const groupsBody = functionBody(sql, "list_my_open_plan_request_groups");
  const requestersBody = functionBody(sql, "list_open_plan_requesters");
  const acceptBody = functionBody(acceptSql, "accept_open_plan_request");

  it("defines only the two new RPCs and does not replace inbox or accept", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_my_open_plan_request_groups"
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_open_plan_requesters"
    );
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public.list_my_open_plan_requests"
    );
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public.accept_open_plan_request"
    );
    expect(sql).not.toContain("DROP FUNCTION");
    expect(sql).not.toContain("ADD COLUMN");
  });

  it("groups by opportunity_id so many requests become one summary", () => {
    expect(groupsBody).toContain("GROUP BY e.opportunity_id");
    expect(groupsBody).toContain("DISTINCT ON (e.opportunity_id)");
    expect(groupsBody).not.toContain("GROUP BY e.source_post_id");
    expect(groupsBody).not.toContain("DISTINCT ON (e.source_post_id)");
    expect(groupsBody).toContain("'opportunity_id', t.opportunity_id");
    expect(groupsBody).toContain("'groups'");
  });

  it("keeps different opportunities as separate summaries", () => {
    expect(groupsBody).toContain(
      "ORDER BY e.opportunity_id, e.requested_at DESC, e.request_id DESC"
    );
    expect(groupsBody).toContain(
      "AND e.opportunity_id < v_cursor_v"
    );
    expect(groupsBody).toContain("'v', v_last ->> 'opportunity_id'");
  });

  it("uses a server COUNT over all eligible rows, not page length", () => {
    expect(groupsBody).toContain("COUNT(*)::integer AS pending_count");
    expect(groupsBody).toContain("'pending_count', t.pending_count");
    expect(groupsBody).not.toContain("new_count");
    expect(groupsBody).not.toContain("last_seen");
    expect(groupsBody.indexOf("agg AS")).toBeLessThan(
      groupsBody.indexOf("paged AS")
    );
    expect(groupsBody.indexOf("COUNT(*)::integer AS pending_count")).toBeLessThan(
      groupsBody.indexOf("paged AS")
    );
  });

  it("paginates summaries on latest request, scoped to opportunity_id", () => {
    expect(groupsBody).toContain(
      "ORDER BY e.latest_request_at DESC, e.latest_request_id DESC, e.opportunity_id DESC"
    );
    expect(groupsBody).toContain("LIMIT (v_limit + 1)");
    expect(groupsBody).toContain("'has_more', v_has_more");
    expect(groupsBody).toContain("'next_cursor', v_next_cursor");
  });

  it("paginates requesters newest-first inside one opportunity", () => {
    expect(requestersBody).toContain("p_opportunity_id uuid");
    expect(requestersBody).toContain("AND o.id = p_opportunity_id");
    expect(requestersBody).toContain("ORDER BY e.requested_at DESC, e.request_id DESC");
    expect(requestersBody).toContain("LIMIT (v_limit + 1)");
    expect(requestersBody).toContain("'c', v_last ->> 'requested_at'");
    expect(requestersBody).toContain("'i', v_last ->> 'request_id'");
  });

  it("omits identity fields from JSON payloads", () => {
    const payloadSql = [
      ...jsonbBuildObjects(groupsBody),
      ...jsonbBuildObjects(requestersBody),
    ].join("\n");
    for (const key of IDENTITY_JSON_KEYS) {
      expect(payloadSql).not.toContain(key);
    }
    expect(requestersBody).toContain("'request_id', t.request_id");
    expect(requestersBody).toContain("'avatar_url', t.avatar_url");
    expect(requestersBody).toContain("'profile_photos', t.profile_photos");
    expect(requestersBody).toContain("'echo_preset', t.echo_preset");
    expect(requestersBody).toContain("'bio', t.bio");
    expect(requestersBody).toContain("'requested_at', t.requested_at");
  });

  it("enforces host authorization, pending eligibility, blocks, and source gate", () => {
    for (const body of [groupsBody, requestersBody]) {
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path TO public, pg_temp");
      expect(body).toContain("v_me uuid := auth.uid()");
      expect(body).toContain("o.creator_id = v_me");
      expect(body).toContain("o.kind = 'open_plan'");
      expect(body).toContain("r.status = 'pending'");
      expect(body).toContain("o.status = 'active'");
      expect(body).toContain("o.discoverable_until > now()");
      expect(body).toContain("o.occurs_at > now()");
      expect(body).toContain("NOT public.users_are_blocked_pair(v_me, r.requester_id)");
      expect(body).toContain("public.open_plan_source_is_eligible(o.source_post_id)");
    }
    expect(requestersBody).toContain("AND o.id = p_opportunity_id");
    expect(requestersBody).toContain("RETURN v_empty");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_my_open_plan_request_groups(integer, text)"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)"
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.list_my_open_plan_request_groups(integer, text)"
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.list_open_plan_requesters(uuid, integer, text)"
    );
  });

  it("loads at most two anonymous previews in the same groups query, not per card", () => {
    expect(groupsBody).toContain("LEFT JOIN LATERAL");
    expect(groupsBody).toContain("LIMIT 2");
    expect(groupsBody).toContain("'preview_requesters', t.preview_requesters");
    expect(groupsBody).toContain("'avatar_url', s.avatar_url");
    expect(groupsBody).toContain("'echo_preset', s.echo_preset");
    expect(requestersBody).not.toContain("LEFT JOIN LATERAL");
  });

  it("leaves accept_open_plan_request one-request and plan-open", () => {
    expect(acceptBody).toContain("UPDATE public.open_plan_requests");
    expect(acceptBody).toContain("WHERE id = v_req.id");
    expect(acceptBody).toContain("Do not close or mutate the Open Plan opportunity.");
    expect(acceptBody).not.toContain("UPDATE public.social_opportunities");
    expect(sql).not.toMatch(/UPDATE public\.open_plan_requests/i);
    expect(sql).not.toMatch(/UPDATE public\.social_opportunities/i);
  });

  it("preserves the current inbox eligibility rules as the grouped baseline", () => {
    expect(inboxSql).toContain("o.kind = 'open_plan'");
    expect(inboxSql).toContain("o.creator_id = v_me");
    expect(inboxSql).toContain("r.status = 'pending'");
    expect(inboxSql).toContain("public.open_plan_source_is_eligible(o.source_post_id)");
    expect(inboxSql).toContain("NOT public.users_are_blocked_pair(v_me, r.requester_id)");
  });
});
