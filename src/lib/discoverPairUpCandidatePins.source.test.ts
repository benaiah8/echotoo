/**
 * Structural contract for reversible Discover Heart interest.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261108120000_discover_pair_up_candidate_pins.sql";

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

describe("discover pair up candidate pins migration", () => {
  const sql = read(MIGRATION);
  const body = sqlBody(sql);
  const connect = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.connect_discover_pair_up(",
    "REVOKE ALL ON FUNCTION public.connect_discover_pair_up"
  );
  const discover = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates(",
    "REVOKE ALL ON FUNCTION public.list_discover_pair_up_candidates"
  );
  const withdraw = sliceBetween(
    body,
    "CREATE OR REPLACE FUNCTION public.withdraw_discover_pair_up_interest(",
    "REVOKE ALL ON FUNCTION public.withdraw_discover_pair_up_interest"
  );

  it("adds one pin table and replaces only Discover Connect, Discover list, and withdraw", () => {
    expect(body.match(/CREATE TABLE public\.discover_pair_up_candidate_pins/g)).toHaveLength(1);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(3);
    expect(body).toContain("PRIMARY KEY (viewer_id, to_opportunity_id)");
    expect(body).toContain("REFERENCES public.profiles (user_id)");
    expect(body).toContain("REFERENCES public.social_opportunities (id)");
    expect(body).toContain("ON DELETE CASCADE");
    expect(body).toContain(
      "ALTER TABLE public.discover_pair_up_candidate_pins ENABLE ROW LEVEL SECURITY"
    );
    expect(body).toContain(
      "REVOKE ALL ON TABLE public.discover_pair_up_candidate_pins"
    );
    expect(body).toContain("FROM PUBLIC, anon, authenticated");
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(join_pair_up|leave_pair_up|express_pair_up_interest|complete_pair_up_match|list_pair_up_candidates)\(/
    );
  });

  it("creates one pin from Discover Connect and not from a replaced express function", () => {
    expect(connect).toContain("public.join_pair_up(v_source_post_id, NULL)");
    expect(connect).toContain("public.express_pair_up_interest(p_to_opportunity_id)");
    const insertAt = connect.indexOf(
      "INSERT INTO public.discover_pair_up_candidate_pins"
    );
    const expressAt = connect.indexOf("public.express_pair_up_interest");
    expect(insertAt).toBeGreaterThan(expressAt);
    expect(connect.match(/INSERT INTO public\.discover_pair_up_candidate_pins/g)).toHaveLength(1);
    expect(connect).toContain(
      "ON CONFLICT (viewer_id, to_opportunity_id) DO NOTHING"
    );
    expect(body.match(/INSERT INTO public\.discover_pair_up_candidate_pins/g)).toHaveLength(1);
  });

  it("keeps a pinned candidate only while the pool exception and safety checks pass", () => {
    const gate = sliceBetween(
      discover,
      "AND o.creator_id <> v_me",
      "AND NOT public.users_are_blocked_pair(v_me, o.creator_id)"
    );
    expect(gate).toContain("discover_pair_up_candidate_pins pin");
    expect(gate).toContain("pin.viewer_id = v_me");
    expect(gate).toContain("pin.to_opportunity_id = o.id");
    expect(gate).toContain("rev.from_opportunity_id = o.id");
    expect(gate).toContain("rev.to_opportunity_id = mine.id");
    expect(gate).toContain("mine.creator_id = v_me");
    expect(gate).toContain("mine.status = 'active'");
    expect(discover).toContain("o.discoverable_until > now()");
    expect(discover).toContain("pr.p2p_discover_enabled = true");
    expect(discover).toContain("p.visibility = 'public'");
    expect(discover).toContain("public.can_view_post(p.id)");
    expect(discover).toContain("p.type = 'hangout'");
    expect(discover).not.toMatch(
      /FROM public\.discover_pair_up_candidate_pins[\s\S]{0,80}UNION/
    );
    expect(discover.match(/UNION ALL/g)).toHaveLength(1);
  });

  it("keeps the deployed comment fields on the Discover candidate object", () => {
    expect(discover.match(/AS duo_commented_by_me/g)).toHaveLength(1);
    expect(discover.match(/AS viewer_has_active_pair_up/g)).toHaveLength(1);
    expect(discover.match(/AS expressed_by_me/g)).toHaveLength(1);
    expect(discover).toContain(
      "public.dm_direct_access_mode(v_me, m.creator_id, c.id) IN ('full', 'request')"
    );
    expect(discover).toContain("elem - 'interested'");
    expect(discover).toContain("'b', (v_last ->> 'interested')::integer");
    expect(body.match(/AS duo_commented_by_me/g)).toHaveLength(1);
    expect(body.match(/AS viewer_has_active_pair_up/g)).toHaveLength(1);
  });

  it("withdraws only a pinned outgoing interest and refuses a reverse match", () => {
    const lockAt = withdraw.indexOf("ORDER BY o.id");
    expect(lockAt).toBeGreaterThan(-1);
    expect(withdraw.indexOf("FOR UPDATE")).toBeGreaterThan(lockAt);
    const matchedAt = withdraw.indexOf(
      "RAISE EXCEPTION 'Discover interest is matched'"
    );
    const pinAt = withdraw.indexOf("public.discover_pair_up_candidate_pins pin");
    const pinRaiseAt = withdraw.indexOf("RAISE EXCEPTION 'Not a Discover interest'");
    const deleteAt = withdraw.indexOf(
      "DELETE FROM public.social_opportunity_interests"
    );
    expect(matchedAt).toBeGreaterThan(lockAt);
    expect(pinAt).toBeGreaterThan(matchedAt);
    expect(pinRaiseAt).toBeGreaterThan(pinAt);
    expect(deleteAt).toBeGreaterThan(pinRaiseAt);
    const pinGate = withdraw.slice(matchedAt, pinRaiseAt);
    expect(pinGate).toContain("IF NOT EXISTS");
    expect(pinGate).toContain("pin.viewer_id = v_me");
    expect(pinGate).toContain("pin.to_opportunity_id = v_to_id");
    expect(withdraw.match(/DELETE FROM /g)).toHaveLength(1);
    expect(withdraw).toContain("i.from_opportunity_id = v_from_id");
    expect(withdraw).toContain("i.to_opportunity_id = v_to_id");
    expect(withdraw).toContain("i.from_opportunity_id = v_to_id");
    expect(withdraw).toContain("i.to_opportunity_id = v_from_id");
    expect(withdraw).not.toContain("leave_pair_up");
    expect(withdraw).not.toContain("conversations");
    expect(withdraw).not.toContain("conversation_members");
    expect(withdraw).toContain("'withdrawn', v_deleted > 0");
    expect(body).toContain(
      "GRANT EXECUTE ON FUNCTION public.withdraw_discover_pair_up_interest(uuid)"
    );
    expect(body).toContain("TO authenticated");
    expect(connect).not.toContain("Not a Discover interest");
    expect(discover).not.toContain("Not a Discover interest");
  });
});
