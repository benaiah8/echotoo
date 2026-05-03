export type AppUpdatePlatform = "android" | "ios";

export type AppUpdateMode = "off" | "soft" | "hard";

export const APP_UPDATE_MODES: AppUpdateMode[] = ["off", "soft", "hard"];

export function coerceAppUpdateMode(value: string): AppUpdateMode {
  return APP_UPDATE_MODES.includes(value as AppUpdateMode)
    ? (value as AppUpdateMode)
    : "off";
}

export type AppUpdateConfigRow = {
  platform: AppUpdatePlatform;
  latest_version: string;
  minimum_supported_version: string;
  update_mode: AppUpdateMode;
  title: string;
  message: string;
  android_store_url: string;
  ios_store_url: string;
  is_active: boolean;
  updated_at: string;
  updated_by_user_id: string | null;
};

export type AppUpdateConfigEditable = Omit<
  AppUpdateConfigRow,
  "platform" | "updated_at" | "updated_by_user_id"
>;
