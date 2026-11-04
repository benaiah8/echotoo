import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");
const MIG =
  "supabase/migrations/20261119120000_leave_pair_up_and_discover_window.sql";

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

describe("leave_pair_up + Discover window migration", () => {
  const body = read(MIG);

  it("replaces leave_pair_up and list_discover only", () => {
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.leave_pair_up(");
    expect(body).toContain(
      "CREATE OR REPLACE FUNCTION public.list_discover_pair_up_candidates("
    );
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toContain("complete_pair_up_match");
    expect(body).not.toContain("withdraw_duo_pair_up_interest");
    expect(body).not.toContain("withdraw_discover_pair_up_interest");
  });

  it("Leave closes active rows without discoverable_until gate", () => {
    const leave = sliceFn(body, "leave_pair_up");
    expect(leave).toContain("status = 'closed'");
    expect(leave).toContain("AND status = 'active'");
    expect(leave).not.toMatch(
      /AND status = 'active'\s+AND discoverable_until > now\(\)/
    );
    expect(leave).toContain("'closed', v_updated > 0");
  });

  it("Discover requires in-window; no interest keep-alive bypass", () => {
    const discover = sliceFn(body, "list_discover_pair_up_candidates");
    expect(discover).toContain("AND o.discoverable_until > now()");
    expect(discover).toContain(
      "AND public.people_source_is_eligible(o.source_post_id)"
    );
    expect(discover).not.toContain(
      "INNER JOIN public.social_opportunity_interests i\n            ON i.from_opportunity_id = mine.id\n           AND i.to_opportunity_id = o.id"
    );
    expect(discover).toContain("discover_pair_up_candidate_pins");
    expect(discover).toContain("next_cursor");
    expect(discover).toContain("has_more");
  });

  it("frontend Leave honors closed and hard refresh drops retention", () => {
    const api = read("src/api/services/pairUp.ts");
    expect(api).toContain("export type LeavePairUpResult");
    expect(api).toContain("payload?.closed === true");
    expect(api).toContain("return { closed }");

    const hook = read("src/hooks/usePairUpCandidates.ts");
    const hardFnAt = hook.indexOf("const hardRefresh = useCallback");
    expect(hardFnAt).toBeGreaterThanOrEqual(0);
    const hardFn = hook.slice(hardFnAt, hardFnAt + 5500);
    expect(hardFn).toContain("clearDiscoverCommentRetention()");
    expect(hardFn).toContain("uniqueByOpportunityId");
    expect(hardFn).toContain("shouldFetchDiscoverHardRefreshBoostPage");
    expect(hardFn).not.toContain("applyDiscoverServerPage");
  });
});
