import { useEffect, useState } from "react";
import {
  subscribeInAppNotifications,
  type InAppNotificationPayload,
} from "../../lib/notifications/inAppNotificationBus";
import { registerDevInAppNotificationTestHook } from "../../lib/notifications/devInAppNotificationTest";
import InAppNotificationBanner from "./InAppNotificationBanner";

/**
 * Subscribes to the in-app notification bus and renders the top banner.
 * Mount under BrowserRouter (for tap routing) inside global chrome.
 */
export default function InAppNotificationBannerHost() {
  const [notification, setNotification] =
    useState<InAppNotificationPayload | null>(null);

  useEffect(() => subscribeInAppNotifications(setNotification), []);

  useEffect(() => registerDevInAppNotificationTestHook(), []);

  if (!notification) return null;

  return <InAppNotificationBanner notification={notification} />;
}
