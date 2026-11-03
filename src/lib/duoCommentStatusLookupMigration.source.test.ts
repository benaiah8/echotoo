/**
 * Structural contract for persisted Duo Comment status and lookup.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261107120000_duo_comment_status_and_lookup.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function sliceBetween(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe("duo comment status and lookup migration", () => {
  const sql = read(MIGRATION);
  const body = sqlBody(sql);
  const lookup = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.get_my_duo_comment(",
    "REVOKE ALL ON FUNCTION public.get_my_duo_comment"
  );

  it("replaces both jsonb list functions in place and adds the lookup", () => {
    expect(
      body.match(
        /CREATE OR REPLACE FUNCTION public\.list_pair_up_candidates\(/g
      )
    ).toHaveLength(1);
    expect(
      body.match(
        /CREATE OR REPLACE FUNCTION public\.list_discover_pair_up_candidates\(/g
      )
    ).toHaveLength(1);
    expect(
      body.match(/CREATE OR REPLACE FUNCTION public\.get_my_duo_comment\(/g)
    ).toHaveLength(1);
    expect(body).not.toContain("send_shared_post_message");
    expect(body).not.toContain("CREATE UNIQUE INDEX");
    expect(body).not.toContain("get_or_create_direct_conversation");
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(join_pair_up|connect_discover_pair_up|express_pair_up_interest|complete_pair_up_match)\(/
    );
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it("adds the same comment and pool keys to every candidate object", () => {
    expect(body.match(/AS duo_commented_by_me/g)).toHaveLength(2);
    expect(body.match(/AS viewer_has_active_pair_up/g)).toHaveLength(2);
    expect(body).toContain("elem - 'src_rn'");
    expect(body).toContain("elem - 'interested'");
    expect(body).toContain("AS expressed_by_me");
    expect(body).toContain(
      "'b', (v_last ->> 'interested')::integer"
    );
  });

  it("counts only an origin-duo comment in the canonical direct conversation", () => {
    const flag = sliceBetween(
      body,
      "FROM public.conversations c",
      "AS duo_commented_by_me"
    );
    expect(flag).toContain("msg.sender_user_id = v_me");
    expect(flag).toContain("msg.message_kind = 'shared_post'");
    expect(flag).toContain("msg.reference_type = 'post'");
    expect(flag).toContain("msg.reference_id = m.source_post_id");
    expect(flag).toContain("msg.reference_snapshot->>'origin' = 'duo'");
    expect(flag).toContain("c.kind = 'direct'");
    expect(flag).toContain("mem.left_at IS NULL");
    expect(flag).toContain("dm_direct_access_mode(v_me, m.creator_id, c.id)");
    expect(flag).toContain("IN ('full', 'request')");
    expect(flag).not.toContain("IS DISTINCT FROM 'denied'");
    expect(body.match(/IN \('full', 'request'\)/g)).toHaveLength(2);
    expect(flag).not.toContain("reference_snapshot->>'origin' = 'share'");
  });

  it("keeps Discover eligibility and limits the pool flag to an unexpired row", () => {
    const eligibility = sliceBetween(
      body,
      "AND NOT EXISTS (\n        SELECT 1\n        FROM public.social_opportunities mine",
      "AND NOT public.users_are_blocked_pair(v_me, o.creator_id)"
    );
    expect(eligibility).toContain("mine.status = 'active'");
    expect(eligibility).not.toContain("discoverable_until");
    const pool = sliceBetween(
      body,
      "FROM public.social_opportunities mine_pool",
      "AS viewer_has_active_pair_up"
    );
    expect(pool).toContain("mine_pool.creator_id = v_me");
    expect(pool).toContain("mine_pool.kind = 'pair_up'");
    expect(pool).toContain("mine_pool.status = 'active'");
    expect(pool).toContain("mine_pool.discoverable_until > now()");
    expect(body).toContain("Africa/Addis_Ababa");
    expect(body).toContain("people_source_is_eligible");
    expect(body).toContain("COALESCE(p_offset, 0) > 200");
  });

  it("locks the lookup to the caller, the pair, and that source post", () => {
    expect(lookup).toContain("SECURITY DEFINER");
    expect(lookup).toContain("SET search_path TO public, pg_temp");
    expect(lookup).toContain("RAISE EXCEPTION 'Not authenticated'");
    expect(lookup).toContain("users_are_blocked_pair(v_me, p_other_user_id)");
    expect(lookup).toContain("c.direct_user_low = v_low");
    expect(lookup).toContain("c.direct_user_high = v_high");
    expect(lookup).toContain("mem.left_at IS NULL");
    expect(lookup).toContain("v_mode IS DISTINCT FROM 'full'");
    expect(lookup).toContain("v_mode IS DISTINCT FROM 'request'");
    expect(lookup).not.toContain("v_mode = 'denied'");
    expect(lookup).toContain("msg.sender_user_id = v_me");
    expect(lookup).toContain("msg.reference_id = p_post_id");
    expect(lookup).toContain("msg.reference_snapshot->>'origin' = 'duo'");
    expect(lookup).toContain("'status', 'sent'");
    expect(lookup).toContain("'status', 'absent'");
    expect(lookup).toContain("'status', 'unavailable'");
    expect(lookup).toContain("'body', v_msg.body");
    expect(lookup).toContain("'conversation_id', v_msg.conversation_id");
    expect(lookup).toContain("'reference_id', v_msg.reference_id");
    expect(lookup.match(/'body'/g)).toHaveLength(1);
    expect(lookup).not.toContain("INSERT");
    expect(lookup).not.toContain("get_or_create_direct_conversation");
  });

  it("grants execute to authenticated only", () => {
    expect(body).toContain(
      "REVOKE ALL ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) FROM PUBLIC, anon;"
    );
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer) TO authenticated;"
    );
    expect(body).toContain(
      "REVOKE ALL ON FUNCTION public.list_discover_pair_up_candidates(integer, text)"
    );
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_discover_pair_up_candidates(integer, text)"
    );
    expect(body).toContain(
      "REVOKE ALL ON FUNCTION public.get_my_duo_comment(uuid, uuid)"
    );
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_my_duo_comment(uuid, uuid)"
    );
    const grants = [...body.matchAll(/GRANT EXECUTE ON FUNCTION [^;]+;/g)].map(
      (match) => match[0]
    );
    expect(grants).toHaveLength(3);
    for (const grant of grants) {
      expect(grant.replace(/\s+/g, " ")).toMatch(/TO authenticated;$/);
    }
  });
});
