import { describe, expect, it } from "vitest";
import type { MessageRow } from "../api/services/messaging";
import {
  dedupePrepend,
  mergeNewestPage,
  messageKey,
  tipFromMessages,
} from "./dmMessageMerge";

function msg(
  partial: Partial<MessageRow> & Pick<MessageRow, "id" | "created_at">
): MessageRow {
  return {
    conversation_id: "conv-1",
    sender_user_id: "u1",
    body: partial.body ?? partial.id,
    client_message_id: partial.client_message_id ?? `client-${partial.id}`,
    message_kind: "text",
    reference_type: null,
    reference_id: null,
    reference_snapshot: null,
    ...partial,
  };
}

describe("messageKey", () => {
  it("prefers server id, falls back to client_message_id", () => {
    expect(messageKey(msg({ id: "a", created_at: "2026-01-01T00:00:00Z" }))).toBe(
      "a"
    );
    expect(
      messageKey(
        msg({
          id: "",
          client_message_id: "c1",
          created_at: "2026-01-01T00:00:00Z",
        })
      )
    ).toBe("c1");
  });
});

describe("mergeNewestPage", () => {
  it("appends a newer tip missing from a fresh cache window", () => {
    const cached = [
      msg({ id: "1", created_at: "2026-01-01T00:00:00Z", body: "old" }),
      msg({ id: "2", created_at: "2026-01-01T00:01:00Z", body: "mid" }),
    ];
    const newestPage = [
      msg({ id: "1", created_at: "2026-01-01T00:00:00Z", body: "old" }),
      msg({ id: "2", created_at: "2026-01-01T00:01:00Z", body: "mid" }),
      msg({
        id: "3",
        created_at: "2026-01-01T00:02:00Z",
        body: "inbox tip",
      }),
    ];
    const merged = mergeNewestPage(cached, newestPage);
    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(merged[2].body).toBe("inbox tip");
  });

  it("does not duplicate by server id or client_message_id", () => {
    const sameId = mergeNewestPage(
      [msg({ id: "9", created_at: "2026-01-01T00:02:00Z", body: "a" })],
      [
        msg({ id: "1", created_at: "2026-01-01T00:00:00Z" }),
        msg({ id: "9", created_at: "2026-01-01T00:02:00Z", body: "b" }),
      ]
    );
    expect(sameId.filter((m) => m.id === "9")).toHaveLength(1);
    expect(sameId.find((m) => m.id === "9")?.body).toBe("b");

    const byClientKey = mergeNewestPage(
      [
        msg({
          id: "",
          client_message_id: "cid-9",
          created_at: "2026-01-01T00:02:00Z",
          body: "optimistic",
        }),
      ],
      [
        msg({
          id: "",
          client_message_id: "cid-9",
          created_at: "2026-01-01T00:02:00Z",
          body: "confirmed",
        }),
      ]
    );
    expect(byClientKey).toHaveLength(1);
    expect(byClientKey[0].body).toBe("confirmed");
  });

  it("keeps older loaded history outside the newest page", () => {
    const olderLoaded = msg({
      id: "old-1",
      created_at: "2025-12-01T00:00:00Z",
      body: "ancient",
    });
    const inWindow = msg({
      id: "2",
      created_at: "2026-01-01T00:01:00Z",
      body: "mid",
    });
    const tip = msg({
      id: "3",
      created_at: "2026-01-01T00:02:00Z",
      body: "new",
    });
    const merged = mergeNewestPage(
      [olderLoaded, inWindow],
      [inWindow, tip]
    );
    expect(merged.map((m) => m.id)).toEqual(["old-1", "2", "3"]);
  });

  it("returns existing unchanged when newest page is empty", () => {
    const existing = [
      msg({ id: "1", created_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(mergeNewestPage(existing, [])).toBe(existing);
  });
});

describe("dedupePrepend", () => {
  it("prepends older rows without duplicating ids already present", () => {
    const existing = [
      msg({ id: "2", created_at: "2026-01-01T00:01:00Z" }),
      msg({ id: "3", created_at: "2026-01-01T00:02:00Z" }),
    ];
    const older = [
      msg({ id: "1", created_at: "2026-01-01T00:00:00Z" }),
      msg({ id: "2", created_at: "2026-01-01T00:01:00Z" }),
    ];
    expect(dedupePrepend(existing, older).map((m) => m.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});

describe("tipFromMessages", () => {
  it("returns the newest chronological tip for mark-read", () => {
    expect(tipFromMessages([])).toBeNull();
    const tip = tipFromMessages([
      msg({ id: "1", created_at: "2026-01-01T00:00:00Z" }),
      msg({ id: "9", created_at: "2026-01-01T00:09:00Z" }),
    ]);
    expect(tip).toEqual({
      created_at: "2026-01-01T00:09:00Z",
      id: "9",
    });
  });
});
