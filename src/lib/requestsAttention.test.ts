import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InboxConversationRow } from "../api/services/messaging";
import type { OpenPlanRequestGroup } from "./people/types";
import {
  clearMessagesUnreadStore,
  getHasUnreadMessages,
  hydrateFromInboxRows,
} from "./messagesUnreadStore";
import {
  acceptOpenPlanSnapshot,
  applyOpenPlanSeenForViewer,
  baselineOpenPlanRequestsIfNeeded,
  markOpenPlanRequestsSeen,
  openPlanUnseenCount,
} from "./openPlanRequestSeen";
import { deriveRequestsAttention } from "./requestsAttention";

function row(id: string, unread: number): InboxConversationRow {
  return {
    conversation_id: id,
    kind: "direct",
    other_user_id: "other",
    display_name: "Ada",
    username: "ada",
    avatar_url: null,
    title: null,
    last_message_at: null,
    last_message_preview: null,
    last_message_sender_id: null,
    unread_count: unread,
    is_last_from_me: false,
    created_at: "2026-01-01T00:00:00.000Z",
    member_count: null,
    member_preview: null,
    viewer_role: null,
    is_request: true,
    notifications_muted: false,
  };
}

function group(
  id: string,
  at: string,
  pending = 1
): OpenPlanRequestGroup {
  return {
    opportunity_id: id,
    source_post_id: "post",
    plan_description: null,
    source_caption: null,
    occurs_at: null,
    occurs_time_explicit: true,
    pending_count: pending,
    latest_request_at: at,
    latest_request_id: id + "-req",
    preview_requesters: [],
  };
}

describe("requests attention", () => {
  it("counts unseen work and keeps old pending actionable", () => {
    expect(
      deriveRequestsAttention({
        unreadRequestConversations: 1,
        openPlanPending: 4,
        openPlanUnseen: 0,
        groupUpPending: 2,
        groupUpNew: 0,
      })
    ).toEqual({ count: 1, attention: true });

    expect(
      deriveRequestsAttention({
        unreadRequestConversations: 0,
        openPlanPending: 0,
        openPlanUnseen: 0,
        groupUpPending: 0,
        groupUpNew: 2,
      })
    ).toEqual({ count: 2, attention: true });

    expect(
      deriveRequestsAttention({
        unreadRequestConversations: 0,
        openPlanPending: 0,
        openPlanUnseen: 0,
        groupUpPending: 0,
        groupUpNew: 0,
      })
    ).toEqual({ count: 0, attention: false });
  });
});

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  });
  return map;
}

function stored(map: Map<string, string>, userId: string): {
  baselined?: boolean;
  cursors?: Record<string, { at: string; id: string }>;
} {
  const raw = map.get(`echotoo_open_plan_request_seen_v1:${userId}`);
  return raw ? JSON.parse(raw) : {};
}

describe("open plan seen cursors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not treat the first snapshot as new, then counts a later request", () => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return map.size;
      },
      clear() {
        map.clear();
      },
      getItem(key: string) {
        return map.has(key) ? map.get(key)! : null;
      },
      key(index: number) {
        return [...map.keys()][index] ?? null;
      },
      removeItem(key: string) {
        map.delete(key);
      },
      setItem(key: string, value: string) {
        map.set(key, String(value));
      },
    });
    const user = "user-open-plan";
    const first = [group("opp-1", "2026-11-01T00:00:00.000Z")];
    baselineOpenPlanRequestsIfNeeded(user, first);
    expect(openPlanUnseenCount(user, first)).toBe(0);

    const next = [group("opp-1", "2026-11-02T00:00:00.000Z")];
    expect(openPlanUnseenCount(user, next)).toBe(1);

    markOpenPlanRequestsSeen(user, next);
    expect(openPlanUnseenCount(user, next)).toBe(0);
    expect(openPlanUnseenCount("someone-else", next)).toBe(0);
  });

  it("ignores account A's in-flight groups when baselining account B", () => {
    const map = stubStorage();
    const aGroups = [group("opp-a", "2026-11-01T00:00:00.000Z")];
    const bGroups = [group("opp-b", "2026-11-03T00:00:00.000Z")];
    const stale = acceptOpenPlanSnapshot({
      requestUserId: "user-a",
      currentUserId: "user-b",
      status: "success",
      groups: aGroups,
    });
    expect(stale).toBeNull();
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: aGroups,
    });

    const accepted = acceptOpenPlanSnapshot({
      requestUserId: "user-b",
      currentUserId: "user-b",
      status: "success",
      groups: bGroups,
    });
    expect(accepted?.groups).toEqual(bGroups);
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: accepted?.userId ?? null,
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: accepted?.groups ?? [],
    });

    expect(stored(map, "user-b").cursors).toEqual({
      "opp-b": { at: "2026-11-03T00:00:00.000Z", id: "opp-b-req" },
    });
    expect(stored(map, "user-a").baselined).toBeUndefined();
    expect(openPlanUnseenCount("user-b", bGroups)).toBe(0);
  });

  it("keeps each account's seen cursor when switching", () => {
    const map = stubStorage();
    const aGroups = [group("opp-a", "2026-11-01T00:00:00.000Z")];
    const bGroups = [group("opp-b", "2026-11-03T00:00:00.000Z")];
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: aGroups,
    });
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: "user-b",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: bGroups,
    });

    expect(stored(map, "user-a").cursors).toEqual({
      "opp-a": { at: "2026-11-01T00:00:00.000Z", id: "opp-a-req" },
    });
    expect(stored(map, "user-b").cursors).toEqual({
      "opp-b": { at: "2026-11-03T00:00:00.000Z", id: "opp-b-req" },
    });
    expect(openPlanUnseenCount("user-a", aGroups)).toBe(0);
    expect(openPlanUnseenCount("user-b", aGroups)).toBe(1);
  });

  it("does not baseline a failed first load, then baselines the successful backlog", () => {
    stubStorage();
    const backlog = [group("opp-old", "2026-10-01T00:00:00.000Z")];
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: null,
      fetchStatus: "error",
      requestsTabOpen: false,
      groups: [],
    });
    expect(openPlanUnseenCount("user-a", backlog)).toBe(0);
    expect(openPlanUnseenCount("user-a", [group("other", "2026-10-02T00:00:00.000Z")])).toBe(
      0
    );

    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: backlog,
    });
    expect(openPlanUnseenCount("user-a", backlog)).toBe(0);
    expect(openPlanUnseenCount("user-a", [group("other", "2026-10-02T00:00:00.000Z")])).toBe(
      1
    );
  });

  it("establishes an empty baseline from a successful empty snapshot", () => {
    stubStorage();
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: [],
    });
    const arrived = [group("opp-new", "2026-11-04T00:00:00.000Z")];
    expect(openPlanUnseenCount("user-a", arrived)).toBe(1);
  });

  it("counts a request that arrives after the baseline", () => {
    stubStorage();
    const first = [group("opp-1", "2026-11-01T00:00:00.000Z")];
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: first,
    });
    const newer = [group("opp-1", "2026-11-05T00:00:00.000Z")];
    expect(openPlanUnseenCount("user-a", newer)).toBe(1);
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: newer,
    });
    expect(openPlanUnseenCount("user-a", newer)).toBe(1);
  });

  it("marks seen only for the current user's successful groups", () => {
    const map = stubStorage();
    const aGroups = [group("opp-a", "2026-11-01T00:00:00.000Z")];
    const bGroups = [group("opp-b", "2026-11-02T00:00:00.000Z")];
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-a",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: false,
      groups: aGroups,
    });
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: "user-a",
      fetchStatus: "success",
      requestsTabOpen: true,
      groups: aGroups,
    });
    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: "user-b",
      fetchStatus: "error",
      requestsTabOpen: true,
      groups: bGroups,
    });
    expect(stored(map, "user-b").baselined).toBeUndefined();

    applyOpenPlanSeenForViewer({
      viewerUserId: "user-b",
      snapshotUserId: "user-b",
      fetchStatus: "success",
      requestsTabOpen: true,
      groups: bGroups,
    });
    expect(stored(map, "user-a").cursors).toEqual({
      "opp-a": { at: "2026-11-01T00:00:00.000Z", id: "opp-a-req" },
    });
    expect(openPlanUnseenCount("user-b", bGroups)).toBe(0);
    expect(stored(map, "user-b").cursors).toEqual({
      "opp-b": { at: "2026-11-02T00:00:00.000Z", id: "opp-b-req" },
    });
  });
});

describe("group up and dm request counts stay independent", () => {
  it("counts Group Up new_count and unread request DMs without Open Plan seen state", () => {
    expect(
      deriveRequestsAttention({
        unreadRequestConversations: 2,
        openPlanPending: 0,
        openPlanUnseen: 0,
        groupUpPending: 3,
        groupUpNew: 1,
      })
    ).toEqual({ count: 3, attention: true });
  });
});

describe("messages unread store", () => {
  it("drops a listed conversation that disappears and keeps an unlist conversation", () => {
    clearMessagesUnreadStore();
    hydrateFromInboxRows("viewer", [row("listed", 2), row("stays", 1)]);
    hydrateFromInboxRows("viewer", [
      row("stays", 1),
      row("outside", 0),
    ]);
    expect(getHasUnreadMessages()).toBe(true);

    hydrateFromInboxRows("viewer", [row("outside", 0)]);
    expect(getHasUnreadMessages()).toBe(false);

    hydrateFromInboxRows("other-viewer", []);
    expect(getHasUnreadMessages()).toBe(false);
  });
});

describe("duo comment push drain migration", () => {
  const sql = readFileSync(
    join(
      __dirname,
      "../../supabase/migrations/20261124120000_duo_comment_push_drain.sql"
    ),
    "utf8"
  );

  it("kicks send-dm-push only after a new message is inserted", () => {
    const inserted = sql.indexOf("IF v_inserted THEN");
    const drain = sql.indexOf("net.http_post");
    const returned = sql.lastIndexOf("RETURN jsonb_build_object");
    expect(inserted).toBeGreaterThan(0);
    expect(drain).toBeGreaterThan(inserted);
    expect(drain).toBeLessThan(returned);
    expect(sql).toContain("send-dm-push");
    expect(sql).toContain("enqueue_dm_push_outbox_for_message");
    expect(sql).toContain(
      "ON CONFLICT (conversation_id, sender_user_id, client_message_id)"
    );
    expect(sql).toContain("DUO_COMMENT_ALREADY_SENT");
    expect(sql).not.toContain("complete_pair_up_match");
    expect(sql).not.toContain("express_pair_up_interest");
    expect(sql.match(/net\.http_post/g)).toHaveLength(1);
  });
});
