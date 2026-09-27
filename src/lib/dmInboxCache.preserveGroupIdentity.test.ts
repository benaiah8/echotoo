import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxConversationRow } from "../api/services/messaging";

vi.mock("./avatarCache", () => ({
  setCachedAvatar: vi.fn(),
}));

function groupRow(id: string, title: string): InboxConversationRow {
  return {
    conversation_id: id,
    kind: "group",
    other_user_id: null,
    display_name: null,
    username: null,
    avatar_url: null,
    title,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: 0,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00.000Z",
    member_count: 3,
    member_preview: null,
    viewer_role: null,
    is_request: false,
    notifications_muted: false,
  };
}

describe("removeDmInboxConversation preserveGroupIdentity", () => {
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
    });
    const identity = await import("./groupConversationIdentityCache");
    identity.__resetGroupConversationIdentityCacheForTests();
    identity.clearGroupConversationIdentityCache();
    const inbox = await import("./dmInboxCache");
    inbox.clearDmInboxCache();
  });

  afterEach(async () => {
    const identity = await import("./groupConversationIdentityCache");
    identity.__resetGroupConversationIdentityCacheForTests();
    identity.clearGroupConversationIdentityCache();
    const inbox = await import("./dmInboxCache");
    inbox.clearDmInboxCache();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("default removal clears group identity (leave / DM delete)", async () => {
    const {
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
    } = await import("./groupConversationIdentityCache");
    const { setDmInboxCache, removeDmInboxConversation, getDmInboxCache } =
      await import("./dmInboxCache");

    setDmInboxCache("viewer-1", [groupRow("g1", "Hike")]);
    upsertGroupConversationIdentity("viewer-1", "g1", {
      title: "Hike",
      memberCount: 3,
    });
    expect(getGroupConversationIdentity("viewer-1", "g1")?.title).toBe("Hike");

    const next = removeDmInboxConversation("viewer-1", "g1");
    expect(next).toEqual([]);
    expect(getDmInboxCache("viewer-1")?.conversations).toEqual([]);
    expect(getGroupConversationIdentity("viewer-1", "g1")).toBeNull();
  });

  it("preserveGroupIdentity keeps identity after inbox row removal", async () => {
    const {
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
    } = await import("./groupConversationIdentityCache");
    const { setDmInboxCache, removeDmInboxConversation, getDmInboxCache } =
      await import("./dmInboxCache");

    setDmInboxCache("viewer-1", [groupRow("g1", "Hike")]);
    upsertGroupConversationIdentity("viewer-1", "g1", {
      title: "Hike",
      memberCount: 3,
    });

    const next = removeDmInboxConversation("viewer-1", "g1", {
      preserveGroupIdentity: true,
    });
    expect(next).toEqual([]);
    expect(getDmInboxCache("viewer-1")?.conversations).toEqual([]);
    expect(getGroupConversationIdentity("viewer-1", "g1")).toMatchObject({
      title: "Hike",
      memberCount: 3,
    });
  });
});
