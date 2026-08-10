/**
 * Native push tap → in-app route. FCM `data` uses `postId` + `postType` (from send-post-push).
 * Registers once; bridges navigation via {@link setNativePushTapNavigateHandler} from a Router child.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import { resolveNotificationRoute } from "./notifications/notificationRouteResolver";

let tapListenerAdded = false;
let navigateHandler: ((path: string) => void) | null = null;
let pendingPath: string | null = null;

function deliverPath(path: string): void {
  if (navigateHandler) {
    console.log("[PUSH_TAP] navigate", { path });
    navigateHandler(path);
  } else {
    pendingPath = path;
  }
}

export function setNativePushTapNavigateHandler(
  fn: ((path: string) => void) | null
): void {
  navigateHandler = fn;
  if (fn && pendingPath) {
    const p = pendingPath;
    pendingPath = null;
    console.log("[PUSH_TAP] navigate", { path: p, fromPending: true });
    fn(p);
  }
}

/** Safe tap diagnostics: keys + presence flags only (no full tokens/IDs). */
function logPushTapPayloadMeta(
  data: Record<string, unknown> | null | undefined
): void {
  if (!data) {
    console.log("[PUSH_TAP] tap_data_meta", {
      keys: [],
      hasType: false,
      hasInviteId: false,
      hasThreadId: false,
      hasThreadKind: false,
    });
    return;
  }
  const keys = Object.keys(data);
  const hasType =
    Object.prototype.hasOwnProperty.call(data, "type") &&
    String(data.type ?? "").trim().length > 0;
  const hasInviteId =
    Object.prototype.hasOwnProperty.call(data, "inviteId") &&
    String(data.inviteId ?? "").trim().length > 0;
  const hasThreadId =
    Object.prototype.hasOwnProperty.call(data, "threadId") &&
    String(data.threadId ?? "").trim().length > 0;
  const hasThreadKind =
    Object.prototype.hasOwnProperty.call(data, "threadKind") &&
    String(data.threadKind ?? "").trim().length > 0;
  console.log("[PUSH_TAP] tap_data_meta", {
    keys,
    hasType,
    hasInviteId,
    hasThreadId,
    hasThreadKind,
  });
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
          const data = (event as { notification?: { data?: unknown } })
            .notification?.data;
          const record =
            data && typeof data === "object" && !Array.isArray(data)
              ? (data as Record<string, unknown>)
              : undefined;
          logPushTapPayloadMeta(record);
          const route = resolveNotificationRoute(record);
          if (!route.supported) {
            console.log("[PUSH_TAP] ignored_invalid_payload", {
              reason: route.reason,
              kind: route.kind,
            });
            return;
          }
          deliverPath(route.path);
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
