import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inAppNotificationFromPushData } from "./inAppNotificationFromPushData";
import { formatInAppNotificationDisplay } from "./formatInAppNotificationDisplay";
import { NOTIFICATION_KINDS } from "./notificationKinds";
import { buildInviteNotificationsPath } from "./notificationRouteResolver";
import { isActivitiesSurfaceNotification } from "../activitiesNotificationEligibility";
import { groupNotificationsByRecency } from "./groupNotificationsByRecency";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Going RSVP banners and invite push", () => {
  it("does not build a New RSVP / Going banner", () => {
    expect(
      inAppNotificationFromPushData({
        type: "activity_rsvp",
        title: "New RSVP",
        body: "Tap to view",
        postId: "p1",
        postType: "hangout",
      }),
    ).toBeNull();
    expect(
      inAppNotificationFromPushData({
        type: "rsvp",
        rsvp_status: "going",
        postId: "p1",
        postType: "hangout",
      }),
    ).toBeNull();
    const goingDisplay = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.ACTIVITY_RSVP,
      { type: "activity_rsvp", title: "New RSVP" },
    );
    expect(goingDisplay.title).toBe("");
  });

  it("still builds incoming invite banners and routes", () => {
    const payload = inAppNotificationFromPushData({
      type: "invite",
      title: "Alex invited you",
      body: "Are you free?",
      postId: "00000000-0000-4000-8000-000000000001",
      postType: "hangout",
      inviteId: "00000000-0000-4000-8000-000000000002",
      threadId: "00000000-0000-4000-8000-000000000003",
    });
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe(NOTIFICATION_KINDS.INVITE);
    expect(payload?.title.toLowerCase()).not.toContain("new rsvp");
    expect(
      buildInviteNotificationsPath({
        inviteId: "00000000-0000-4000-8000-000000000002",
        threadId: "00000000-0000-4000-8000-000000000003",
        threadKind: "personal",
      }),
    ).toContain("inviteId=");
  });

  it("formats invite-response rsvp without New RSVP copy", () => {
    const accepted = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.ACTIVITY_RSVP,
      { type: "rsvp", status: "accepted", inviteId: "inv-1" },
    );
    expect(accepted.title.toLowerCase()).not.toBe("new rsvp");
    expect(accepted.title.toLowerCase()).toContain("accepted");
    const declined = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.ACTIVITY_RSVP,
      { type: "rsvp", status: "declined", invite_id: "inv-2" },
    );
    expect(declined.title.toLowerCase()).toContain("declined");
  });
});

describe("Activity list / attention wiring", () => {
  it("NotificationList uses payload eligibility for Activity visibility and auto-mark-read", () => {
    const src = read("src/components/notifications/NotificationList.tsx");
    expect(src).toContain("isActivitiesSurfaceNotification");
    expect(src).not.toContain("isActivitiesSurfaceType(n.type)");
    expect(src).toContain("pageHasMore = data.length === NOTIFICATION_PAGE_SIZE");
    expect(src).toContain("markNotificationIdsAsRead(markable)");
  });

  it("persisted Activity display hides Going via the same eligibility helper", () => {
    const going = {
      type: "rsvp" as const,
      additional_data: { rsvp_status: "going" },
      created_at: new Date().toISOString(),
    };
    const accepted = {
      type: "rsvp" as const,
      additional_data: { status: "accepted", invite_id: "inv-1" },
      created_at: new Date().toISOString(),
    };
    const like = {
      type: "like" as const,
      additional_data: {},
      created_at: new Date().toISOString(),
    };
    const visible = [going, accepted, like].filter((n) =>
      isActivitiesSurfaceNotification(n),
    );
    expect(visible).toEqual([accepted, like]);
    const grouped = groupNotificationsByRecency(visible);
    expect(grouped.flatMap((g) => g.items)).not.toContain(going);
  });

  it("attention INSERT handler uses isActivitiesSurfaceNotification", () => {
    const src = read("src/hooks/useMessagesActivitiesAttention.ts");
    expect(src).toContain("isActivitiesSurfaceNotification");
    expect(src).toContain("additional_data");
    expect(src).not.toContain("isActivitiesSurfaceType(type)");
  });

  it("legacy RSVP filter chip is removed and unused", () => {
    const filter = read("src/components/notifications/NotificationFilter.tsx");
    expect(filter).not.toContain('key: "rsvp"');
    expect(filter).not.toContain("RSVP");
    expect(read("src/components/notifications/NotificationList.tsx")).not.toContain(
      "NotificationFilter",
    );
  });

  it("NotificationItem still distinguishes invite accept/decline on type rsvp", () => {
    const src = read("src/components/notifications/NotificationItem.tsx");
    expect(src).toContain('inviteStatus === "accepted"');
    expect(src).toContain('inviteStatus === "declined"');
    expect(src).toContain("accepted your invite");
    expect(src).toContain("declined your invite");
  });
});
