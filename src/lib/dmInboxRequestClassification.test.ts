import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxConversationRow } from "../api/services/messaging";
import { eligibleInboxConversations } from "./dmInboxEligibility";
import {
  clearDmInboxCache,
  getDmInboxCache,
  isDmInboxFresh,
  knownDirectInboundNeedsAuthoritativeRequestRefresh,
  patchDmInboxConversationSummary,
  patchDmInboxIsRequest,
  patchDmInboxUnread,
  setDmInboxCache,
  shouldPromoteRequestAfterReply,
} from "./dmInboxCache";

vi.mock("./avatarCache", () => ({
  setCachedAvatar: vi.fn(),
}));

const viewer = "viewer-1";
const other = "other-1";

function directRow(
  patch: Partial<InboxConversationRow> = {}
): InboxConversationRow {
  return {
    conversation_id: "conv-direct",
    kind: "direct",
    other_user_id: other,
    display_name: "Ada",
    username: "ada",
    avatar_url: null,
    title: null,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: 0,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00.000Z",
    member_count: null,
    member_preview: null,
    viewer_role: null,
    is_request: false,
    notifications_muted: false,
    ...patch,
  };
}

function groupRow(): InboxConversationRow {
  return {
    ...directRow(),
    conversation_id: "conv-group",
    kind: "group",
    other_user_id: null,
    title: "Friday",
    is_request: false,
  };
}

function split(rows: InboxConversationRow[]) {
  const eligible = eligibleInboxConversations(rows);
  return {
    inbox: eligible.filter((row) => !row.is_request),
    requests: eligible.filter((row) => row.is_request),
  };
}

describe("known direct inbound request classification", () => {
  beforeEach(() => {
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
    clearDmInboxCache();
  });

  afterEach(() => {
    clearDmInboxCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reloads when the first shared post arrives on an empty known direct", () => {
    const row = directRow();
    expect(
      knownDirectInboundNeedsAuthoritativeRequestRefresh(row, other, viewer)
    ).toBe(true);
  });

  it("reloads when the first text message arrives on an empty known direct", () => {
    const row = directRow();
    expect(
      knownDirectInboundNeedsAuthoritativeRequestRefresh(row, other, viewer)
    ).toBe(true);
  });

  it("places the authoritative row in Requests, not Inbox", () => {
    const before = split([directRow()]);
    expect(before.inbox).toHaveLength(0);
    expect(before.requests).toHaveLength(0);

    const afterServer = split([
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
        last_message_preview: "Duo comment",
        last_message_sender_id: other,
        unread_count: 1,
      }),
    ]);
    expect(afterServer.requests.map((row) => row.conversation_id)).toEqual([
      "conv-direct",
    ]);
    expect(afterServer.inbox).toHaveLength(0);
  });

  it("moves a confirmed reply to Inbox without a second row", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
      }),
      groupRow(),
    ]);
    expect(
      shouldPromoteRequestAfterReply({
        wasRequest: true,
        delivered: true,
        messageKind: "text",
      })
    ).toBe(true);
    expect(
      shouldPromoteRequestAfterReply({
        wasRequest: true,
        delivered: true,
        messageKind: "shared_post",
      })
    ).toBe(true);

    const next = patchDmInboxIsRequest(viewer, "conv-direct", false);
    expect(next).toHaveLength(2);
    expect(next?.filter((row) => row.conversation_id === "conv-direct")).toEqual([
      expect.objectContaining({ is_request: false }),
    ]);
    const placed = split(next ?? []);
    expect(placed.inbox.map((row) => row.conversation_id)).toContain(
      "conv-direct"
    );
    expect(placed.requests.map((row) => row.conversation_id)).not.toContain(
      "conv-direct"
    );
  });

  it("does not change classification when the reply fails", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    expect(
      shouldPromoteRequestAfterReply({
        wasRequest: true,
        delivered: false,
        messageKind: "text",
      })
    ).toBe(false);
    expect(requestFlag()).toBe(true);
  });

  it("updates classification while the inbox cache is still fresh", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    const cached = getDmInboxCache(viewer);
    expect(cached && isDmInboxFresh(cached)).toBe(true);
    patchDmInboxIsRequest(viewer, "conv-direct", false);
    expect(requestFlag()).toBe(false);
  });

  it("keeps classification on a preview-only update", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    patchDmInboxConversationSummary(viewer, "conv-direct", {
      last_message_preview: "Still a request",
      last_message_at: "2026-01-03T00:00:00.000Z",
      last_message_sender_id: other,
      is_last_from_me: false,
    });
    expect(requestFlag()).toBe(true);
    expect(
      knownDirectInboundNeedsAuthoritativeRequestRefresh(
        directRow({
          is_request: false,
          last_message_at: "2026-01-03T00:00:00.000Z",
        }),
        other,
        viewer
      )
    ).toBe(false);
  });

  it("leaves group rows unchanged and does not touch Open Plan state", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
      }),
      groupRow(),
    ]);
    const next = patchDmInboxIsRequest(viewer, "conv-direct", false);
    expect(next?.find((row) => row.kind === "group")).toEqual(
      expect.objectContaining({
        conversation_id: "conv-group",
        is_request: false,
      })
    );
    const page = readFileSync(
      "src/pages/messages/MessagesInboxPage.tsx",
      "utf8"
    );
    const listener = page.slice(
      page.indexOf("subscribeInboxRequestPromoted"),
      page.indexOf("subscribeConversationPreviewPatches")
    );
    expect(listener).not.toContain("openPlan");
    expect(listener).not.toContain("groupUp");
  });

  it("does not promote a request when it is only marked read", () => {
    setDmInboxCache(viewer, [
      directRow({
        is_request: true,
        last_message_at: "2026-01-02T00:00:00.000Z",
        unread_count: 1,
      }),
    ]);
    patchDmInboxUnread(viewer, "conv-direct", 0);
    expect(requestFlag()).toBe(true);
    expect(
      knownDirectInboundNeedsAuthoritativeRequestRefresh(
        directRow({ is_request: true }),
        other,
        viewer
      )
    ).toBe(false);
  });

  it("coalesces repeated inbound signals into one list refresh", () => {
    vi.useFakeTimers();
    const loads: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        loads.push("list");
      }, 400);
    };
    const empty = directRow();
    if (knownDirectInboundNeedsAuthoritativeRequestRefresh(empty, other, viewer)) {
      schedule();
    }
    if (knownDirectInboundNeedsAuthoritativeRequestRefresh(empty, other, viewer)) {
      schedule();
    }
    vi.advanceTimersByTime(399);
    expect(loads).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(loads).toEqual(["list"]);

    const stable = directRow({
      is_request: true,
      last_message_at: "2026-01-02T00:00:00.000Z",
    });
    if (knownDirectInboundNeedsAuthoritativeRequestRefresh(stable, other, viewer)) {
      schedule();
    }
    vi.advanceTimersByTime(400);
    expect(loads).toEqual(["list"]);
  });
});

function requestFlag(): boolean | undefined {
  return getDmInboxCache(viewer)?.conversations.find(
    (row) => row.conversation_id === "conv-direct"
  )?.is_request;
}
