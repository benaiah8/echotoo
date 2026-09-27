/**
 * Open OS app / notification settings (Capacitor native).
 * Uses capacitor-native-settings; no-op / false on web or failure.
 */

import { isNativeApp } from "./storage/utils/capacitorDetection";

/**
 * Opens app notification settings when possible (Android AppNotification,
 * iOS AppNotification). Returns true if the plugin reported success.
 */
export async function openNativeAppNotificationSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      "capacitor-native-settings"
    );
    const result = await NativeSettings.open({
      optionAndroid: AndroidSettings.AppNotification,
      optionIOS: IOSSettings.AppNotification,
    });
    return result?.status === true;
  } catch {
    return false;
  }
}
