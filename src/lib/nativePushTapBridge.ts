/**
 * Native push tap → in-app route. Normalizes FCM data, resolves via shared resolver,
 * and delivers full route results to {@link setNativePushTapNavigateHandler}.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import {
  normalizePushRouteData,
  pushRouteDataKeyMeta,
} from "./notifications/normalizePushRouteData";
import {
  resolveNotificationRoute,
  type NotificationRouteResult,
} from "./notifications/notificationRouteResolver";

export type ResolvedNotificationRoute = Extract<
  NotificationRouteResult,
  { supported: true }
>;

let tapListenerAdded = false;
let navigateHandler: ((route: ResolvedNotificationRoute) => void) | null = null;
let pendingRoute: ResolvedNotificationRoute | null = null;

function logPushTapResolvedRoute(
  route: ResolvedNotificationRoute,
  meta: ReturnType<typeof pushRouteDataKeyMeta>
): void {
  console.log("[PUSH_TAP] route_resolved", {
    kind: route.kind,
    mode: route.mode,
    path: route.path,
    ...meta,
  });
}

function deliverRoute(route: ResolvedNotificationRoute): void {
  if (navigateHandler) {
    navigateHandler(route);
  } else {
    pendingRoute = route;
  }
}

export function setNativePushTapNavigateHandler(
  fn: ((route: ResolvedNotificationRoute) => void) | null
): void {
  navigateHandler = fn;
  if (fn && pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    console.log("[PUSH_TAP] navigate", {
      path: route.path,
      mode: route.mode,
      kind: route.kind,
      fromPending: true,
    });
    fn(route);
  }
}

/**
 * Call once on native; safe to call from React useEffect. Idempotent.
 */
export function registerNativePushTapListener(): void {
  if (!isNativeApp() || !Capacitor.isNativePlatform()) return;
  if (tapListenerAdded) return;
  tapListenerAdded = true;

  void (async () => {
    try {
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (event) => {
          console.log("[PUSH_TAP] received", {
            actionId: (event as { actionId?: string }).actionId,
            hasNotification: !!(
              event as { notification?: { data?: unknown } }
            ).notification,
          });

          const notification = (
            event as {
              notification?: {
                data?: unknown;
                title?: string;
                body?: string;
              };
            }
          ).notification;

          const rawForNormalize: Record<string, unknown> = {
            ...(notification?.data &&
            typeof notification.data === "object" &&
            !Array.isArray(notification.data)
              ? (notification.data as Record<string, unknown>)
              : {}),
          };

          const routeData = normalizePushRouteData(rawForNormalize, {
            title: notification?.title,
            body: notification?.body,
          });
          const meta = pushRouteDataKeyMeta(routeData);

          console.log("[PUSH_TAP] tap_data_meta", meta);

          const route = resolveNotificationRoute(routeData);
          if (!route.supported) {
            console.log("[PUSH_TAP] ignored_invalid_payload", {
              reason: route.reason,
              kind: route.kind,
              ...meta,
            });
            return;
          }

          logPushTapResolvedRoute(route, meta);
          deliverRoute(route);
        }
      );
    } catch (e) {
      tapListenerAdded = false;
      console.warn(
        "[PUSH_TAP] register failed:",
        e instanceof Error ? e.message : String(e)
      );
    }
  })();
}
