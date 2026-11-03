/**
 * Structural contract for Duo mutual-match completion recovery.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261113120000_duo_match_completion_recovery.sql";
const OVERLAY = "src/pages/people/MatchDeckOverlay.tsx";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("duo match completion recovery migration", () => {
  const body = sqlBody(read(MIGRATION));
  const listAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.list_pair_up_candidates("
  );
  const completeAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.complete_pair_up_match("
  );
  const list = body.slice(listAt, completeAt);
  const complete = body.slice(completeAt);

  it("replaces only the Duo list and complete functions", () => {
    expect(listAt).toBeGreaterThanOrEqual(0);
    expect(completeAt).toBeGreaterThan(listAt);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.(express_pair_up_interest|join_pair_up|leave_pair_up|withdraw_duo_pair_up_interest|withdraw_discover_pair_up_interest|connect_discover_pair_up|list_discover_pair_up_candidates|get_my_duo_comment|notify_duo_match_recipient|insert_match_context_message|accept_open_plan_request|create_group_up|renew_group_up|request_group_up)\(/
    );
    expect(list).toContain("RETURNS jsonb");
    expect(list).toContain(
      "REVOKE ALL ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer)"
    );
    expect(list).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_pair_up_candidates(uuid, integer, integer)"
    );
  });

  it("exposes outgoing, mutual_pending, and completed match states", () => {
    expect(list).toContain("AS duo_match_state");
    expect(list).toContain("'completed'");
    expect(list).toContain("'mutual_pending'");
    expect(list).toContain("'outgoing'");
    expect(list).toContain("'none'");
    expect(list).toContain("reference_type = 'pair_up_match'");
    expect(list).toContain("AS expressed_by_me");
    expect(list).toContain("AS duo_commented_by_me");
    expect(list).toContain("AS viewer_has_active_pair_up");
  });

  it("keeps only actionable interests after the window or source end", () => {
    expect(list).toContain("bool_or(in_window) AS in_window");
    expect(list).toContain("s.in_window");
    expect(list).toContain("people_source_is_eligible(o.source_post_id)");
    expect(list).toContain("o.discoverable_until > now()");
    expect(list).toContain("i.from_opportunity_id = o.id");
    expect(list).toContain("i.to_opportunity_id = o.id");
    expect(list).toContain("o.status = 'active'");
    expect(list).not.toContain("status = 'expired'");
    expect(list).not.toContain("status = 'closed'");
  });

  it("allows already-mutual completion after discoverable_until or source end", () => {
    const lockAt = complete.indexOf("FOR UPDATE");
    const outgoingAt = complete.indexOf("INTO v_has_outgoing");
    const incomingAt = complete.indexOf("INTO v_has_incoming");
    const mutualAt = complete.indexOf(
      "IF v_has_outgoing AND v_has_incoming THEN"
    );
    const windowGateAt = complete.indexOf(
      "v_from.discoverable_until <= now()",
      mutualAt
    );
    const eligibleGateAt = complete.indexOf(
      "people_source_is_eligible(v_to.source_post_id)",
      mutualAt
    );
    const notMutualAt = complete.indexOf(
      "RAISE EXCEPTION 'Not a mutual Pair Up'",
      mutualAt
    );
    expect(lockAt).toBeGreaterThan(0);
    expect(outgoingAt).toBeGreaterThan(lockAt);
    expect(incomingAt).toBeGreaterThan(outgoingAt);
    expect(mutualAt).toBeGreaterThan(incomingAt);
    expect(windowGateAt).toBeGreaterThan(mutualAt);
    expect(eligibleGateAt).toBeGreaterThan(mutualAt);
    expect(notMutualAt).toBeGreaterThan(eligibleGateAt);
    expect(complete.indexOf("discoverable_until <= now()")).toBeGreaterThan(
      mutualAt
    );
    expect(
      complete.indexOf("people_source_is_eligible(v_to.source_post_id)")
    ).toBeGreaterThan(mutualAt);
    expect(complete.match(/discoverable_until <= now\(\)/g)).toHaveLength(2);
    expect(
      complete.match(/people_source_is_eligible\(v_to\.source_post_id\)/g)
    ).toHaveLength(1);
    expect(complete).toContain("v_to.status <> 'active'");
    expect(complete).toContain("v_from.status <> 'active'");
    expect(complete).not.toContain("status = 'expired'");
    expect(complete).not.toContain("status = 'closed'");
  });

  it("notifies the recipient exactly once for a new match message", () => {
    const priorAt = complete.indexOf("INTO v_prior_match_msg");
    const insertAt = complete.indexOf(
      "PERFORM public.insert_match_context_message("
    );
    const noticeAt = complete.indexOf("IF v_prior_match_msg IS NULL THEN");
    const notifyAt = complete.indexOf(
      "PERFORM public.notify_duo_match_recipient("
    );
    expect(priorAt).toBeGreaterThan(complete.indexOf("FOR UPDATE"));
    expect(insertAt).toBeGreaterThan(priorAt);
    expect(noticeAt).toBeGreaterThan(insertAt);
    expect(notifyAt).toBeGreaterThan(noticeAt);
    expect(complete).toContain(
      "ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING"
    );
    expect(complete.match(/notify_duo_match_recipient/g)).toHaveLength(1);
  });

  it("leaves Discover, Duo withdrawal, comments, and express unchanged", () => {
    expect(body).not.toContain("withdraw_duo_pair_up_interest");
    expect(body).not.toContain("withdraw_discover_pair_up_interest");
    expect(body).not.toContain("list_discover_pair_up_candidates");
    expect(body).not.toContain("get_my_duo_comment");
    expect(body).not.toContain("express_pair_up_interest");
  });
});

describe("duo match completion recovery client wiring", () => {
  const overlay = read(OVERLAY).replace(/\r\n/g, "\n");

  it("routes mutual_pending to complete and completed away from Heart actions", () => {
    const connectAt = overlay.indexOf("const handleConnect = useCallback");
    expect(connectAt).toBeGreaterThan(0);
    const connect = overlay.slice(connectAt, connectAt + 1800);
    expect(connect).toContain("matchState: current.duo_match_state");
    expect(connect).toContain('if (kind === "complete")');
    expect(connect).toContain('if (kind === "blocked") return');
    expect(connect).toContain('if (kind === "withdraw")');
    expect(connect).toContain('runComplete(opportunityId, "my_plans"');
    expect(connect).toContain("current.display_name");
    expect(connect).toContain('removeCompletedPairUpCandidate("my_plans"');
  });

  it("retries with the same display name and removal callback", () => {
    const retryAt = overlay.indexOf("const handleRetryComplete = useCallback");
    const retry = overlay.slice(retryAt, retryAt + 700);
    expect(retry).toContain("pinned.display_name");
    expect(retry).toContain("removeCompletedPairUpCandidate(scope, opportunityId)");
    expect(retry).toContain("runComplete(opportunityId, scope, pinned.display_name");
  });

  it("clears a failed completion when the authenticated viewer changes", () => {
    expect(overlay).toContain("duoMatchFailedCompletionShouldClear");
    expect(overlay).toContain("previousAuthUserIdRef");
    const effectAt = overlay.indexOf(
      "duoMatchFailedCompletionShouldClear({"
    );
    const effect = overlay.slice(effectAt, effectAt + 350);
    expect(effect).toContain('setPhase("idle")');
    expect(effect).toContain("setPinned(null)");
  });
});
