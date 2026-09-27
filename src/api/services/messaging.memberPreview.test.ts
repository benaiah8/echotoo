import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "viewer-1" } } })) },
  },
}));

describe("listMyConversations member_preview parse", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("parses group member_preview and leaves directs null", async () => {
    const { supabase } = await import("../../lib/supabaseClient");
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        conversations: [
          {
            conversation_id: "g1",
            kind: "group",
            other_user_id: null,
            display_name: null,
            username: null,
            avatar_url: null,
            title: "Hike",
            last_message_at: null,
            last_message_preview: null,
            last_message_sender_id: null,
            unread_count: 0,
            is_last_from_me: false,
            created_at: "2025-01-01T00:00:00.000Z",
            member_count: 2,
            member_preview: [
              {
                user_id: "u-new",
                avatar_url: null,
                display_name: "New",
                username: "new",
                joined_at: "2025-06-01T00:00:00.000Z",
              },
              {
                user_id: "u-old",
                avatar_url: "https://example.com/a.jpg",
                display_name: "Old",
                username: "old",
                joined_at: "2024-01-01T00:00:00.000Z",
              },
            ],
            is_request: false,
            notifications_muted: false,
            viewer_role: "admin",
          },
          {
            conversation_id: "d1",
            kind: "direct",
            other_user_id: "u-peer",
            display_name: "Peer",
            username: "peer",
            avatar_url: null,
            title: null,
            last_message_at: "2025-01-02T00:00:00.000Z",
            last_message_preview: "hi",
            last_message_sender_id: "u-peer",
            unread_count: 1,
            is_last_from_me: false,
            created_at: "2025-01-01T00:00:00.000Z",
            member_count: null,
            is_request: false,
            notifications_muted: false,
            viewer_role: null,
          },
        ],
      },
      error: null,
    } as never);

    const { listMyConversations } = await import("./messaging");
    const { data, error } = await listMyConversations(40);
    expect(error).toBeNull();
    expect(data?.conversations).toHaveLength(2);
    const group = data!.conversations[0];
    expect(group.member_preview).toEqual([
      {
        user_id: "u-new",
        avatar_url: null,
        display_name: "New",
        username: "new",
        joined_at: "2025-06-01T00:00:00.000Z",
      },
      {
        user_id: "u-old",
        avatar_url: "https://example.com/a.jpg",
        display_name: "Old",
        username: "old",
        joined_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    expect(group.viewer_role).toBe("admin");
    expect(data!.conversations[1].member_preview).toBeNull();
    expect(data!.conversations[1].viewer_role).toBeNull();
  });

  it("treats omitted group member_preview as null (pre-migration)", async () => {
    const { supabase } = await import("../../lib/supabaseClient");
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        conversations: [
          {
            conversation_id: "g1",
            kind: "group",
            other_user_id: null,
            display_name: null,
            username: null,
            avatar_url: null,
            title: "Hike",
            last_message_at: null,
            last_message_preview: null,
            last_message_sender_id: null,
            unread_count: 0,
            is_last_from_me: false,
            created_at: "2025-01-01T00:00:00.000Z",
            member_count: 1,
            is_request: false,
            notifications_muted: false,
          },
        ],
      },
      error: null,
    } as never);

    const { listMyConversations } = await import("./messaging");
    const { data } = await listMyConversations(40);
    expect(data!.conversations[0].member_preview).toBeNull();
    expect(data!.conversations[0].viewer_role).toBeNull();
  });

  it("parses group viewer_role member and ignores unknown roles", async () => {
    const { supabase } = await import("../../lib/supabaseClient");
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        conversations: [
          {
            conversation_id: "g1",
            kind: "group",
            other_user_id: null,
            display_name: null,
            username: null,
            avatar_url: null,
            title: "Hike",
            last_message_at: null,
            last_message_preview: null,
            last_message_sender_id: null,
            unread_count: 0,
            is_last_from_me: false,
            created_at: "2025-01-01T00:00:00.000Z",
            member_count: 2,
            member_preview: [],
            is_request: false,
            notifications_muted: false,
            viewer_role: "member",
          },
          {
            conversation_id: "g2",
            kind: "group",
            other_user_id: null,
            display_name: null,
            username: null,
            avatar_url: null,
            title: "Camp",
            last_message_at: null,
            last_message_preview: null,
            last_message_sender_id: null,
            unread_count: 0,
            is_last_from_me: false,
            created_at: "2025-01-01T00:00:00.000Z",
            member_count: 1,
            member_preview: [],
            is_request: false,
            notifications_muted: false,
            viewer_role: "owner",
          },
        ],
      },
      error: null,
    } as never);

    const { listMyConversations } = await import("./messaging");
    const { data } = await listMyConversations(40);
    expect(data!.conversations[0].viewer_role).toBe("member");
    expect(data!.conversations[1].viewer_role).toBeNull();
  });
});
