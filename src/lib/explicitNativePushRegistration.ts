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

/** Safe for logs / structured results — never the full token. */
export function safePushTokenPreview(token: string): string {
  const t = token.trim();
  if (!t) return "(empty)";
  const prefix = t.slice(0, 6);
  return `${prefix}… len=${t.length}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Single init: duplicate registration listeners would double-upsert tokens. */
let listenersInit: Promise<void> | null = null;

/** iOS-only: FirebaseMessaging token refresh listener (registered once). */
let iosFcmListenerInit: Promise<void> | null = null;

/** iOS: waiters for next APNs `registration` event (readiness only — token not stored). */
type IosApnsWaitEntry = {
  timeoutId: ReturnType<typeof setTimeout>;
  finish: (outcome: { seen: boolean; error?: string }) => void;
};

const iosApnsWaitEntries: IosApnsWaitEntry[] = [];

const IOS_APNS_REGISTRATION_WAIT_MS = 20_000;

/** Delays before 2nd–4th `getToken` attempts (after prior attempt fails or returns empty). */
const IOS_FCM_GET_TOKEN_RETRY_DELAYS_MS = [500, 1000, 1500] as const;

function flushIosApnsWaitersSuccess(): void {
  const pending = iosApnsWaitEntries.splice(0);
  for (const e of pending) {
    clearTimeout(e.timeoutId);
    e.finish({ seen: true });
  }
}

function flushIosApnsWaitersError(message: string): void {
  const pending = iosApnsWaitEntries.splice(0);
  for (const e of pending) {
    clearTimeout(e.timeoutId);
    e.finish({ seen: false, error: message });
  }
}

/**
 * Resolve when the next iOS `PushNotifications.registration` fires, or timeout/error.
 * Does not add a second plugin listener — uses the shared `registration` listener.
 */
function waitForNextIosApnsRegistrationSignal(
  timeoutMs: number
): Promise<{ seen: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      const idx = iosApnsWaitEntries.findIndex((e) => e.timeoutId === timeoutId);
      if (idx >= 0) iosApnsWaitEntries.splice(idx, 1);
      resolve({ seen: false });
    }, timeoutMs);

    iosApnsWaitEntries.push({
      timeoutId,
      finish: (outcome) => {
        clearTimeout(timeoutId);
        const idx = iosApnsWaitEntries.findIndex((e) => e.timeoutId === timeoutId);
        if (idx >= 0) iosApnsWaitEntries.splice(idx, 1);
        resolve(outcome);
      },
    });
  });
}

function ensurePushListeners(): Promise<void> {
  if (!listenersInit) {
    listenersInit = (async () => {
      await PushNotifications.addListener(
        "registration",
        async (token: Token) => {
          const platform = nativePlatform();
          if (!platform) return;
          if (platform === "ios") {
            flushIosApnsWaitersSuccess();
            console.log(
              "[explicitNativePush] registration event ignored on iOS (APNs not stored)",
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
          if (Capacitor.getPlatform() === "ios") {
            flushIosApnsWaitersError(
              err != null ? JSON.stringify(err) : "registration error"
            );
          }
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
            { tokenPreview: safePushTokenPreview(raw) }
          );
        } else {
          console.log("[explicitNativePush] iOS FCM token refreshed", {
            tokenPreview: safePushTokenPreview(raw),
          });
        }
      });
    })();
  }
  return iosFcmListenerInit;
}

type IosFcmFetchOutcome = {
  fcmTokenStatus: "ok" | "empty" | "error";
  fcmErrorMessage: string | null;
  dbUpsertStatus: "ok" | "error" | "skipped";
  dbUpsertError: string | null;
  tokenPreviewSafe: string | null;
};

async function fetchUpsertIosFcmWithRetries(): Promise<IosFcmFetchOutcome> {
  let lastFcmError: string | null = null;

  const maxAttempts = IOS_FCM_GET_TOKEN_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await delay(IOS_FCM_GET_TOKEN_RETRY_DELAYS_MS[attempt - 1] ?? 500);
    }

    let token: string = "";
    try {
      const result = await FirebaseMessaging.getToken();
      token =
        typeof result?.token === "string" ? result.token.trim() : "";
    } catch (e) {
      lastFcmError = e instanceof Error ? e.message : String(e);
      console.warn(
        "[explicitNativePush] FirebaseMessaging.getToken failed:",
        lastFcmError,
        { attempt: attempt + 1 }
      );
      continue;
    }

    if (!token) {
      console.warn(
        "[explicitNativePush] FirebaseMessaging.getToken returned empty token",
        { attempt: attempt + 1, tokenPreview: tokenPreview(0) }
      );
      continue;
    }

    const { error } = await upsertPushDevice(token, "ios");
    if (error) {
      console.warn(
        "[explicitNativePush] Failed to save iOS FCM token:",
        error.message,
        { tokenPreview: safePushTokenPreview(token) }
      );
      return {
        fcmTokenStatus: "ok",
        fcmErrorMessage: null,
        dbUpsertStatus: "error",
        dbUpsertError: error.message,
        tokenPreviewSafe: safePushTokenPreview(token),
      };
    }

    console.log("[explicitNativePush] iOS FCM token saved", {
      tokenPreview: safePushTokenPreview(token),
    });
    return {
      fcmTokenStatus: "ok",
      fcmErrorMessage: null,
      dbUpsertStatus: "ok",
      dbUpsertError: null,
      tokenPreviewSafe: safePushTokenPreview(token),
    };
  }

  const fcmTokenStatus: "empty" | "error" = lastFcmError ? "error" : "empty";
  return {
    fcmTokenStatus,
    fcmErrorMessage: lastFcmError,
    dbUpsertStatus: "skipped",
    dbUpsertError: null,
    tokenPreviewSafe: null,
  };
}

export type PushPermissionReceiveState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rfc"
  | string;

export type ExplicitNativePushResult = {
  /** Native-only: true if OS permission is `granted`. */
  granted: boolean;
  /** True when not running on iOS/Android native (e.g. web) — no plugin calls. */
  skipped: boolean;
  /**
   * Android: true after `PushNotifications.register()` is invoked (upsert still happens async in listener).
   * iOS: true only when FCM token was saved to Supabase (`dbUpsertStatus === 'ok'`).
   */
  registered: boolean;
  /** Always false; reserved if a future explicit “Open Settings” action is added. */
  openedSettings: boolean;
  /** Last known `receive` permission from the plugin (when checked). */
  permissionReceive?: PushPermissionReceiveState;
  /** True when the OS permission was already granted before this user action. */
  permissionAlreadyGranted?: boolean;
  /** Whether a Supabase session user was present when registration was attempted. */
  sessionOk?: boolean;
  /** iOS: APNs delivered `registration` before timeout (readiness only). */
  iosApnsRegistrationSeen?: boolean;
  iosApnsRegistrationError?: string | null;
  /** iOS: outcome of FCM `getToken` after retries. */
  fcmTokenStatus?: "ok" | "empty" | "error";
  fcmErrorMessage?: string | null;
  /** iOS: Supabase upsert outcome. Android omitted (async listener). */
  dbUpsertStatus?: "ok" | "error" | "skipped";
  dbUpsertError?: string | null;
  /** Safe preview when a token was obtained (`first6… len=n`). */
  tokenPreviewSafe?: string | null;
};

/**
 * Maps registration outcome to short UI copy for toasts (no secrets).
 */
export function getPushRegistrationUserFeedback(result: ExplicitNativePushResult): {
  kind: "success" | "error" | "none";
  message: string;
} {
  if (result.skipped) {
    return { kind: "none", message: "" };
  }
  if (!result.granted) {
    if (result.permissionReceive) {
      return {
        kind: "error",
        message: "Notifications are off. You can enable them in Settings.",
      };
    }
    return {
      kind: "error",
      message: "Couldn’t enable notifications. Please try again.",
    };
  }
  if (result.sessionOk === false) {
    return {
      kind: "error",
      message: "Please sign in to enable notifications.",
    };
  }

  const platform = Capacitor.getPlatform();

  if (platform === "ios" && result.sessionOk === true) {
    if (result.dbUpsertStatus === "ok") {
      return {
        kind: "success",
        message: result.permissionAlreadyGranted
          ? "Notifications are up to date"
          : "Notifications enabled",
      };
    }
    if (
      result.dbUpsertStatus === "error" ||
      result.fcmTokenStatus === "empty" ||
      result.fcmTokenStatus === "error"
    ) {
      return {
        kind: "error",
        message: "Couldn’t enable notifications. Please try again.",
      };
    }
  }

  if (platform === "android" && result.registered) {
    return {
      kind: "success",
      message: result.permissionAlreadyGranted
        ? "Notifications are up to date"
        : "Notifications enabled",
    };
  }

  return { kind: "none", message: "" };
}

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
    const r: ExplicitNativePushResult = {
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
    const r: ExplicitNativePushResult = {
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
    const permissionAlreadyGranted = perm.receive === "granted";
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

    const permissionReceive = perm.receive as PushPermissionReceiveState;

    if (perm.receive !== "granted") {
      const r: ExplicitNativePushResult = {
        granted: false,
        skipped: false,
        registered: false,
        openedSettings: false,
        permissionReceive,
        permissionAlreadyGranted,
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
    const sessionOk = Boolean(session?.user);

    if (!sessionOk) {
      const r: ExplicitNativePushResult = {
        granted: true,
        skipped: false,
        registered: false,
        openedSettings: false,
        permissionReceive,
        permissionAlreadyGranted,
        sessionOk: false,
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

    if (platform === "ios") {
      const apnsWait = waitForNextIosApnsRegistrationSignal(
        IOS_APNS_REGISTRATION_WAIT_MS
      );
      console.log("[DBG:PUSH] register_before", {
        t: Date.now(),
        platform,
        receive: perm.receive,
      });
      await PushNotifications.register();
      const apnsOutcome = await apnsWait;

      const fcmOutcome = await fetchUpsertIosFcmWithRetries();

      const iosRegistered = fcmOutcome.dbUpsertStatus === "ok";

      const r: ExplicitNativePushResult = {
        granted: true,
        skipped: false,
        registered: iosRegistered,
        openedSettings: false,
        permissionReceive,
        permissionAlreadyGranted,
        sessionOk: true,
        iosApnsRegistrationSeen: apnsOutcome.seen,
        iosApnsRegistrationError: apnsOutcome.error ?? null,
        fcmTokenStatus: fcmOutcome.fcmTokenStatus,
        fcmErrorMessage: fcmOutcome.fcmErrorMessage,
        dbUpsertStatus: fcmOutcome.dbUpsertStatus,
        dbUpsertError: fcmOutcome.dbUpsertError,
        tokenPreviewSafe: fcmOutcome.tokenPreviewSafe,
      };
      console.log("[DBG:PUSH] requestNotificationPermissionAndRegister_result", {
        t: Date.now(),
        platform,
        receive: perm.receive,
        ...r,
      });
      return r;
    }

    console.log("[DBG:PUSH] register_before", {
      t: Date.now(),
      platform,
      receive: perm.receive,
    });
    await PushNotifications.register();

    const r: ExplicitNativePushResult = {
      granted: true,
      skipped: false,
      registered: true,
      openedSettings: false,
      permissionReceive,
      permissionAlreadyGranted,
      sessionOk: true,
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
    const r: ExplicitNativePushResult = {
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
