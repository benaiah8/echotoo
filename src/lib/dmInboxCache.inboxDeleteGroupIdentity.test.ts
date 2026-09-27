import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxConversationRow } from "../api/services/messaging";

vi.mock("./avatarCache", () => ({
  setCachedAvatar: vi.fn(),
}));

function groupRow(
  id: string,
  viewer_role: InboxConversationRow["viewer_role"]
): InboxConversationRow {
  return {
    conversation_id: id,
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
    created_at: "2026-01-01T00:00:00.000Z",
    member_count: 3,
    member_preview: null,
    viewer_role,
    is_request: false,
    notifications_muted: false,
  };
}

describe("inbox Delete group success cleanup (identity)", () => {
  beforeEach(async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    });
    const identity = await import("./groupConversationIdentityCache");
    identity.__resetGroupConversationIdentityCacheForTests();
    identity.clearGroupConversationIdentityCache();
    const inbox = await import("./dmInboxCache");
    inbox.clearDmInboxCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("F. default inbox removal clears group identity (Delete group path)", async () => {
    const identity = await import("./groupConversationIdentityCache");
    const inbox = await import("./dmInboxCache");
    const viewer = "viewer-1";
    const conversationId = "g-dissolve";
    identity.upsertGroupConversationIdentity(viewer, conversationId, {
      title: "Trip",
      memberCount: 3,
    });
    inbox.setDmInboxCache(viewer, [groupRow(conversationId, "admin")]);

    expect(
      identity.getGroupConversationIdentity(viewer, conversationId)
    ).not.toBeNull();

    inbox.removeDmInboxConversation(viewer, conversationId);

    expect(
      identity.getGroupConversationIdentity(viewer, conversationId)
    ).toBeNull();
  });

  it("I. preserveGroupIdentity still keeps identity for Group Delete chat", async () => {
    const identity = await import("./groupConversationIdentityCache");
    const inbox = await import("./dmInboxCache");
    const viewer = "viewer-1";
    const conversationId = "g-hide";
    identity.upsertGroupConversationIdentity(viewer, conversationId, {
      title: "Trip",
      memberCount: 3,
    });
    inbox.setDmInboxCache(viewer, [groupRow(conversationId, "member")]);

    inbox.removeDmInboxConversation(viewer, conversationId, {
      preserveGroupIdentity: true,
    });

    expect(
      identity.getGroupConversationIdentity(viewer, conversationId)?.title
    ).toBe("Trip");
  });
});
