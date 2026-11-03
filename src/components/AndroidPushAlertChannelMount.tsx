/**
 * Ensures the Android FCM alert channel exists on native startup.
 * Independent of push-token registration and permission prompts.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ensureAndroidPushAlertChannel } from "../lib/androidPushAlertChannel";

export default function AndroidPushAlertChannelMount() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== "android") return;

    void ensureAndroidPushAlertChannel();
  }, []);

  return null;
}
