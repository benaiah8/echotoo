/**
 * Contract tests for optional Group Up request notes (SQL only).
 * Does not execute SQL or connect to a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NOTE_SQL = join(
  process.cwd(),
  "supabase/migrations/20261115120000_group_up_request_note.sql"
);
const APPROVAL_PUSH_SQL = join(
  process.cwd(),
  "supabase/migrations/20261106120000_group_up_request_approval_push.sql"
);
const ACCEPT_SQL = join(
  process.cwd(),
  "supabase/migrations/20260916120000_group_up_g3_accept_decline.sql"
);
const CAP_SQL = join(
  process.cwd(),
  "supabase/migrations/20261030120000_group_active_member_cap_200.sql"
);

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.",
    start + needle.length
  );
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("Group Up request note SQL", () => {
  const sql = readFileSync(NOTE_SQL, "utf8").replace(/\r\n/g, "\n");
  const requestBody = functionBody(sql, "request_group_up");
  const listBody = functionBody(sql, "list_group_up_requesters");
  const reuseIdx = requestBody.indexOf("Existing unresolved request");
  const noteIdx = requestBody.indexOf("v_note :=");
  const insertIdx = requestBody.indexOf("INSERT INTO public.group_up_requests");

  it("adds a nullable note column with a 200-character check", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS note text");
    expect(sql).toContain("group_up_requests_note_len");
    expect(sql).toContain("char_length(note) <= 200");
    expect(sql).toContain("Local only. Do not apply without explicit approval.");
  });

  it("extends request_group_up with optional p_note and drops the one-arg overload", () => {
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.request_group_up(uuid);"
    );
    expect(sql).toContain("p_note text DEFAULT NULL");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.request_group_up(uuid, text)"
    );
    expect(sql).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.request_group_up(uuid);"
    );
    expect(sql).not.toContain("DROP CASCADE");
    expect(requestBody).toContain(
      "v_note := NULLIF(btrim(COALESCE(p_note, '')), '')"
    );
  });

  it("trims notes, rejects over 200 chars, and stores note only on insert", () => {
    expect(noteIdx).toBeGreaterThan(reuseIdx);
    expect(insertIdx).toBeGreaterThan(noteIdx);
    expect(requestBody).toContain("char_length(v_note) > 200");
    expect(requestBody).toContain("Group Up request note is too long");
    const insertValues = requestBody.slice(
      insertIdx,
      requestBody.indexOf("RETURNING *")
    );
    expect(insertValues).toContain("note");
    expect(insertValues).toContain("v_note");
  });

  it("does not overwrite the note on pending/accepted reuse or race recovery", () => {
    const reuseBlock = requestBody.slice(reuseIdx, noteIdx);
    expect(reuseBlock).toContain("RETURN jsonb_build_object");
    expect(reuseBlock).not.toMatch(/^\s*UPDATE\b/im);
    expect(reuseBlock).not.toContain("v_note");

    const raceIdx = requestBody.indexOf("Race recovery");
    expect(raceIdx).toBeGreaterThan(insertIdx);
    const raceBlock = requestBody.slice(raceIdx);
    expect(raceBlock).not.toMatch(/^\s*UPDATE\b/im);
    expect(raceBlock).not.toContain("v_note");
  });

  it("preserves eligibility, ownership, membership, block, declined, and 200-cap checks", () => {
    expect(requestBody).toContain("group_up_source_is_eligible");
    expect(requestBody).toContain("Cannot request your own Group Up");
    expect(requestBody).toContain("Already a group member");
    expect(requestBody).toContain("Group member limit is 200");
    expect(requestBody).toContain("users_are_blocked_pair");
    expect(requestBody).toContain("v_req.status = 'declined'");
    expect(requestBody).toContain("unique_violation");
  });

  it("returns the note from the host-only requester list", () => {
    expect(listBody).toContain("o.creator_id = v_me");
    expect(listBody).toContain("NULLIF(btrim(r.note), '') AS note");
    expect(listBody).toContain("'note', t.note");
    expect(listBody).toContain("r.status = 'pending'");
  });

  it("does not copy undeployed approval-push enqueue or change accept/decline", () => {
    expect(sql).not.toContain("enqueue_group_up_push");
    expect(sql).not.toContain("group_up_push_outbox");
    expect(sql).not.toContain("kick_group_up_push_drain");
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.accept_group_up_request/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.decline_group_up_request/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.withdraw_group_up_request/
    );

    const push = readFileSync(APPROVAL_PUSH_SQL, "utf8");
    expect(push).toContain("enqueue_group_up_push");
    expect(push).toContain("Local only");

    const accept = readFileSync(ACCEPT_SQL, "utf8");
    expect(accept).toContain("accept_group_up_request");
    expect(accept).toContain("decline_group_up_request");

    const cap = functionBody(
      readFileSync(CAP_SQL, "utf8").replace(/\r\n/g, "\n"),
      "request_group_up"
    );
    expect(cap).toContain("Group member limit is 200");
    expect(cap).not.toContain("p_note");
    expect(cap).not.toContain("enqueue_group_up_push");
  });
});
