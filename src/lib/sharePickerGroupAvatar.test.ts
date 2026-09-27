/**
 * Share picker group avatar — member_preview passthrough + tile/summary mapping.
 * No network; presentation data only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InboxConversationRow } from "../api/services/messaging";
import {
  destinationFromInboxRow,
  mergeShareGridDestinations,
  personDestination,
  selectConversationDestination,
  shareMemberPreviewFromInbox,
  conversationDestinationKey,
} from "./shareToMessagesSend";
import { groupAvatarStackStatusFromPreview } from "../components/messages/GroupMemberAvatarStack";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseGroupRow(
  overrides: Partial<InboxConversationRow> = {}
): InboxConversationRow {
  return {
    conversation_id: "g1",
    kind: "group",
    other_user_id: null,
    display_name: null,
    username: null,
    avatar_url: null,
    title: "Weekend plans",
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: 0,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00Z",
    member_count: 3,
    member_preview: [
      {
        user_id: "u1",
        avatar_url: "https://cdn.example/a.jpg",
        display_name: "Ada",
        username: "ada",
        joined_at: "2026-01-02T00:00:00Z",
      },
      {
        user_id: "u2",
        avatar_url: null,
        display_name: "Bob",
        username: "bob",
        joined_at: "2026-01-01T00:00:00Z",
      },
    ],
    viewer_role: "member",
    is_request: false,
    notifications_muted: false,
    ...overrides,
  };
}

function baseDirectRow(): InboxConversationRow {
  return {
    conversation_id: "d1",
    kind: "direct",
    other_user_id: "other-1",
    display_name: "Casey",
    username: "casey",
    avatar_url: "https://cdn.example/c.jpg",
    title: null,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: 0,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00Z",
    member_count: null,
    member_preview: null,
    viewer_role: null,
    is_request: false,
    notifications_muted: false,
  };
}

describe("shareMemberPreviewFromInbox", () => {
  it("maps inbox fields and caps at 3", () => {
    const mapped = shareMemberPreviewFromInbox([
      {
        user_id: "a",
        avatar_url: "https://x/a",
        display_name: "A",
        username: "a",
        joined_at: "t1",
      },
      {
        user_id: "b",
        avatar_url: null,
        display_name: null,
        username: "b",
        joined_at: "t2",
      },
      {
        user_id: "c",
        avatar_url: null,
        display_name: "C",
        username: null,
        joined_at: "t3",
      },
      {
        user_id: "d",
        avatar_url: null,
        display_name: "D",
        username: null,
        joined_at: "t4",
      },
    ]);
    expect(mapped).toHaveLength(3);
    expect(mapped?.[0]).toEqual({
      userId: "a",
      avatarUrl: "https://x/a",
      displayName: "A",
      username: "a",
    });
    expect(mapped?.[1]?.avatarUrl).toBeNull();
  });

  it("preserves null vs empty", () => {
    expect(shareMemberPreviewFromInbox(null)).toBeNull();
    expect(shareMemberPreviewFromInbox([])).toEqual([]);
  });
});

describe("destinationFromInboxRow memberPreview", () => {
  it("passes group member_preview onto ShareDestination", () => {
    const dest = destinationFromInboxRow(baseGroupRow());
    expect(dest.conversationKind).toBe("group");
    expect(dest.key).toBe(conversationDestinationKey("g1"));
    expect(dest.memberPreview).toEqual([
      {
        userId: "u1",
        avatarUrl: "https://cdn.example/a.jpg",
        displayName: "Ada",
        username: "ada",
      },
      {
        userId: "u2",
        avatarUrl: null,
        displayName: "Bob",
        username: "bob",
      },
    ]);
  });

  it("sets memberPreview null when inbox omitted preview (null)", () => {
    const dest = destinationFromInboxRow(
      baseGroupRow({ member_preview: null })
    );
    expect(dest.memberPreview).toBeNull();
  });

  it("does not attach memberPreview on direct rows", () => {
    const dest = destinationFromInboxRow(baseDirectRow());
    expect(dest.conversationKind).toBe("direct");
    expect(dest.memberPreview).toBeUndefined();
    expect(dest.otherUserId).toBe("other-1");
  });
});

describe("mergeShareGridDestinations preserves preview", () => {
  it("keeps group memberPreview through grid merge", () => {
    const grid = mergeShareGridDestinations({
      recentRows: [baseGroupRow(), baseDirectRow()],
      searchQuery: "",
      people: [],
    });
    const group = grid.find(
      (d) => d.kind === "conversation" && d.conversationKind === "group"
    );
    expect(group?.kind).toBe("conversation");
    if (group?.kind === "conversation") {
      expect(group.memberPreview?.map((m) => m.userId)).toEqual(["u1", "u2"]);
    }
  });

  it("person destinations remain without memberPreview", () => {
    const grid = mergeShareGridDestinations({
      recentRows: [],
      searchQuery: "ada",
      people: [
        {
          userId: "p1",
          label: "Pat",
          avatarUrl: "https://cdn.example/p.jpg",
        },
      ],
    });
    expect(grid).toHaveLength(1);
    expect(grid[0]?.kind).toBe("person");
    if (grid[0]?.kind === "person") {
      expect(grid[0].userId).toBe("p1");
      expect(grid[0].avatarUrl).toBe("https://cdn.example/p.jpg");
      expect("memberPreview" in grid[0]).toBe(false);
    }
  });
});

describe("selection identity unchanged with preview", () => {
  it("selectConversationDestination keys and payload ids ignore preview", () => {
    const dest = destinationFromInboxRow(baseGroupRow());
    const { next } = selectConversationDestination(new Map(), dest);
    const held = next.get(dest.key);
    expect(held?.kind).toBe("conversation");
    if (held?.kind === "conversation") {
      expect(held.conversationId).toBe("g1");
      expect(held.key).toBe("conversation:g1");
      expect(held.memberPreview?.[0]?.userId).toBe("u1");
    }
    const person = personDestination({
      userId: "p9",
      label: "Pat",
      avatarUrl: null,
    });
    expect(person.key).toBe("person:p9");
  });
});

describe("preview status fallbacks (visible, not retired icon)", () => {
  it("null → loading; empty → empty; populated → ready", () => {
    expect(groupAvatarStackStatusFromPreview(null)).toBe("loading");
    expect(groupAvatarStackStatusFromPreview(undefined)).toBe("loading");
    expect(groupAvatarStackStatusFromPreview([])).toBe("empty");
    expect(
      groupAvatarStackStatusFromPreview([{ userId: "u1" }])
    ).toBe("ready");
  });
});

describe("Share group presentation — one stack, no PiUsers", () => {
  it("group tiles mount stack; person path keeps Avatar; no PiUsers", () => {
    const tile = read("src/components/messages/ShareDestinationTile.tsx");
    expect(tile).toContain("GroupMemberAvatarStack");
    expect(tile).toContain('layout="triangle"');
    expect(tile).toContain("groupAvatarStackStatusFromPreview");
    expect(tile).not.toContain("PiUsers");
    expect(tile).toContain("<Avatar");
  });

  it("selected summary uses GroupMemberAvatarStack; no PiUsers", () => {
    const summary = read(
      "src/components/messages/SelectedShareDestinationsSummary.tsx"
    );
    expect(summary).toContain("GroupMemberAvatarStack");
    expect(summary).toContain("groupAvatarStackStatusFromPreview");
    expect(summary).toContain('layout="triangle"');
    expect(summary).not.toContain("PiUsers");
    expect(summary).toContain("<Avatar");
  });

  it("drawer maps memberPreview onto group tile models", () => {
    const drawer = read("src/components/messages/ShareToMessagesDrawer.tsx");
    expect(drawer).toContain("memberPreview");
    expect(drawer).toContain("tileModelFromDestination");
    expect(drawer).toContain("SelectedShareDestinationsSummary");
  });

  it("does not add per-tile member fetches", () => {
    const tile = read("src/components/messages/ShareDestinationTile.tsx");
    expect(tile).not.toMatch(/listConversationMembers|getGroupMembers|fetch\(/);
    expect(tile).not.toContain("supabase");
    const summary = read(
      "src/components/messages/SelectedShareDestinationsSummary.tsx"
    );
    expect(summary).not.toMatch(/listConversationMembers|getGroupMembers|fetch\(/);
    expect(summary).not.toContain("supabase");
    const send = read("src/lib/shareToMessagesSend.ts");
    expect(send).not.toContain("listConversationMembers");
  });

  it("Avatar has onError fallback for failed photos", () => {
    const avatar = read("src/components/ui/Avatar.tsx");
    expect(avatar).toContain("onError");
    expect(avatar).toContain("imgFailed");
  });

  it("triangle empty status uses a single visible EmptySlot (no PiUsers)", () => {
    const stack = read("src/components/messages/GroupMemberAvatarStack.tsx");
    expect(stack).toContain('status === "empty"');
    expect(stack).not.toMatch(/PiUsers/);
  });
});
