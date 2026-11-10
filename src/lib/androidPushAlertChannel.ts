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

/**
 * Android NotificationManager.IMPORTANCE_HIGH.
 * Capacitor 8 passes this integer straight through to NotificationChannel.
 * 3 is IMPORTANCE_DEFAULT (shade only). 5 is IMPORTANCE_MAX.
 * Heads-up still depends on the device's channel settings.
 */
export const ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE = 4 as const;

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
    // Do not pass `sound`. Capacitor 8 maps any sound string to
    // android.resource://<package>/raw/<name>. "default" is not a raw
    // resource, so the channel is created silent. Omitting sound keeps
    // the system default. This call cannot repair a channel Android
    // already persisted, and it must not delete or replace one.
    await PushNotifications.createChannel({
      id: ECHO_ANDROID_ALERTS_CHANNEL_ID,
      name: ECHO_ANDROID_ALERTS_CHANNEL_NAME,
      description: ECHO_ANDROID_ALERTS_CHANNEL_DESCRIPTION,
      importance: ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE,
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
