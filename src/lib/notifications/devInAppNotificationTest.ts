/**
 * Dev-only helpers to exercise the in-app notification banner without shipping UI.
 * From browser console (DEV builds only):
 *   window.__echotooDevInAppNotification?.("invite")
 *   window.__echotooDevInAppNotification?.("post")
 */
import { NOTIFICATION_KINDS, type NotificationKind } from "./notificationKinds";
import { showInAppNotification } from "./inAppNotificationBus";

declare global {
  interface Window {
    __echotooDevInAppNotification?: (kind?: NotificationKind) => void;
  }
}

export function registerDevInAppNotificationTestHook(): () => void {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  window.__echotooDevInAppNotification = (kind = NOTIFICATION_KINDS.INVITE) => {
    const samplePostId = "00000000-0000-4000-8000-000000000001";
    if (kind === NOTIFICATION_KINDS.INVITE) {
      showInAppNotification({
        id: `dev-invite-${Date.now()}`,
        kind: NOTIFICATION_KINDS.INVITE,
        title: "Dev: Invite banner",
        body: "Tap to open notifications (dev route).",
        routeData: {
          type: "invite",
          postId: samplePostId,
          postType: "hangout",
          inviteId: "00000000-0000-4000-8000-000000000002",
        },
      });
      return;
    }
    if (
      kind === NOTIFICATION_KINDS.FOLLOWED_POST ||
      kind === NOTIFICATION_KINDS.EVENT_REMINDER
    ) {
      showInAppNotification({
        id: `dev-post-${Date.now()}`,
        kind,
        title:
          kind === NOTIFICATION_KINDS.EVENT_REMINDER
            ? "Dev: Event reminder"
            : "Dev: New post",
        body: "Tap to open post detail (dev route).",
        routeData: {
          type: kind,
          postId: samplePostId,
          postType: "hangout",
        },
      });
      return;
    }
    if (kind === NOTIFICATION_KINDS.DM_MESSAGE) {
      showInAppNotification({
        id: `dev-dm-${Date.now()}`,
        kind,
        title: "Dev: DM (unsupported route)",
        body: "Tap should dismiss only — no crash.",
        routeData: { type: "dm_message", threadId: "dev-thread" },
      });
      return;
    }
    showInAppNotification({
      id: `dev-generic-${Date.now()}`,
      kind,
      title: `Dev: ${kind}`,
      body: "Foreground banner test.",
      routeData: { type: kind },
    });
  };

  return () => {
    delete window.__echotooDevInAppNotification;
  };
}
