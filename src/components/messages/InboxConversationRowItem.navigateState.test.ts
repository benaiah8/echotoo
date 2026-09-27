import { describe, expect, it } from "vitest";
import { inboxRowNavigateState } from "./InboxConversationRowItem";
import type { InboxConversationRow } from "../../api/services/messaging";

function baseRow(
  overrides: Partial<InboxConversationRow> = {}
): InboxConversationRow {
  return {
    conversation_id: "g1",
    kind: "group",
    other_user_id: null,
    display_name: null,
    username: null,
    avatar_url: null,
    title: "Trip",
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: 0,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00Z",
    member_count: 2,
    member_preview: [
      {
        user_id: "u1",
        avatar_url: null,
        display_name: "A",
        username: "a",
        joined_at: "2026-01-01T00:00:00Z",
      },
    ],
    is_request: false,
    notifications_muted: false,
    viewer_role: null,
    ...overrides,
  };
}

describe("inboxRowNavigateState backgroundLocation", () => {
  it("normalizes a conversation path to /messages", () => {
    const state = inboxRowNavigateState(baseRow(), {
      pathname: "/messages/old-conv",
      search: "",
      hash: "",
      key: "k",
      state: null,
    });
    expect(
      (state.backgroundLocation as { pathname: string }).pathname
    ).toBe("/messages");
  });

  it("preserves kind and memberPreview", () => {
    const state = inboxRowNavigateState(baseRow(), {
      pathname: "/messages",
      search: "",
      hash: "",
      key: "k",
      state: null,
    });
    expect(state.kind).toBe("group");
    expect(state.groupTitle).toBe("Trip");
    expect(state.memberCount).toBe(2);
    expect(state.memberPreview).toEqual([
      {
        userId: "u1",
        avatarUrl: null,
        displayName: "A",
        username: "a",
      },
    ]);
  });
});
