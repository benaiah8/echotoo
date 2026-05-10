/**
 * Push permission + registration triggered only from explicit user actions (e.g. notification explainer).
 * Does not run on startup — {@link PushRegistrationMount} remains disabled via TEMP_DISABLE_PUSH_REGISTRATION.
 *
 * Web: no-op (returns immediately).
 * Android: Capacitor PushNotifications permission + register(); `registration` upserts FCM token.
 * iOS: Same permission + PushNotifications.register() for APNs; FCM token via FirebaseMessaging only.
 * Does not automatically open system Settings when permission is denied (isolation: avoid extra leave-app / resume).
 */

import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { supabase } from "./supabaseClient";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import {
  upsertPushDevice,
  type PushDevicePlatform,
} from "../api/services/pushDevices";

function nativePlatform(): PushDevicePlatform | null {
  const p = Capacitor.getPlatform();
  if (p === "ios" || p === "android") return p;
  return null;
}

function tokenPreview(len: number): string {
  if (!Number.isFinite(len) || len <= 0) return "(empty)";
  return `length=${len}`;
}

/** Single init: duplicate registration listeners would double-upsert tokens. */
let listenersInit: Promise<void> | null = null;

/** iOS-only: FirebaseMessaging token refresh listener (registered once). */
let iosFcmListenerInit: Promise<void> | null = null;

function ensurePushListeners(): Promise<void> {
  if (!listenersInit) {
    listenersInit = (async () => {
      await PushNotifications.addListener(
        "registration",
        async (token: Token) => {
          const platform = nativePlatform();
          if (!platform) return;
          if (platform === "ios") {
            console.log(
              "[explicitNativePush] registration event ignored on iOS",
              { tokenPreview: tokenPreview(token?.value?.length ?? 0) }
            );
            return;
          }
          const value = token?.value?.trim?.() ?? "";
          if (!value) {
            console.warn(
              "[explicitNativePush] registration event with empty token"
            );
            return;
          }
          const { error } = await upsertPushDevice(value, platform);
          if (error) {
            console.warn(
              "[explicitNativePush] Failed to save push token:",
              error.message
            );
          }
        }
      );
      await PushNotifications.addListener(
        "registrationError",
        (err: unknown) => {
          console.warn(
            "[explicitNativePush] registrationError:",
            err != null ? JSON.stringify(err) : String(err)
          );
        }
      );
    })();
  }
  return listenersInit;
}

/**
 * Registers `tokenReceived` once on iOS so FCM token rotation updates Supabase.
 */
function ensureIosFcmTokenRefreshListener(): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") {
    return Promise.resolve();
  }
  if (!iosFcmListenerInit) {
    iosFcmListenerInit = (async () => {
      await FirebaseMessaging.addListener("tokenReceived", async (event) => {
        const raw = typeof event?.token === "string" ? event.token.trim() : "";
        if (!raw) {
          console.warn("[explicitNativePush] tokenReceived empty on iOS");
          return;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { error } = await upsertPushDevice(raw, "ios");
        if (error) {
          console.warn(
            "[explicitNativePush] Failed to save refreshed iOS FCM token:",
            error.message,
            { tokenPreview: tokenPreview(raw.length) }
          );
        } else {
          console.log("[explicitNativePush] iOS FCM token refreshed", {
            tokenPreview: tokenPreview(raw.length),
          });
        }
      });
    })();
  }
  return iosFcmListenerInit;
}

async function fetchAndUpsertIosFcmToken(): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") return;
  try {
    const result = await FirebaseMessaging.getToken();
    const token =
      typeof result?.token === "string" ? result.token.trim() : "";
    if (!token) {
      console.warn(
        "[explicitNativePush] FirebaseMessaging.getToken returned empty token",
        { tokenPreview: tokenPreview(0) }
      );
      return;
    }
    const { error } = await upsertPushDevice(token, "ios");
    if (error) {
      console.warn(
        "[explicitNativePush] Failed to save iOS FCM token:",
        error.message,
        { tokenPreview: tokenPreview(token.length) }
      );
    } else {
      console.log("[explicitNativePush] iOS FCM token saved", {
        tokenPreview: tokenPreview(token.length),
      });
    }
  } catch (e) {
    console.warn(
      "[explicitNativePush] FirebaseMessaging.getToken failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

export type ExplicitNativePushResult = {
  /** Native-only: true if OS permission is `granted`. */
  granted: boolean;
  /** True when not running on iOS/Android native (e.g. web) — no plugin calls. */
  skipped: boolean;
  /** True when `register()` was invoked after grant (requires signed-in user). */
  registered: boolean;
  /** Always false; reserved if a future explicit “Open Settings” action is added. */
  openedSettings: boolean;
};

/**
 * Request notification permission and register for push — call only from a direct user gesture
 * (button tap). Safe no-op on web.
 */
export async function requestNotificationPermissionAndRegister(): Promise<ExplicitNativePushResult> {
  const platform = Capacitor.getPlatform();
  console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_entry", {
    t: Date.now(),
    platform,
  });

  if (!isNativeApp() || !Capacitor.isNativePlatform()) {
    const r = {
      granted: false,
      skipped: true,
      registered: false,
      openedSettings: false,
    };
    console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
      t: Date.now(),
      platform,
      ...r,
    });
    return r;
  }

  if (!nativePlatform()) {
    const r = {
      granted: false,
      skipped: true,
      registered: false,
      openedSettings: false,
    };
    console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
      t: Date.now(),
      platform,
      ...r,
    });
    return r;
  }

  try {
    let perm = await PushNotifications.checkPermissions();
    console.log("[DBG:PUSH] checkPermissions", {
      t: Date.now(),
      platform,
      receive: perm.receive,
    });
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
      console.log("[DBG:PUSH] requestPermissions", {
        t: Date.now(),
        platform,
        receive: perm.receive,
      });
    }

    if (perm.receive !== "granted") {
      const r = {
        granted: false,
        skipped: false,
        registered: false,
        openedSettings: false,
      };
      console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
        t: Date.now(),
        platform,
        receive: perm.receive,
        ...r,
      });
      return r;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      const r = {
        granted: true,
        skipped: false,
        registered: false,
        openedSettings: false,
      };
      console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
        t: Date.now(),
        platform,
        receive: perm.receive,
        ...r,
      });
      return r;
    }

    await ensurePushListeners();
    await ensureIosFcmTokenRefreshListener();
    console.log("[DBG:PUSH] register_before", {
      t: Date.now(),
      platform,
      receive: perm.receive,
    });
    await PushNotifications.register();

    if (platform === "ios") {
      await fetchAndUpsertIosFcmToken();
    }

    const r = {
      granted: true,
      skipped: false,
      registered: true,
      openedSettings: false,
    };
    console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
      t: Date.now(),
      platform,
      receive: perm.receive,
      ...r,
    });
    return r;
  } catch (e) {
    console.warn(
      "[explicitNativePush] request/register failed:",
      e instanceof Error ? e.message : String(e)
    );
    const r = {
      granted: false,
      skipped: false,
      registered: false,
      openedSettings: false,
    };
    console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
      t: Date.now(),
      platform,
      err: e instanceof Error ? e.message : String(e),
      ...r,
    });
    return r;
  }
}

/** Normalized for UI; from `checkPermissions` only (never `requestPermissions`). */
export type NativePushReceiveUiState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unknown";

/**
 * Read-only OS state for push **receive** on iOS/Android. No prompt.
 * On web or when not native, returns `unsupported` (use web `Notification` path instead).
 */
export async function getNativePushReceiveState(): Promise<{
  ui: NativePushReceiveUiState;
}> {
  if (!isNativeApp() || !Capacitor.isNativePlatform() || !nativePlatform()) {
    return { ui: "unsupported" };
  }
  try {
    const perm = await PushNotifications.checkPermissions();
    const r = perm.receive as string;
    if (r === "granted") return { ui: "granted" };
    if (r === "denied") return { ui: "denied" };
    if (r === "prompt" || r === "prompt-with-rfc") return { ui: "prompt" };
    return { ui: "unknown" };
  } catch {
    return { ui: "unknown" };
  }
}

/** Small secondary line for own-profile menu and explainer; `null` when not shown. */
export function getNativePushStatusLabel(
  ui: NativePushReceiveUiState
): string | null {
  switch (ui) {
    case "granted":
      return "Notifications allowed";
    case "denied":
      return "Notifications off";
    case "prompt":
    case "unknown":
      return "Not enabled";
    default:
      return null;
  }
}
