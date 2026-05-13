/**
 * Native push tap → in-app route. FCM `data` uses `postId` + `postType` (from send-post-push).
 * Registers once; bridges navigation via {@link setNativePushTapNavigateHandler} from a Router child.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import { Paths, postDetailPath } from "../router/Paths";

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

function isInvitePushData(
  data: Record<string, unknown> | null | undefined
): boolean {
  const typeRaw = String(data?.type ?? "").trim();
  return typeRaw === "invite";
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

/** Deep-link to notifications tab with optional invite/thread ids from FCM data. */
function buildInviteNotificationsPath(
  data: Record<string, unknown> | null | undefined
): string {
  const inviteId = String(data?.inviteId ?? "").trim();
  const threadId = String(data?.threadId ?? "").trim();
  const threadKind = String(data?.threadKind ?? "").trim();
  if (!inviteId && !threadId) {
    return Paths.notification;
  }
  const params = new URLSearchParams();
  params.set("source", "push");
  if (inviteId) params.set("inviteId", inviteId);
  if (threadId) params.set("threadId", threadId);
  if (threadKind) params.set("threadKind", threadKind);
  return `${Paths.notification}?${params.toString()}`;
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
          if (isInvitePushData(record)) {
            deliverPath(buildInviteNotificationsPath(record));
            return;
          }
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
