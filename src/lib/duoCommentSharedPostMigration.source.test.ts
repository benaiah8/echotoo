/**
 * Structural contract for the Duo shared-post migration.
 * Does not execute SQL or exercise live concurrency.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261103120000_duo_comment_shared_post.sql";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

function sliceBetween(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe("duo comment shared_post migration", () => {
  const sql = read(MIGRATION);

  it("replaces the four-argument function with one defaulted five-argument signature", () => {
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.send_shared_post_message(uuid, uuid, text, uuid);"
    );
    expect(sql).not.toMatch(/DROP\s+FUNCTION[\s\S]*CASCADE/i);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.send_shared_post_message("
    );
    expect(sql).toContain("p_duo_comment boolean DEFAULT false");
    expect(
      sql.match(/CREATE OR REPLACE FUNCTION public\.send_shared_post_message\(/g)
    ).toHaveLength(1);
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid, boolean)"
    );
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO public, pg_temp");
  });

  it("keeps ordinary shares on the existing snapshot and outside the Duo index", () => {
    const ordinary = sliceBetween(
      sql,
      "ELSE\n    v_snapshot := jsonb_build_object(",
      "END IF;"
    );
    expect(ordinary).toContain("'v', 1");
    expect(ordinary).toContain("'post_type', v_post_type");
    expect(ordinary).not.toContain("'origin'");
    expect(sql).toContain(
      "WHERE message_kind = 'shared_post'\n    AND reference_type = 'post'\n    AND reference_snapshot->>'origin' = 'duo'"
    );
  });

  it("writes origin duo only after a direct conversation and any historical pair_up row", () => {
    const duo = sliceBetween(
      sql,
      "IF COALESCE(p_duo_comment, false) THEN",
      "ELSE\n    v_snapshot := jsonb_build_object("
    );
    expect(duo).toContain("v_kind IS DISTINCT FROM 'direct'");
    expect(duo).toContain("DUO_COMMENT_NOT_AVAILABLE");
    expect(duo).toContain("o.kind = 'pair_up'");
    expect(duo).toContain("o.creator_id = v_other");
    expect(duo).toContain("o.source_post_id = p_post_id");
    const opportunityQuery = sliceBetween(
      duo,
      "FROM public.social_opportunities o",
      ") THEN"
    );
    expect(opportunityQuery).not.toMatch(/\bstatus\b|discoverable_until/);
    expect(duo).toContain("'origin', 'duo'");
    expect(sql).not.toContain("express_pair_up_interest");
    expect(sql).not.toContain("join_pair_up");
    expect(sql).not.toContain("complete_pair_up_match");
  });

  it("keeps client-id retry ahead of gates, then the column conflict target", () => {
    const retryAt = sql.indexOf("AND m.client_message_id = p_client_message_id;");
    const createdFalseAt = sql.indexOf("'created', false");
    const blockedAt = sql.indexOf("users_are_blocked_pair");
    const deniedAt = sql.indexOf("DM_DIRECT_ACCESS_DENIED");
    const strangerAt = sql.indexOf("dm_direct_assert_can_send_new");
    const visibilityAt = sql.indexOf("can_view_post_as");
    const duoAt = sql.indexOf("IF COALESCE(p_duo_comment, false) THEN");
    const insertAt = sql.indexOf("INSERT INTO public.messages");
    expect(retryAt).toBeGreaterThan(0);
    expect(createdFalseAt).toBeGreaterThan(retryAt);
    expect(blockedAt).toBeGreaterThan(createdFalseAt);
    expect(deniedAt).toBeGreaterThan(blockedAt);
    expect(strangerAt).toBeGreaterThan(deniedAt);
    expect(visibilityAt).toBeGreaterThan(strangerAt);
    expect(duoAt).toBeGreaterThan(visibilityAt);
    expect(insertAt).toBeGreaterThan(duoAt);
    expect(sql).toContain("char_length(v_note) > 200");
    expect(sql).toContain(
      "ON CONFLICT (conversation_id, sender_user_id, client_message_id) DO NOTHING"
    );
    expect(sql).not.toContain("ON CONFLICT ON CONSTRAINT");
  });

  it("maps only the Duo index violation to DUO_COMMENT_ALREADY_SENT", () => {
    const handler = sliceBetween(
      sql,
      "EXCEPTION\n    WHEN unique_violation THEN",
      "END;"
    );
    expect(handler).toContain(
      "GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;"
    );
    expect(handler).toContain(
      "v_constraint = 'messages_duo_comment_per_post_uniq'"
    );
    expect(handler).toContain("RAISE EXCEPTION 'DUO_COMMENT_ALREADY_SENT'");
    expect(handler.trimEnd().endsWith("RAISE;")).toBe(true);
  });

  it("still enqueues push only after a new insert and returns the existing shape", () => {
    expect(sql).toContain("enqueue_dm_push_outbox_for_message");
    expect(sql).toContain("'created', v_inserted");
    expect(sql).toContain("'reference_snapshot', v_msg.reference_snapshot");
    const pushAt = sql.indexOf("enqueue_dm_push_outbox_for_message");
    const insertedAt = sql.lastIndexOf("IF v_inserted THEN", pushAt);
    expect(insertedAt).toBeGreaterThan(0);
    expect(insertedAt).toBeLessThan(pushAt);
  });

  it("indexes one Duo comment per conversation, sender, and source post", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS messages_duo_comment_per_post_uniq"
    );
    expect(sql).toContain(
      "ON public.messages (conversation_id, sender_user_id, reference_id)"
    );
  });
});
