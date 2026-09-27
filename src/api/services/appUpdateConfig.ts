import { supabase } from "../../lib/supabaseClient";
import type {
  AppUpdateConfigRow,
  AppUpdateMode,
  AppUpdatePlatform,
} from "../../types/appUpdateConfig";

const SELECT_LEGACY =
  "platform,latest_version,minimum_supported_version,update_mode,title,message,android_store_url,ios_store_url,is_active,updated_at,updated_by_user_id";

const SELECT_FULL =
  "platform,latest_version,latest_build,minimum_supported_version,minimum_supported_build,update_mode,title,message,android_store_url,ios_store_url,is_active,store_release_ready,updated_at,updated_by_user_id";

/**
 * All config rows (RLS: report reviewers only).
 * Tolerates pre-migration schema (missing build / store_release_ready columns).
 */
export async function listAppUpdateConfig(): Promise<AppUpdateConfigRow[]> {
  const full = await supabase
    .from("app_update_config")
    .select(SELECT_FULL)
    .order("platform", { ascending: true });

  if (!full.error) {
    return (full.data ?? []).map((row) =>
      normalizeAdminRow(row as Record<string, unknown>)
    );
  }

  // Column missing until migration applied — fall back to legacy projection.
  const msg = full.error.message ?? "";
  if (
    /latest_build|minimum_supported_build|store_release_ready|column/i.test(msg)
  ) {
    const legacy = await supabase
      .from("app_update_config")
      .select(SELECT_LEGACY)
      .order("platform", { ascending: true });
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []).map((row) =>
      normalizeAdminRow(row as Record<string, unknown>)
    );
  }

  throw full.error;
}

function normalizeAdminRow(raw: Record<string, unknown>): AppUpdateConfigRow {
  return {
    platform: raw.platform as AppUpdatePlatform,
    latest_version: String(raw.latest_version ?? ""),
    latest_build: String(raw.latest_build ?? ""),
    minimum_supported_version: String(raw.minimum_supported_version ?? ""),
    minimum_supported_build: String(raw.minimum_supported_build ?? ""),
    update_mode: (raw.update_mode as AppUpdateMode) ?? "off",
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    android_store_url: String(raw.android_store_url ?? ""),
    ios_store_url: String(raw.ios_store_url ?? ""),
    is_active: Boolean(raw.is_active),
    // Pre-migration / missing column: default false so admin must opt in after apply.
    store_release_ready:
      raw.store_release_ready === undefined || raw.store_release_ready === null
        ? false
        : Boolean(raw.store_release_ready),
    updated_at: String(raw.updated_at ?? ""),
    updated_by_user_id: (raw.updated_by_user_id as string | null) ?? null,
  };
}

export type AppUpdateConfigSaveInput = {
  latest_version: string;
  latest_build: string;
  minimum_supported_version: string;
  minimum_supported_build: string;
  update_mode: AppUpdateMode;
  title: string;
  message: string;
  android_store_url: string;
  ios_store_url: string;
  is_active: boolean;
  store_release_ready: boolean;
};

/**
 * Update one platform row (RLS: report reviewers only). Audit columns via DB triggers.
 * Omits new columns when the live schema has not been migrated yet.
 */
export async function updateAppUpdateConfig(
  platform: AppUpdatePlatform,
  input: AppUpdateConfigSaveInput
): Promise<void> {
  const fullAttempt = await supabase
    .from("app_update_config")
    .update(input)
    .eq("platform", platform);

  if (!fullAttempt.error) return;

  const msg = fullAttempt.error.message ?? "";
  if (
    !/latest_build|minimum_supported_build|store_release_ready|column/i.test(msg)
  ) {
    throw fullAttempt.error;
  }

  const {
    latest_build: _lb,
    minimum_supported_build: _mb,
    store_release_ready: _sr,
    ...legacyInput
  } = input;

  const legacyAttempt = await supabase
    .from("app_update_config")
    .update(legacyInput)
    .eq("platform", platform);

  if (legacyAttempt.error) throw legacyAttempt.error;
}

/** Admin-side validation before save (also mirrored at runtime for hard). */
export function validateAppUpdateConfigSave(
  platform: AppUpdatePlatform,
  input: AppUpdateConfigSaveInput
): string | null {
  const storeUrl =
    platform === "android"
      ? input.android_store_url.trim()
      : input.ios_store_url.trim();

  if (
    input.store_release_ready &&
    (input.update_mode === "hard" || input.update_mode === "soft") &&
    !storeUrl
  ) {
    return "Set the platform store URL before marking the release ready (avoids a broken Update button).";
  }

  if (input.update_mode === "hard" && input.store_release_ready && !storeUrl) {
    return "Hard updates require a store URL and store-release-ready.";
  }

  const buildFields = [input.latest_build, input.minimum_supported_build];
  for (const b of buildFields) {
    const t = b.trim();
    if (t && !/^\d+$/.test(t)) {
      return "Build numbers must be non-negative integers (Android versionCode / iOS CFBundleVersion).";
    }
  }

  return null;
}
