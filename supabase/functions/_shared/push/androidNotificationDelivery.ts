/**
 * Pure Android FCM helpers for `notification_and_data` delivery.
 * Keep free of Deno/npm imports so vitest can import for unit tests.
 */

/** Must match client `ECHO_ANDROID_ALERTS_CHANNEL_ID` in src/lib/androidPushAlertChannel.ts */
export const ECHO_ANDROID_ALERTS_CHANNEL_ID = "echo_alerts_v1";

export type AndroidNotificationAndDataConfig = {
  priority: "HIGH";
  notification: {
    channel_id: string;
    sound: string;
  };
};

/**
 * Android block for FCM HTTP v1 when sending notification + data.
 * Does not alter top-level `notification` or `data` maps.
 */
export function buildAndroidNotificationAndDataConfig(): AndroidNotificationAndDataConfig {
  return {
    priority: "HIGH",
    notification: {
      channel_id: ECHO_ANDROID_ALERTS_CHANNEL_ID,
      sound: "default",
    },
  };
}
