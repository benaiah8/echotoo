import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR,
  coerceNotificationAdditionalData,
  isActivitiesSurfaceNotification,
  isActivitiesSurfaceType,
  isIncomingInviteNotification,
  isInviteResponseRsvpNotification,
  isObsoleteGoingRsvpNotification,
  isObsoleteGoingRsvpPushPayload,
} from "./activitiesNotificationEligibility";

function goingRsvp() {
  return {
    type: "rsvp",
    additional_data: { rsvp_status: "going" },
  };
}

function inviteAccepted() {
  return {
    type: "rsvp",
    additional_data: {
      status: "accepted",
      invite_id: "inv-1",
      post_id: "post-1",
    },
  };
}

function inviteDeclined() {
  return {
    type: "rsvp",
    additional_data: {
      status: "declined",
      invite_id: "inv-2",
      post_id: "post-1",
    },
  };
}

describe("RSVP vs invitation eligibility", () => {
  it("hides obsolete Going RSVP", () => {
    expect(isObsoleteGoingRsvpNotification(goingRsvp())).toBe(true);
    expect(isActivitiesSurfaceNotification(goingRsvp())).toBe(false);
    expect(isInviteResponseRsvpNotification(goingRsvp())).toBe(false);
  });

  it("keeps invite acceptance visible on Activity", () => {
    expect(isInviteResponseRsvpNotification(inviteAccepted())).toBe(true);
    expect(isObsoleteGoingRsvpNotification(inviteAccepted())).toBe(false);
    expect(isActivitiesSurfaceNotification(inviteAccepted())).toBe(true);
  });

  it("keeps invite decline visible on Activity", () => {
    expect(isInviteResponseRsvpNotification(inviteDeclined())).toBe(true);
    expect(isObsoleteGoingRsvpNotification(inviteDeclined())).toBe(false);
    expect(isActivitiesSurfaceNotification(inviteDeclined())).toBe(true);
  });

  it("does not blindly hide rsvp rows that only have invite_id", () => {
    const row = {
      type: "rsvp",
      additional_data: { invite_id: "inv-3", post_id: "post-1" },
    };
    expect(isInviteResponseRsvpNotification(row)).toBe(true);
    expect(isObsoleteGoingRsvpNotification(row)).toBe(false);
    expect(isActivitiesSurfaceNotification(row)).toBe(true);
  });

  it("leaves incoming invite type on Invites, not Activity", () => {
    const incoming = {
      type: "invite",
      additional_data: { invite_id: "inv-9" },
    };
    expect(isIncomingInviteNotification(incoming)).toBe(true);
    expect(isActivitiesSurfaceType("invite")).toBe(false);
    expect(isActivitiesSurfaceNotification(incoming)).toBe(false);
    expect(isObsoleteGoingRsvpNotification(incoming)).toBe(false);
  });

  it("parses stringified additional_data for invite-response attention", () => {
    const parsed = coerceNotificationAdditionalData(
      JSON.stringify({ status: "accepted", invite_id: "inv-1" }),
    );
    expect(
      isActivitiesSurfaceNotification({
        type: "rsvp",
        additional_data: parsed,
      }),
    ).toBe(true);
  });

  it("keeps likes and comments on Activity", () => {
    expect(
      isActivitiesSurfaceNotification({ type: "like", additional_data: {} }),
    ).toBe(true);
    expect(
      isActivitiesSurfaceNotification({
        type: "comment",
        additional_data: { comment_text: "hi" },
      }),
    ).toBe(true);
    expect(isActivitiesSurfaceType("follow")).toBe(true);
    expect(isActivitiesSurfaceType("post")).toBe(true);
    expect(isActivitiesSurfaceType("saved")).toBe(false);
  });
});

describe("obsolete Going push payloads", () => {
  it("treats activity_rsvp / rsvp without invite fields as Going", () => {
    expect(
      isObsoleteGoingRsvpPushPayload({
        type: "activity_rsvp",
        title: "New RSVP",
      }),
    ).toBe(true);
    expect(
      isObsoleteGoingRsvpPushPayload({
        type: "rsvp",
        rsvp_status: "going",
        postId: "p1",
      }),
    ).toBe(true);
  });

  it("does not treat invite-response rsvp push as Going", () => {
    expect(
      isObsoleteGoingRsvpPushPayload({
        type: "rsvp",
        status: "accepted",
        inviteId: "inv-1",
      }),
    ).toBe(false);
    expect(
      isObsoleteGoingRsvpPushPayload({
        type: "activity_rsvp",
        invite_id: "inv-1",
        status: "declined",
      }),
    ).toBe(false);
  });

  it("does not treat incoming invite push as Going", () => {
    expect(
      isObsoleteGoingRsvpPushPayload({
        type: "invite",
        inviteId: "inv-1",
        postId: "p1",
      }),
    ).toBe(false);
  });
});

describe("read-query Going exclusion is wired (pagination / unread / attention)", () => {
  it("exports a PostgREST OR that keeps invite-response rsvp rows", () => {
    expect(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR).toContain("type.neq.rsvp");
    expect(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR).toContain(
      "additional_data->>status.in.(accepted,declined)",
    );
    expect(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR).toContain(
      "additional_data->>invite_id.not.is.null",
    );
  });

  it("activity list, unread, and latest-eligible queries apply the OR before range/limit", () => {
    const src = readFileSync(
      join(process.cwd(), "src/api/services/notifications.ts"),
      "utf8",
    );
    expect(src).toContain("ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR");
    const orAt = src.indexOf(".or(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR)");
    expect(orAt).toBeGreaterThan(-1);
    expect(src.split(".or(ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR)").length).toBe(
      4,
    );
    const listRange = src.indexOf(".range(offset, offset + limit - 1)");
    const latestLimit = src.lastIndexOf(".limit(1)");
    expect(orAt).toBeLessThan(listRange);
    expect(src.indexOf("ACTIVITIES_EXCLUDE_OBSOLETE_GOING_RSVP_OR")).toBeLessThan(
      latestLimit,
    );
  });

  it("does not delete notification or rsvp_responses rows", () => {
    const src = readFileSync(
      join(process.cwd(), "src/api/services/notifications.ts"),
      "utf8",
    );
    expect(src).not.toContain(".eq(\"type\", \"rsvp\")");
    expect(src).not.toContain("rsvp_responses");
  });
});
