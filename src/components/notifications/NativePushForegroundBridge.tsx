import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import { showInAppNotification } from "../../lib/notifications/inAppNotificationBus";
import { inAppNotificationFromPushData } from "../../lib/notifications/inAppNotificationFromPushData";

let foregroundListenerAdded = false;

/**
 * Foreground push → in-app banner. Does not affect background tap routing.
 * No-ops on web and unsupported platforms.
 */
export default function NativePushForegroundBridge() {
  useEffect(() => {
    if (!isNativeApp() || !Capacitor.isNativePlatform()) return;
    if (foregroundListenerAdded) return;
    foregroundListenerAdded = true;

    let removeListener: (() => void) | undefined;

    void (async () => {
      try {
        const handle = await PushNotifications.addListener(
          "pushNotificationReceived",
          (event) => {
            const notification = (
              event as {
                notification?: {
                  data?: unknown;
                  title?: string;
                  body?: string;
                };
              }
            ).notification;
            const data =
              notification?.data &&
              typeof notification.data === "object" &&
              !Array.isArray(notification.data)
                ? (notification.data as Record<string, unknown>)
                : {};
            const merged = {
              ...data,
              ...(notification?.title && !data.title
                ? { title: notification.title }
                : {}),
              ...(notification?.body && !data.body
                ? { body: notification.body }
                : {}),
            };
            const payload = inAppNotificationFromPushData(merged, {
              idPrefix: "foreground",
            });
            if (payload) {
              showInAppNotification(payload);
            }
          }
        );
        removeListener = () => {
          void handle.remove();
        };
      } catch (e) {
        foregroundListenerAdded = false;
        console.warn(
          "[PUSH_FOREGROUND] register failed:",
          e instanceof Error ? e.message : String(e)
        );
      }
    })();

    return () => {
      removeListener?.();
      foregroundListenerAdded = false;
    };
  }, []);

  return null;
}
