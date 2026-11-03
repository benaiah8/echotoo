import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ECHO_ANDROID_ALERTS_CHANNEL_DESCRIPTION,
  ECHO_ANDROID_ALERTS_CHANNEL_ID,
  ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE,
  ECHO_ANDROID_ALERTS_CHANNEL_NAME,
} from "./androidPushAlertChannel";
import {
  buildAndroidNotificationAndDataConfig,
  ECHO_ANDROID_ALERTS_CHANNEL_ID as EDGE_CHANNEL_ID,
} from "../../supabase/functions/_shared/push/androidNotificationDelivery.ts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Android push alert channel", () => {
  it("uses echo_alerts_v1 HIGH channel constants aligned with Edge", () => {
    expect(ECHO_ANDROID_ALERTS_CHANNEL_ID).toBe("echo_alerts_v1");
    expect(EDGE_CHANNEL_ID).toBe(ECHO_ANDROID_ALERTS_CHANNEL_ID);
    expect(ECHO_ANDROID_ALERTS_CHANNEL_NAME).toBe("EchoToo Alerts");
    expect(ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE).toBe(5);
    expect(ECHO_ANDROID_ALERTS_CHANNEL_DESCRIPTION.length).toBeGreaterThan(0);
  });

  it("Edge builder sets HIGH priority, channel_id, and default sound", () => {
    const android = buildAndroidNotificationAndDataConfig();
    expect(android).toEqual({
      priority: "HIGH",
      notification: {
        channel_id: "echo_alerts_v1",
        sound: "default",
      },
    });
  });

  it("shared fcm.ts wires android config only for notification_and_data", () => {
    const fcm = read("supabase/functions/_shared/push/fcm.ts");
    expect(fcm).toContain("buildAndroidNotificationAndDataConfig");
    expect(fcm).toContain('androidDelivery === "notification_and_data"');
    expect(fcm).toContain("android: buildAndroidNotificationAndDataConfig()");
    // data_only path keeps priority HIGH without channel helper
    expect(fcm).toMatch(
      /androidDelivery === "notification_and_data"[\s\S]*?android: buildAndroidNotificationAndDataConfig\(\)[\s\S]*?:\s*\{[\s\S]*?android:\s*\{\s*priority:\s*"HIGH"/
    );
    // iOS still uses apns sound default and is branched separately
    expect(fcm).toContain('sound: "default"');
    expect(fcm).toContain('platform === "ios"');
  });

  it("preserves top-level notification and data for notification_and_data", () => {
    const fcm = read("supabase/functions/_shared/push/fcm.ts");
    expect(fcm).toMatch(
      /androidDelivery === "notification_and_data"\s*\?\s*\{[\s\S]*?token: deviceToken,[\s\S]*?notification,[\s\S]*?android: buildAndroidNotificationAndDataConfig\(\),[\s\S]*?data: fcmData,/
    );
  });

  it("push senders use notification_and_data (inherit shared fcm)", () => {
    const senders = [
      "supabase/functions/send-invite-push/index.ts",
      "supabase/functions/send-post-push/index.ts",
      "supabase/functions/send-dm-push/index.ts",
      "supabase/functions/send-open-plan-request-push/index.ts",
      "supabase/functions/send-group-up-push/index.ts",
      "supabase/functions/send-saved-event-reminders/index.ts",
      "supabase/functions/send-admin-campaign-push/index.ts",
    ];
    for (const path of senders) {
      const src = read(path);
      expect(src).toContain('androidDelivery: "notification_and_data"');
    }
  });

  it("App mounts AndroidPushAlertChannelMount on native startup", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("AndroidPushAlertChannelMount");
    expect(app).toContain(
      "{isNativeApp() && <AndroidPushAlertChannelMount />}"
    );
    const mount = read("src/components/AndroidPushAlertChannelMount.tsx");
    expect(mount).toContain("ensureAndroidPushAlertChannel");
    expect(mount).toContain('Capacitor.getPlatform() !== "android"');
    const lib = read("src/lib/androidPushAlertChannel.ts");
    expect(lib).toContain("createChannel");
    expect(lib).toContain("importance: ECHO_ANDROID_ALERTS_CHANNEL_IMPORTANCE");
    expect(lib).toContain('sound: "default"');
  });
});
