/**
 * Dev-only helpers to exercise the in-app notification banner without shipping UI.
 * From browser console (DEV builds only):
 *   window.__echotooDevInAppNotification?.("invite")
 *   window.__echotooDevInAppNotification?.("followed_post")
 *   window.__echotooDevInAppNotification?.("dm_message")
 */
import { NOTIFICATION_KINDS, type NotificationKind } from "./notificationKinds";
import { showInAppNotification } from "./inAppNotificationBus";
import { inAppNotificationFromPushData } from "./inAppNotificationFromPushData";

declare global {
  interface Window {
    __echotooDevInAppNotification?: (kind?: NotificationKind) => void;
  }
}

function showFromPushData(
  data: Record<string, string>,
  idPrefix: string
): void {
  const payload = inAppNotificationFromPushData(data, { idPrefix: idPrefix });
  if (payload) {
    showInAppNotification(payload);
  }
}

export function registerDevInAppNotificationTestHook(): () => void {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  window.__echotooDevInAppNotification = (kind = NOTIFICATION_KINDS.INVITE) => {
    const resolvedKind =
      (kind as string) === "post" ? NOTIFICATION_KINDS.FOLLOWED_POST : kind;
    const samplePostId = "00000000-0000-4000-8000-000000000001";

    if (resolvedKind === NOTIFICATION_KINDS.INVITE) {
      showFromPushData(
        {
          type: "invite",
          title: "Alex invited you",
          body: "Are you free this weekend?",
          postId: samplePostId,
          postType: "hangout",
          inviteId: "00000000-0000-4000-8000-000000000002",
          threadId: "00000000-0000-4000-8000-000000000003",
        },
        "dev-invite"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.FOLLOWED_POST) {
      showFromPushData(
        {
          type: "followed_post",
          title: "Jordan shared something new",
          body: "Tap to view",
          postId: samplePostId,
          postType: "hangout",
          actorId: "00000000-0000-4000-8000-000000000004",
        },
        "dev-post"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.EVENT_REMINDER) {
      showFromPushData(
        {
          type: "event_reminder",
          title: "Event reminder",
          body: "Sunset hike starts in 1 hour",
          postId: samplePostId,
          postType: "experience",
        },
        "dev-reminder"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.DM_MESSAGE) {
      showFromPushData(
        {
          type: "dm_message",
          conversationId: "00000000-0000-4000-8000-000000000010",
          senderUserId: "00000000-0000-4000-8000-000000000011",
          senderName: "Sam",
          title: "Sam",
          body: "Hey, are you coming?",
        },
        "dev-dm"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.GROUP_MESSAGE) {
      showFromPushData(
        {
          type: "group_message",
          conversationId: "00000000-0000-4000-8000-000000000012",
          senderUserId: "00000000-0000-4000-8000-000000000011",
          groupName: "Weekend crew",
          senderName: "Sam",
          body: "Who is in for Saturday?",
        },
        "dev-group"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.ADMIN_CAMPAIGN) {
      showFromPushData(
        {
          type: "admin_campaign",
          title: "EchoToo",
          body: "We just launched a new feature — tap to learn more.",
        },
        "dev-campaign"
      );
      return;
    }

    if (resolvedKind === NOTIFICATION_KINDS.OPEN_PLAN_REQUEST) {
      showFromPushData(
        {
          type: "open_plan_request",
          title: "Open Plan",
          body: "Someone is interested in your open plan.",
          requestId: "00000000-0000-4000-8000-000000000020",
          opportunityId: "00000000-0000-4000-8000-000000000021",
          targetPath:
            "/messages?tab=requests&requestId=00000000-0000-4000-8000-000000000020",
        },
        "dev-open-plan-request"
      );
      return;
    }

    showFromPushData(
      {
        type: resolvedKind,
        title: `Dev: ${resolvedKind}`,
        body: "Foreground banner test.",
      },
      "dev-generic"
    );
  };

  return () => {
    delete window.__echotooDevInAppNotification;
  };
}
