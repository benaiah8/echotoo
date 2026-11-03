import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sharedPostInboxPreview } from "./sharedPostInboxPreview";

const note = "See you there";

describe("sharedPostInboxPreview", () => {
  it("uses a neutral Duo inbox line with and without a note", () => {
    expect(
      sharedPostInboxPreview({ note, postType: "hangout", origin: "duo" })
    ).toBe(`Duo comment · ${note}`);
    expect(
      sharedPostInboxPreview({ note: "  ", postType: "experience", origin: "duo" })
    ).toBe("Duo comment");
  });

  it("keeps Event and Post wording for ordinary shares", () => {
    expect(sharedPostInboxPreview({ note, postType: "hangout" })).toBe(
      `Shared an event · ${note}`
    );
    expect(sharedPostInboxPreview({ note: "", postType: "hangout" })).toBe(
      "Shared an event"
    );
    expect(sharedPostInboxPreview({ note, postType: "experience" })).toBe(
      `Shared a post · ${note}`
    );
    expect(sharedPostInboxPreview({ note: null, postType: "experience" })).toBe(
      "Shared a post"
    );
  });

  it("truncates the inbox preview at 200 characters", () => {
    const long = "n".repeat(250);
    const preview = sharedPostInboxPreview({
      note: long,
      postType: "hangout",
      origin: "duo",
    });
    expect(preview.length).toBe(200);
    expect(preview.startsWith("Duo comment · ")).toBe(true);
  });
});

describe("duo comment preview migration", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20261104120000_duo_comment_preview_wording.sql"
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  it("keeps the five-argument signature and does not drop the function", () => {
    expect(sql).toContain("p_duo_comment boolean DEFAULT false");
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    expect(
      sql.match(/CREATE OR REPLACE FUNCTION public\.send_shared_post_message\(/g)
    ).toHaveLength(1);
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO public, pg_temp");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.send_shared_post_message(uuid, uuid, text, uuid, boolean)"
    );
    expect(sql).toContain("TO authenticated");
  });

  it("splits Duo inbox and note-free push previews", () => {
    const inserted = sql.slice(sql.lastIndexOf("IF v_inserted THEN"));
    const duo = inserted.slice(
      inserted.indexOf("IF COALESCE(p_duo_comment, false) THEN"),
      inserted.indexOf("ELSIF v_post_type = 'hangout' THEN")
    );
    expect(duo).toContain("v_push_preview := 'Sent you a Duo comment';");
    expect(duo).toContain("left('Duo comment · ' || v_note, 200)");
    expect(duo).toContain("v_inbox_preview := 'Duo comment';");
    expect(duo).not.toMatch(/v_push_preview :=[^;]*v_note/);
    expect(sql).toContain("last_message_preview = v_inbox_preview");
    expect(sql).toContain("v_push_preview,");
  });

  it("uses event and post wording for ordinary inbox and push", () => {
    expect(sql).toContain("left('Shared an event · ' || v_note, 200)");
    expect(sql).toContain("v_inbox_preview := 'Shared an event';");
    expect(sql).toContain("left('Shared a post · ' || v_note, 200)");
    expect(sql).toContain("v_inbox_preview := 'Shared a post';");
    expect(sql).toContain("v_push_preview := v_inbox_preview;");
    expect(sql).not.toContain("Shared a hangout");
    expect(sql).not.toContain("Shared an experience");
  });

  it("enqueues only after insert and still rejects a duplicate Duo comment", () => {
    const pushAt = sql.indexOf("enqueue_dm_push_outbox_for_message");
    const insertedAt = sql.lastIndexOf("IF v_inserted THEN", pushAt);
    const earlyReturn = sql.indexOf("'created', false");
    expect(earlyReturn).toBeGreaterThan(0);
    expect(earlyReturn).toBeLessThan(insertedAt);
    expect(insertedAt).toBeLessThan(pushAt);
    expect(sql).toContain("RAISE EXCEPTION 'DUO_COMMENT_ALREADY_SENT'");
    expect(sql.indexOf("DUO_COMMENT_ALREADY_SENT")).toBeLessThan(pushAt);
    expect(sql).toContain(
      "ON CONFLICT (conversation_id, sender_user_id, client_message_id) DO NOTHING"
    );
  });

  it("does not change the message body, snapshot, or dm_message route", () => {
    expect(sql).toContain("v_note,");
    expect(sql).toContain("'origin', 'duo'");
    expect(sql).toContain("p_post_id,");
    expect(sql).not.toContain("send-dm-push");
    const push = readFileSync(
      join(process.cwd(), "supabase/functions/send-dm-push/index.ts"),
      "utf8"
    );
    expect(push).toContain('? "group_message" : "dm_message"');
    expect(push).toContain("conversationId: input.conversationId");
  });
});
