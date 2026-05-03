import type {
  AppUpdateConfigRow,
  AppUpdatePlatform,
  AppUpdateMode,
} from "../types/appUpdateConfig";

/** In-memory editor fields (matches {@link AppUpdateConfigSaveInput}). */
export type AppUpdateFormLike = {
  latest_version: string;
  minimum_supported_version: string;
  update_mode: AppUpdateMode;
  title: string;
  message: string;
  android_store_url: string;
  ios_store_url: string;
  is_active: boolean;
};

/** Build a row-shaped object from the App Updates form for preview helpers. */
export function configFormToPreviewRow(
  platform: AppUpdatePlatform,
  form: AppUpdateFormLike
): AppUpdateConfigRow {
  return {
    platform,
    latest_version: form.latest_version,
    minimum_supported_version: form.minimum_supported_version,
    update_mode: form.update_mode,
    title: form.title,
    message: form.message,
    android_store_url: form.android_store_url,
    ios_store_url: form.ios_store_url,
    is_active: form.is_active,
    updated_at: "",
    updated_by_user_id: null,
  };
}

/** When DB title/message are empty — soft modal preview. */
export const PREVIEW_FALLBACK_SOFT = {
  title: "Update available",
  message:
    "A newer version of the app is ready with improvements and fixes.",
} as const;

/** When DB title/message are empty — hard modal preview. */
export const PREVIEW_FALLBACK_HARD = {
  title: "Update required",
  message:
    "This version is no longer supported. Please update the app to continue.",
} as const;

export function previewModalTitle(
  row: AppUpdateConfigRow | undefined,
  kind: "soft" | "hard"
): string {
  const t = row?.title?.trim();
  if (t) return t;
  return kind === "soft" ? PREVIEW_FALLBACK_SOFT.title : PREVIEW_FALLBACK_HARD.title;
}

export function previewModalMessage(
  row: AppUpdateConfigRow | undefined,
  kind: "soft" | "hard"
): string {
  const m = row?.message?.trim();
  if (m) return m;
  return kind === "soft"
    ? PREVIEW_FALLBACK_SOFT.message
    : PREVIEW_FALLBACK_HARD.message;
}

/** Store URL for the selected platform row (what that build would open). */
export function previewStoreUrlForPlatform(
  row: AppUpdateConfigRow | undefined,
  platform: AppUpdatePlatform
): string | undefined {
  if (!row) return undefined;
  const raw =
    platform === "android" ? row.android_store_url : row.ios_store_url;
  const s = raw?.trim();
  return s || undefined;
}
