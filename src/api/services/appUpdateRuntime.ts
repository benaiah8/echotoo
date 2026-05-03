import { supabase } from "../../lib/supabaseClient";
import type { AppUpdateMode } from "../../types/appUpdateConfig";
import { coerceAppUpdateMode } from "../../types/appUpdateConfig";

/** Normalized payload from `public.get_app_update_runtime_config(p_platform)`. */
export type AppUpdateRuntimeConfig = {
  update_mode: AppUpdateMode;
  title: string;
  message: string;
  latest_version: string;
  minimum_supported_version: string;
  is_active: boolean;
  store_url: string;
};

function normalizeRow(raw: Record<string, unknown>): AppUpdateRuntimeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const mode = coerceAppUpdateMode(String(raw.update_mode ?? "off"));
  return {
    update_mode: mode,
    title: String(raw.title ?? "").trim(),
    message: String(raw.message ?? "").trim(),
    latest_version: String(raw.latest_version ?? "").trim(),
    minimum_supported_version: String(raw.minimum_supported_version ?? "").trim(),
    is_active: Boolean(raw.is_active),
    store_url: String(raw.store_url ?? "").trim(),
  };
}

/**
 * Public RPC — anon/authenticated per DB policy. Low-egress: call only after cooldown.
 */
export async function fetchAppUpdateRuntimeConfig(
  platform: "android" | "ios"
): Promise<AppUpdateRuntimeConfig | null> {
  const { data, error } = await supabase.rpc("get_app_update_runtime_config", {
    p_platform: platform,
  });

  if (error) {
    console.warn("[appUpdateRuntime] RPC", error.message);
    throw error;
  }

  if (data == null) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return normalizeRow(row as Record<string, unknown>);
}
