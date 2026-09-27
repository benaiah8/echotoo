import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./avatarCache", () => ({
  setCachedAvatar: vi.fn(),
}));

describe("groupConversationIdentityCache", () => {
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
    const mod = await import("./groupConversationIdentityCache");
    mod.__resetGroupConversationIdentityCacheForTests();
    mod.clearGroupConversationIdentityCache();
  });

  afterEach(async () => {
    const mod = await import("./groupConversationIdentityCache");
    mod.__resetGroupConversationIdentityCacheForTests();
    mod.clearGroupConversationIdentityCache();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("upserts title and memberCount and hydrates from disk after memory clear", async () => {
    const {
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
      __resetGroupConversationIdentityCacheForTests,
    } = await import("./groupConversationIdentityCache");

    upsertGroupConversationIdentity("viewer-1", "conv-a", {
      title: "Weekend hike",
      memberCount: 4,
    });

    expect(getGroupConversationIdentity("viewer-1", "conv-a")).toMatchObject({
      kind: "group",
      title: "Weekend hike",
      memberCount: 4,
    });

    __resetGroupConversationIdentityCacheForTests();
    const again = getGroupConversationIdentity("viewer-1", "conv-a");
    expect(again?.title).toBe("Weekend hike");
    expect(again?.memberCount).toBe(4);
    expect(again?.members).toBeUndefined();
  });

  it("derives latest-joined memberPreview when full members are set", async () => {
    const {
      setGroupConversationIdentityMembers,
      getGroupConversationIdentity,
      deriveMemberPreviewFromMembers,
    } = await import("./groupConversationIdentityCache");

    const members = [
      {
        user_id: "u-old",
        role: "admin",
        joined_at: "2024-01-01T00:00:00.000Z",
        display_name: "Old",
        username: "old",
        avatar_url: "https://example.com/old.jpg",
      },
      {
        user_id: "u-new",
        role: "member",
        joined_at: "2025-06-01T00:00:00.000Z",
        display_name: "New",
        username: "new",
        avatar_url: null,
      },
      {
        user_id: "u-mid",
        role: "member",
        joined_at: "2024-06-01T00:00:00.000Z",
        display_name: "Mid",
        username: "mid",
        avatar_url: null,
      },
    ];

    expect(deriveMemberPreviewFromMembers(members).map((m) => m.userId)).toEqual(
      ["u-new", "u-mid", "u-old"]
    );

    setGroupConversationIdentityMembers("viewer-1", "conv-b", members);
    const entry = getGroupConversationIdentity("viewer-1", "conv-b");
    expect(entry?.memberCount).toBe(3);
    expect(entry?.memberPreview?.map((m) => m.userId)).toEqual([
      "u-new",
      "u-mid",
      "u-old",
    ]);
    expect(entry?.members?.length).toBe(3);
  });

  it("seeds from inbox rows and skips directs", async () => {
    const {
      seedGroupIdentitiesFromInbox,
      getGroupConversationIdentity,
    } = await import("./groupConversationIdentityCache");

    seedGroupIdentitiesFromInbox("viewer-1", [
      {
        conversation_id: "g1",
        kind: "group",
        title: "Plan",
        member_count: 2,
        member_preview: [
          {
            user_id: "u1",
            avatar_url: null,
            display_name: "One",
            username: "one",
            joined_at: "2025-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        conversation_id: "d1",
        kind: "direct",
        title: null,
        member_count: null,
      },
    ]);

    expect(getGroupConversationIdentity("viewer-1", "g1")?.title).toBe("Plan");
    expect(
      getGroupConversationIdentity("viewer-1", "g1")?.memberPreview?.[0]?.userId
    ).toBe("u1");
    expect(getGroupConversationIdentity("viewer-1", "d1")).toBeNull();
  });

  it("inbox bulk seed persists the bag once", async () => {
    const {
      seedGroupIdentitiesFromInbox,
      __getGroupIdentityPersistWriteCountForTests,
      __resetGroupConversationIdentityCacheForTests,
    } = await import("./groupConversationIdentityCache");

    __resetGroupConversationIdentityCacheForTests();
    seedGroupIdentitiesFromInbox("viewer-1", [
      {
        conversation_id: "g1",
        kind: "group",
        title: "One",
        member_count: 1,
      },
      {
        conversation_id: "g2",
        kind: "group",
        title: "Two",
        member_count: 2,
      },
      {
        conversation_id: "g3",
        kind: "group",
        title: "Three",
        member_count: 3,
      },
    ]);

    expect(__getGroupIdentityPersistWriteCountForTests()).toBe(1);
  });

  it("stale inbox preview does not overwrite preview from newer full members", async () => {
    const {
      setGroupConversationIdentityMembers,
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
    } = await import("./groupConversationIdentityCache");

    const members = [
      {
        user_id: "u-a",
        role: "admin",
        joined_at: "2025-01-01T00:00:00.000Z",
        display_name: "A",
        username: "a",
        avatar_url: null,
      },
      {
        user_id: "u-b",
        role: "member",
        joined_at: "2025-02-01T00:00:00.000Z",
        display_name: "B",
        username: "b",
        avatar_url: null,
      },
    ];
    setGroupConversationIdentityMembers("viewer-1", "conv-p", members);
    const afterMembers = getGroupConversationIdentity("viewer-1", "conv-p");
    const membersAt = afterMembers?.membersUpdatedAt ?? 0;
    expect(afterMembers?.memberPreview?.map((m) => m.userId)).toEqual([
      "u-b",
      "u-a",
    ]);

    upsertGroupConversationIdentity("viewer-1", "conv-p", {
      title: "Updated title",
      memberCount: 9,
      memberPreview: [
        {
          userId: "stale-only",
          displayName: "Stale",
          joinedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      previewUpdatedAt: membersAt - 1,
    });

    const afterStale = getGroupConversationIdentity("viewer-1", "conv-p");
    expect(afterStale?.title).toBe("Updated title");
    expect(afterStale?.memberCount).toBe(9);
    expect(afterStale?.memberPreview?.map((m) => m.userId)).toEqual([
      "u-b",
      "u-a",
    ]);
    expect(afterStale?.members?.length).toBe(2);
  });

  it("newer inbox preview can replace when stamp beats membersUpdatedAt", async () => {
    const {
      setGroupConversationIdentityMembers,
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
    } = await import("./groupConversationIdentityCache");

    setGroupConversationIdentityMembers("viewer-1", "conv-n", [
      {
        user_id: "u-old",
        role: "member",
        joined_at: "2024-01-01T00:00:00.000Z",
        display_name: "Old",
        username: "old",
        avatar_url: null,
      },
    ]);
    const membersAt =
      getGroupConversationIdentity("viewer-1", "conv-n")?.membersUpdatedAt ?? 0;

    upsertGroupConversationIdentity("viewer-1", "conv-n", {
      memberPreview: [
        {
          userId: "u-fresh",
          displayName: "Fresh",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      previewUpdatedAt: membersAt + 10,
    });

    expect(
      getGroupConversationIdentity("viewer-1", "conv-n")?.memberPreview?.map(
        (m) => m.userId
      )
    ).toEqual(["u-fresh"]);
  });

  it("exposes soft freshness without blocking paint", async () => {
    const {
      upsertGroupConversationIdentity,
      getGroupConversationIdentity,
      isGroupIdentityFresh,
      isGroupIdentityStale,
      getGroupIdentityFreshness,
      GROUP_IDENTITY_SOFT_MS,
    } = await import("./groupConversationIdentityCache");

    upsertGroupConversationIdentity("viewer-1", "conv-f", {
      title: "Fresh",
      memberCount: 1,
    });
    const entry = getGroupConversationIdentity("viewer-1", "conv-f")!;
    expect(isGroupIdentityFresh(entry)).toBe(true);
    expect(isGroupIdentityStale(entry)).toBe(false);
    expect(getGroupIdentityFreshness(entry)).toBe("fresh");

    const staleView = {
      ...entry,
      updatedAt: Date.now() - GROUP_IDENTITY_SOFT_MS - 1,
    };
    expect(isGroupIdentityFresh(staleView)).toBe(false);
    expect(isGroupIdentityStale(staleView)).toBe(true);
    expect(getGroupIdentityFreshness(staleView)).toBe("stale");
  });

  it("persists sourceContext and removes on leave", async () => {
    const {
      setGroupConversationIdentitySourceContext,
      getGroupConversationIdentity,
      removeGroupConversationIdentity,
      __resetGroupConversationIdentityCacheForTests,
    } = await import("./groupConversationIdentityCache");

    setGroupConversationIdentitySourceContext("viewer-1", "conv-c", {
      source_post_id: "post-1",
      post_type: "hangout",
      caption: "Beach",
      is_recurring: false,
      selected_dates: null,
      recurrence_days: null,
      group_up_occurs_at: null,
    });

    __resetGroupConversationIdentityCacheForTests();
    expect(
      getGroupConversationIdentity("viewer-1", "conv-c")?.sourceContext
        ?.caption
    ).toBe("Beach");

    removeGroupConversationIdentity("viewer-1", "conv-c");
    __resetGroupConversationIdentityCacheForTests();
    expect(getGroupConversationIdentity("viewer-1", "conv-c")).toBeNull();
  });

  it("rejects wrong schema bag and keeps hard TTL prune path intact", async () => {
    const {
      getGroupConversationIdentity,
      GROUP_IDENTITY_PERSIST_SCHEMA,
    } = await import("./groupConversationIdentityCache");

    localStorage.setItem(
      `echotoo_group_identity_v${GROUP_IDENTITY_PERSIST_SCHEMA}:viewer-1`,
      JSON.stringify({
        v: 999,
        userId: "viewer-1",
        byId: {
          "conv-bad": {
            conversationId: "conv-bad",
            kind: "group",
            title: "Nope",
            memberCount: 1,
            updatedAt: Date.now(),
          },
        },
      })
    );

    expect(getGroupConversationIdentity("viewer-1", "conv-bad")).toBeNull();
  });
});
