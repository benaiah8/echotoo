/**
 * Android HIGH-importance push channel for FCM `notification_and_data` tray display.
 * Channel ID must match Edge `ECHO_ANDROID_ALERTS_CHANNEL_ID` in
 * supabase/functions/_shared/push/androidNotificationDelivery.ts.
 *
 * Creating the channel does not request permission or register a push token.
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/** FCM `android.notification.channel_id` for background tray alerts. */
export const ECHO_ANDROID_ALERTS_CHANNEL_ID = "echo_alerts_v1";

export const ECHO_ANDROID_ALERTS_CHANNEL_NAME = "EchoToo Alerts";

export const ECHO_ANDROID_ALERTS_CHANNEL_DESCRIPTION =
  "Messages, invites, and activity alerts from EchoToo";

/** Capacitor Importance.HIGH — heads-up eligible when user/OS allow. */
export const ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE = 5 as const;

let ensureInFlight: Promise<void> | null = null;

/**
 * Idempotent: safe to call on every Android startup.
 * No-ops on iOS, web, and non-native platforms.
 */
export async function ensureAndroidPushAlertChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== "android") return;

  if (ensureInFlight) {
    await ensureInFlight;
    return;
  }

  ensureInFlight = (async () => {
    await PushNotifications.createChannel({
      id: ECHO_ANDROID_ALERTS_CHANNEL_ID,
      name: ECHO_ANDROID_ALERTS_CHANNEL_NAME,
      description: ECHO_ANDROID_ALERTS_CHANNEL_DESCRIPTION,
      importance: ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE,
      sound: "default",
      vibration: true,
    });
  })();

  try {
    await ensureInFlight;
  } catch (err) {
    console.error(
      "[androidPushAlertChannel] createChannel failed:",
      err instanceof Error ? err.message : err
    );
  } finally {
    ensureInFlight = null;
  }
}
