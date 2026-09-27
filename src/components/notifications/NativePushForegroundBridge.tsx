import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import { showInAppNotification } from "../../lib/notifications/inAppNotificationBus";
import { inAppNotificationFromPushData } from "../../lib/notifications/inAppNotificationFromPushData";
import { devLogInAppNotification } from "../../lib/notifications/inAppNotificationDevLog";
import { shouldSuppressForegroundBannerForActiveThread } from "../../lib/notifications/foregroundBannerSuppress";
import {
  normalizePushRouteData,
  pushRouteDataKeyMeta,
} from "../../lib/notifications/normalizePushRouteData";
import {
  NOTIFICATION_KINDS,
  normalizeNotificationKind,
} from "../../lib/notifications/notificationKinds";
import { invalidateOpenPlanIncoming } from "../../lib/openPlanCache";
import { invalidateOpenPlanRequestGroups } from "../../lib/openPlanRequestGroupsCache";
import { invalidateOpenPlanRequesters } from "../../lib/openPlanRequestersCache";
import { getViewerAuthUserId } from "../../api/services/follows";

let foregroundListenerAdded = false;

/**
 * Foreground push → in-app banner. Does not affect background tap routing.
 * No-ops on web and unsupported platforms.
 */
export default function NativePushForegroundBridge() {
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

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
                data?: unknown;
              }
            ).notification;

            const eventData =
              (event as { data?: unknown }).data &&
              typeof (event as { data?: unknown }).data === "object" &&
              !Array.isArray((event as { data?: unknown }).data)
                ? ((event as { data?: unknown }).data as Record<string, unknown>)
                : undefined;

            const notificationBlock = notification
              ? {
                  title: notification.title,
                  body: notification.body,
                }
              : null;

            const rawForNormalize: Record<string, unknown> = {
              ...(eventData ?? {}),
              ...(notification?.data &&
              typeof notification.data === "object" &&
              !Array.isArray(notification.data)
                ? (notification.data as Record<string, unknown>)
                : {}),
            };

            const routeData = normalizePushRouteData(
              rawForNormalize,
              notificationBlock
            );

            devLogInAppNotification("foreground_received", {
              hasNotification: Boolean(notification),
              hasEventData: Boolean(eventData),
              ...pushRouteDataKeyMeta(routeData),
            });

            if (
              shouldSuppressForegroundBannerForActiveThread(
                pathnameRef.current,
                routeData
              )
            ) {
              devLogInAppNotification("foreground_suppressed_active_thread", {
                pathname: pathnameRef.current,
                conversationId: routeData.conversationId,
              });
              return;
            }

            const payload = inAppNotificationFromPushData(rawForNormalize, {
              idPrefix: "foreground",
              notification: notificationBlock,
            });
            if (payload) {
              const shown = showInAppNotification(payload);
              if (!shown) {
                devLogInAppNotification("foreground_deduped_message_id", {
                  bannerId: payload.id,
                  ...pushRouteDataKeyMeta(routeData),
                });
              }
            }

            if (
              normalizeNotificationKind(routeData.type) ===
              NOTIFICATION_KINDS.OPEN_PLAN_REQUEST
            ) {
              void getViewerAuthUserId().then((uid) => {
                if (!uid) return;
                invalidateOpenPlanIncoming(uid);
                invalidateOpenPlanRequestGroups(uid);
                const opportunityId =
                  typeof routeData.opportunityId === "string"
                    ? routeData.opportunityId.trim()
                    : "";
                if (opportunityId) {
                  invalidateOpenPlanRequesters(uid, opportunityId);
                }
              });
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
