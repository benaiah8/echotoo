import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./avatarCache", () => ({
  setCachedAvatar: vi.fn(),
}));

describe("dmConversationParticipantsCache", () => {
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
    const participants = await import("./dmConversationParticipantsCache");
    participants.__resetDmConversationParticipantsCacheForTests();
    const identity = await import("./groupConversationIdentityCache");
    identity.__resetGroupConversationIdentityCacheForTests();
    identity.clearGroupConversationIdentityCache();
  });

  afterEach(async () => {
    const participants = await import("./dmConversationParticipantsCache");
    participants.__resetDmConversationParticipantsCacheForTests();
    const identity = await import("./groupConversationIdentityCache");
    identity.__resetGroupConversationIdentityCacheForTests();
    identity.clearGroupConversationIdentityCache();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("preserves distinct joined_at through cache round-trip", async () => {
    const {
      setDmConversationParticipantsCache,
      getDmConversationParticipantsCache,
      participantsEntryToMemberRows,
    } = await import("./dmConversationParticipantsCache");
    const { deriveMemberPreviewFromMembers } = await import(
      "./groupConversationIdentityCache"
    );

    const members = [
      {
        user_id: "u-old",
        role: "admin",
        joined_at: "2024-01-01T00:00:00.000Z",
        display_name: "Old",
        username: "old",
        avatar_url: null,
      },
      {
        user_id: "u-new",
        role: "member",
        joined_at: "2025-08-01T00:00:00.000Z",
        display_name: "New",
        username: "new",
        avatar_url: null,
      },
    ];

    setDmConversationParticipantsCache("viewer-1", "conv-1", members);
    const entry = getDmConversationParticipantsCache("viewer-1", "conv-1");
    expect(entry?.members.map((m) => m.joined_at)).toEqual([
      "2024-01-01T00:00:00.000Z",
      "2025-08-01T00:00:00.000Z",
    ]);

    const rows = participantsEntryToMemberRows(entry!);
    expect(rows.map((m) => m.joined_at)).toEqual([
      "2024-01-01T00:00:00.000Z",
      "2025-08-01T00:00:00.000Z",
    ]);
    expect(rows[0].joined_at).not.toBe(rows[1].joined_at);
    expect(deriveMemberPreviewFromMembers(rows).map((m) => m.userId)).toEqual([
      "u-new",
      "u-old",
    ]);
  });
});
