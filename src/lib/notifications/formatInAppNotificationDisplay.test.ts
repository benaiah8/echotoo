import { describe, expect, it } from "vitest";
import { formatInAppNotificationDisplay } from "./formatInAppNotificationDisplay";
import { NOTIFICATION_KINDS } from "./notificationKinds";

describe("formatInAppNotificationDisplay followed_post", () => {
  it("formats hangout as created an event with sender name", () => {
    const display = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.FOLLOWED_POST,
      {
        title: "Alex created an event",
        body: "Tap to view",
        postType: "hangout",
        postId: "p1",
      }
    );
    expect(display.title).toBe("Alex created an event");
    expect(display.body).toBe("Tap to view");
  });

  it("formats experience as created a post with sender name", () => {
    const display = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.FOLLOWED_POST,
      {
        title: "Sam created a post",
        body: "Tap to view",
        postType: "experience",
        postId: "p2",
      }
    );
    expect(display.title).toBe("Sam created a post");
  });

  it("uses postType when title is legacy shared-something-new", () => {
    const hangout = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.FOLLOWED_POST,
      {
        title: "Jordan shared something new",
        postType: "hangout",
      }
    );
    expect(hangout.title).toBe("Jordan created an event");

    const experience = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.FOLLOWED_POST,
      {
        title: "Jordan shared something new",
        postType: "experience",
      }
    );
    expect(experience.title).toBe("Jordan created a post");
  });

  it("falls back to Someone + postType when name cannot be parsed", () => {
    const display = formatInAppNotificationDisplay(
      NOTIFICATION_KINDS.FOLLOWED_POST,
      {
        title: "Update",
        postType: "hangout",
      }
    );
    expect(display.title).toBe("Someone created an event");
  });
});

describe("formatInAppNotificationDisplay invite", () => {
  it("uses Invited you to a post for experience without note", () => {
    const display = formatInAppNotificationDisplay(NOTIFICATION_KINDS.INVITE, {
      title: "Alex invited you",
      body: "",
      postType: "experience",
      threadKind: "personal",
    });
    expect(display.body).toBe("Invited you to a post");
  });

  it("keeps Invited you to an event for hangout", () => {
    const display = formatInAppNotificationDisplay(NOTIFICATION_KINDS.INVITE, {
      title: "Alex invited you",
      body: "",
      postType: "hangout",
      threadKind: "personal",
    });
    expect(display.body).toBe("Invited you to an event");
  });
});
