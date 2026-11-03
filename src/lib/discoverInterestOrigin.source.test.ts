/**
 * Structural contract for Discover interest origin.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261109120000_discover_interest_origin.sql";

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

describe("discover interest origin migration", () => {
  const sql = read(MIGRATION);
  const body = sqlBody(sql);
  const connect = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.connect_discover_pair_up(",
    "REVOKE ALL ON FUNCTION public.connect_discover_pair_up"
  );
  const withdraw = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.withdraw_discover_pair_up_interest(",
    "REVOKE ALL ON FUNCTION public.withdraw_discover_pair_up_interest"
  );
  const backfill = body.slice(
    body.indexOf("UPDATE public.social_opportunity_interests AS interest"),
    body.indexOf("CREATE OR REPLACE FUNCTION public.connect_discover_pair_up(")
  );

  it("adds the origin flag without replacing Duo or list functions", () => {
    expect(body).toContain(
      "ADD COLUMN discover_sourced boolean NOT NULL DEFAULT false"
    );
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(express_pair_up_interest|complete_pair_up_match|join_pair_up|leave_pair_up|list_pair_up_candidates|list_discover_pair_up_candidates)\(/
    );
    expect(body).not.toContain("leave_pair_up");
    expect(body).not.toContain("conversations");
  });

  it("stamps the interest returned by Discover Connect, including a repeat call", () => {
    const expressAt = connect.indexOf("public.express_pair_up_interest(p_to_opportunity_id)");
    const stampAt = connect.indexOf("SET discover_sourced = true");
    const pinAt = connect.indexOf("INSERT INTO public.discover_pair_up_candidate_pins");
    expect(expressAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(expressAt);
    expect(pinAt).toBeGreaterThan(stampAt);
    expect(connect).toContain("interest.from_opportunity_id = v_interest_from");
    expect(connect).toContain("interest.to_opportunity_id = v_interest_to");
    expect(connect).toContain("v_interest_to IS DISTINCT FROM p_to_opportunity_id");
    expect(connect).toContain("IF v_stamped <> 1 THEN");
    expect(connect).toContain("ON CONFLICT (viewer_id, to_opportunity_id) DO NOTHING");
    expect(connect.match(/SET discover_sourced = true/g)).toHaveLength(1);
  });

  it("requires the pin and the current row origin before the only delete", () => {
    const lockAt = withdraw.indexOf("ORDER BY o.id");
    const matchedAt = withdraw.indexOf("RAISE EXCEPTION 'Discover interest is matched'");
    const pinAt = withdraw.indexOf("public.discover_pair_up_candidate_pins pin");
    const originAt = withdraw.indexOf("i.discover_sourced IS TRUE");
    const raiseAt = withdraw.indexOf("RAISE EXCEPTION 'Not a Discover interest'");
    const deleteAt = withdraw.indexOf("DELETE FROM public.social_opportunity_interests");
    expect(lockAt).toBeGreaterThan(-1);
    expect(withdraw.indexOf("FOR UPDATE")).toBeGreaterThan(lockAt);
    expect(matchedAt).toBeGreaterThan(lockAt);
    expect(pinAt).toBeGreaterThan(matchedAt);
    expect(originAt).toBeGreaterThan(pinAt);
    expect(raiseAt).toBeGreaterThan(originAt);
    expect(deleteAt).toBeGreaterThan(raiseAt);
    const deleted = withdraw.slice(deleteAt);
    expect(deleted).toContain("i.from_opportunity_id = v_from_id");
    expect(deleted).toContain("i.to_opportunity_id = v_to_id");
    expect(deleted).toContain("i.discover_sourced IS TRUE");
    expect(withdraw.match(/DELETE FROM /g)).toHaveLength(1);
    expect(withdraw).not.toContain("DELETE FROM public.discover_pair_up_candidate_pins");
  });

  it("backfills only an interest that is not newer than its Discover pin", () => {
    expect(backfill).toContain("interest.created_at <= pin.created_at");
    expect(backfill).toContain("pin.viewer_id = mine.creator_id");
    expect(backfill).toContain("pin.to_opportunity_id = target.id");
    expect(backfill).toContain("interest.from_opportunity_id = mine.id");
    expect(backfill).toContain("interest.to_opportunity_id = target.id");
    expect(backfill).toContain("mine.status = 'active'");
    expect(backfill).toContain("mine.discoverable_until > now()");
    expect(backfill.match(/SET discover_sourced = true/g)).toHaveLength(1);
    expect(body).toContain("DEFAULT false");
    expect(connect).toContain("public.express_pair_up_interest(p_to_opportunity_id)");
  });
});
