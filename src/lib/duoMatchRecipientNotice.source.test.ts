/**
 * Structural contract for the Duo match recipient notice.
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261111120000_duo_match_recipient_notice.sql";
const PRIOR_COMPLETE =
  "supabase/migrations/20260908120000_match_context_messages.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sqlBody(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("duo match recipient notice migration", () => {
  const sql = read(MIGRATION);
  const body = sqlBody(sql);
  const prior = sqlBody(read(PRIOR_COMPLETE));
  const notifyAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.notify_duo_match_recipient("
  );
  const completeAt = body.indexOf(
    "CREATE OR REPLACE FUNCTION public.complete_pair_up_match("
  );
  const notify = body.slice(notifyAt, completeAt);
  const complete = body.slice(completeAt);

  it("adds a private notifier and replaces only match completion", () => {
    expect(notifyAt).toBeGreaterThanOrEqual(0);
    expect(completeAt).toBeGreaterThan(notifyAt);
    expect(body.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(body).not.toContain("DROP FUNCTION");
    expect(body).not.toContain("CASCADE");
    expect(body).not.toContain("CREATE OR REPLACE FUNCTION public.insert_match_context_message");
    expect(body).not.toContain("accept_open_plan_request");
    expect(body).not.toMatch(
      /express_pair_up_interest|withdraw_duo_pair_up_interest|withdraw_discover_pair_up_interest|join_pair_up|leave_pair_up|list_pair_up_candidates|list_discover_pair_up_candidates|duo_comment/
    );
    expect(notify).toContain("SECURITY DEFINER");
    expect(notify).toContain("SET search_path TO public, pg_temp");
    expect(notify).toContain(
      "REVOKE ALL ON FUNCTION public.notify_duo_match_recipient(uuid, uuid, uuid, uuid)"
    );
    expect(notify).toContain("FROM PUBLIC, anon, authenticated");
    expect(notify).not.toContain("GRANT EXECUTE ON FUNCTION public.notify_duo_match_recipient");
  });

  it("notifies only after a new match message, and only the other member", () => {
    const priorSelect = complete.indexOf("INTO v_prior_match_msg");
    const insertAt = complete.indexOf("PERFORM public.insert_match_context_message(");
    const noticeAt = complete.indexOf("IF v_prior_match_msg IS NULL THEN");
    const callAt = complete.indexOf("PERFORM public.notify_duo_match_recipient(");
    expect(priorSelect).toBeGreaterThan(complete.indexOf("FOR UPDATE"));
    expect(priorSelect).toBeGreaterThan(complete.indexOf("Not a mutual Pair Up"));
    expect(insertAt).toBeGreaterThan(priorSelect);
    expect(noticeAt).toBeGreaterThan(insertAt);
    expect(callAt).toBeGreaterThan(noticeAt);
    expect(complete.slice(callAt, callAt + 180)).toContain("v_me");
    expect(complete.slice(callAt, callAt + 180)).toContain("v_other");
    expect(complete).toContain("'You matched through P2P'");
    expect(complete).toContain("ON CONFLICT (direct_user_low, direct_user_high) DO NOTHING");
    expect(complete).toContain("dm_grant_direct_access(v_me, v_other, 'full', 'pair_up', NULL, NULL)");
    expect(complete).toContain("dm_grant_direct_access(v_other, v_me, 'full', 'pair_up', NULL, NULL)");
  });

  it("unhides and increments unread for the recipient, with one idempotent outbox row", () => {
    expect(notify).toContain("inbox_hidden_at = NULL");
    expect(notify).toContain("unread_count = m.unread_count + 1");
    expect(notify).toContain("m.user_id = p_recipient_user_id");
    expect(notify).toContain("m.user_id <> p_sender_user_id");
    expect(notify).toContain("m.notifications_muted = false");
    expect(notify).toContain("INSERT INTO public.dm_push_outbox");
    expect(notify).toContain(
      "ON CONFLICT (recipient_user_id, message_id)"
    );
    expect(notify).toContain("DO NOTHING");
    expect(notify).not.toContain("SET notifications_muted");
    const unreadAt = notify.indexOf("unread_count = m.unread_count + 1");
    const outboxAt = notify.indexOf("INSERT INTO public.dm_push_outbox");
    expect(notify.slice(unreadAt, outboxAt)).not.toContain("notifications_muted");
  });

  it("keeps push enqueue and drain failures from reversing the match", () => {
    const enqueueAt = notify.indexOf("INSERT INTO public.dm_push_outbox");
    const kickAt = notify.indexOf("PERFORM net.http_post(");
    expect(notify.indexOf("EXCEPTION", enqueueAt)).toBeGreaterThan(enqueueAt);
    expect(notify.indexOf("EXCEPTION", kickAt)).toBeGreaterThan(kickAt);
    expect(notify).toContain("duo match push enqueue failed");
    expect(notify).toContain("duo match push drain kick failed");
    expect(notify).toContain("send-dm-push");
    expect(complete.indexOf("RAISE EXCEPTION")).toBeLessThan(
      complete.indexOf("PERFORM public.notify_duo_match_recipient(")
    );
    expect(complete.slice(complete.indexOf("IF v_prior_match_msg IS NULL THEN"))).not.toContain(
      "RAISE EXCEPTION"
    );
  });

  it("leaves Open Plan accept and the shared match helper unchanged", () => {
    expect(prior).toContain("CREATE OR REPLACE FUNCTION public.insert_match_context_message(");
    expect(prior).toContain("CREATE OR REPLACE FUNCTION public.accept_open_plan_request(");
    expect(prior).toContain("No unread/push.");
    expect(body).not.toContain("open_plan_request");
    expect(body).not.toContain("open_plan_match");
  });
});
