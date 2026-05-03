/**
 * Native push tap → in-app route. FCM `data` uses `postId` + `postType` (from send-post-push).
 * Registers once; bridges navigation via {@link setNativePushTapNavigateHandler} from a Router child.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import { postDetailPath } from "../router/Paths";

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

function parsePostPushData(
  data: Record<string, unknown> | null | undefined
): { postId: string; postType: "hangout" | "experience" } | null {
  if (!data) {
    console.log("[PUSH_TAP] ignored_invalid_payload", { reason: "no_data" });
    return null;
  }
  const postId = String(data.postId ?? "")
    .trim();
  const postTypeRaw = String(data.postType ?? "")
    .trim();
  if (
    !postId ||
    (postTypeRaw !== "hangout" && postTypeRaw !== "experience")
  ) {
    console.log("[PUSH_TAP] ignored_invalid_payload", {
      postId: postId || null,
      postType: postTypeRaw || null,
    });
    return null;
  }
  return { postId, postType: postTypeRaw as "hangout" | "experience" };
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
          const parsed = parsePostPushData(record);
          if (!parsed) return;
          const path = postDetailPath(parsed.postType, parsed.postId);
          deliverPath(path);
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
