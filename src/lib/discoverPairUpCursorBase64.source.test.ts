import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const MIG =
  "supabase/migrations/20261120120000_fix_discover_pair_up_candidates_cursor_base64.sql";

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function sliceFn(body: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = body.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = body.indexOf("$function$;", start);
  expect(end).toBeGreaterThan(start);
  return body.slice(start, end + "$function$;".length);
}

describe("Discover cursor base64 whitespace fix migration", () => {
  const body = read(MIG);

  it("replaces only list_discover_pair_up_candidates", () => {
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates("
    );
    expect(body).not.toContain("CREATE OR REPLACE FUNCTION public.leave_pair_up");
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toContain("complete_pair_up_match");
    expect(body).not.toContain("withdraw_duo_pair_up_interest");
  });

  it("strips base64 whitespace on encode and decode; keeps cursor keys", () => {
    const discover = sliceFn(body, "list_discover_pair_up_candidates");
    expect(discover).toContain("regexp_replace(");
    expect(discover).toMatch(/regexp_replace\(\s*encode\(/);
    expect(discover).toMatch(
      /v_cursor_raw := regexp_replace\(\s*replace\(replace\(btrim\(p_cursor\)/
    );
    expect(discover).toContain("E'\\\\s+'");
    expect(discover).toContain("'b', (v_last ->> 'interested')::integer");
    expect(discover).toContain("'t', v_last ->> 'created_at'");
    expect(discover).toContain("'i', v_last ->> 'opportunity_id'");
    expect(discover).toContain(
      "IF v_has_more AND (v_next_cursor IS NULL OR btrim(v_next_cursor) = '') THEN"
    );
  });

  it("preserves eligibility, Discover pref, pins, and interest buckets", () => {
    const discover = sliceFn(body, "list_discover_pair_up_candidates");
    expect(discover).toContain("p2p_discover_enabled");
    expect(discover).toContain("AND o.discoverable_until > now()");
    expect(discover).toContain("people_source_is_eligible");
    expect(discover).toContain("discover_pair_up_candidate_pins");
    expect(discover).toContain("inbound_creators");
    expect(discover).toContain("UNION ALL");
    expect(discover).toContain("interested = 1");
    expect(discover).toContain("interested = 0");
    expect(discover).toContain("'candidates'");
    expect(discover).toContain("'has_more'");
    expect(discover).toContain("'next_cursor'");
    expect(discover).toContain("duo_commented_by_me");
    expect(discover).toContain("viewer_has_active_pair_up");
  });
});
