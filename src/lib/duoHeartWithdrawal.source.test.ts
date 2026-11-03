/**
 * Structural contract for Duo Heart withdrawal.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261110120000_withdraw_duo_pair_up_interest.sql";

const LOCK_SNIPPET = [
  "  PERFORM o.id",
  "  FROM public.social_opportunities o",
  "  WHERE o.id IN (v_from_id, v_to_id)",
  "  ORDER BY o.id",
  "  FOR UPDATE;",
].join("\n");

const LOCKED_FUNCTIONS = [
  "supabase/migrations/20260817175619_pair_up_phase_2_mixed_deck.sql",
  "supabase/migrations/20260908120000_match_context_messages.sql",
  "supabase/migrations/20261109120000_discover_interest_origin.sql",
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("duo heart withdrawal migration", () => {
  const sql = read(MIGRATION);
  const body = sqlBody(sql);
  const fnAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.withdraw_duo_pair_up_interest("
  );
  const fn = body.slice(fnAt);

  it("defines only the Duo withdrawal function", () => {
    expect(fnAt).toBeGreaterThanOrEqual(0);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(express_pair_up_interest|complete_pair_up_match|withdraw_discover_pair_up_interest|join_pair_up|leave_pair_up|list_pair_up_candidates|list_discover_pair_up_candidates)\(/
    );
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path TO public, pg_temp");
    expect(body).toContain("v_me uuid := auth.uid()");
    expect(body).toContain("RAISE EXCEPTION 'Not authenticated'");
  });

  it("withdraws one outgoing Duo interest and treats a repeat as already gone", () => {
    const matchedAt = fn.indexOf("RAISE EXCEPTION 'Duo interest is matched'");
    const discoverAt = fn.indexOf("RAISE EXCEPTION 'Not a Duo interest'");
    const deleteAt = fn.indexOf("DELETE FROM public.social_opportunity_interests");
    expect(matchedAt).toBeGreaterThan(fn.indexOf("FOR UPDATE"));
    expect(discoverAt).toBeGreaterThan(matchedAt);
    expect(deleteAt).toBeGreaterThan(discoverAt);
    const deleted = fn.slice(deleteAt);
    expect(deleted).toContain("i.from_opportunity_id = v_from_id");
    expect(deleted).toContain("i.to_opportunity_id = v_to_id");
    expect(deleted).toContain("i.discover_sourced IS FALSE");
    expect(deleted).not.toContain("i.from_opportunity_id = v_to_id");
    expect(fn.match(/DELETE FROM /g)).toHaveLength(1);
    expect(fn).toContain("'withdrawn', v_deleted > 0");
    expect(fn).not.toContain("SET discover_sourced");
  });

  it("refuses a reverse interest and a Discover-sourced row before deleting", () => {
    const reverseAt = fn.indexOf("i.from_opportunity_id = v_to_id");
    const matchedAt = fn.indexOf("RAISE EXCEPTION 'Duo interest is matched'");
    const originAt = fn.indexOf("i.discover_sourced IS TRUE");
    const discoverRaiseAt = fn.indexOf("RAISE EXCEPTION 'Not a Duo interest'");
    const deleteAt = fn.indexOf("DELETE FROM public.social_opportunity_interests");
    expect(reverseAt).toBeGreaterThan(fn.indexOf("FOR UPDATE"));
    expect(reverseAt).toBeLessThan(matchedAt);
    expect(fn.slice(reverseAt, matchedAt)).toContain("i.to_opportunity_id = v_from_id");
    expect(originAt).toBeGreaterThan(matchedAt);
    expect(originAt).toBeLessThan(discoverRaiseAt);
    expect(discoverRaiseAt).toBeLessThan(deleteAt);
  });

  it("leaves pool membership, pins, and direct-message grants untouched", () => {
    expect(fn).not.toContain("leave_pair_up");
    expect(fn).not.toContain("DELETE FROM public.social_opportunities");
    expect(fn).not.toContain("discover_pair_up_candidate_pins");
    expect(fn).not.toContain("conversations");
    expect(fn).not.toContain("conversation_members");
    expect(fn).not.toContain("messages");
    expect(fn).not.toContain("dm_grant_direct_access");
    expect(fn).toContain("RAISE EXCEPTION 'Not in pool'");
    expect(fn).toContain("RAISE EXCEPTION 'Source is not eligible'");
    expect(fn).toContain("RAISE EXCEPTION 'Cannot Pair Up with this user'");
    expect(fn).toContain("RAISE EXCEPTION 'Target is not an active Pair Up'");
    expect(fn).toContain("v_to.creator_id = v_me");
  });

  it("restricts execution to the authenticated role", () => {
    expect(body).toContain(
      "REVOKE ALL ON FUNCTION public.withdraw_duo_pair_up_interest(uuid)"
    );
    expect(body).toContain("FROM PUBLIC, anon");
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.withdraw_duo_pair_up_interest(uuid)"
    );
    expect(body).toContain("TO authenticated");
    expect(body).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/);
    expect(body).not.toMatch(/GRANT EXECUTE[\s\S]*TO PUBLIC/);
    expect(body.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(1);
  });

  it("keeps the ascending opportunity lock used by express, completion, and Discover withdrawal", () => {
    expect(fn).toContain(LOCK_SNIPPET);
    const lockAt = fn.indexOf("ORDER BY o.id");
    expect(fn.indexOf("FOR UPDATE")).toBeGreaterThan(lockAt);
    expect(fn.indexOf("RAISE EXCEPTION 'Duo interest is matched'")).toBeGreaterThan(
      lockAt
    );
    for (const rel of LOCKED_FUNCTIONS) {
      expect(sqlBody(read(rel))).toContain(LOCK_SNIPPET);
    }
  });
});
