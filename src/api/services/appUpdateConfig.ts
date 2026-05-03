import { supabase } from "../../lib/supabaseClient";
import type {
  AppUpdateConfigRow,
  AppUpdateMode,
  AppUpdatePlatform,
} from "../../types/appUpdateConfig";

const SELECT =
  "platform,latest_version,minimum_supported_version,update_mode,title,message,android_store_url,ios_store_url,is_active,updated_at,updated_by_user_id";

/**
 * All config rows (RLS: report reviewers only).
 */
export async function listAppUpdateConfig(): Promise<AppUpdateConfigRow[]> {
  const { data, error } = await supabase
    .from("app_update_config")
    .select(SELECT)
    .order("platform", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AppUpdateConfigRow[];
}

export type AppUpdateConfigSaveInput = {
  latest_version: string;
  minimum_supported_version: string;
  update_mode: AppUpdateMode;
  title: string;
  message: string;
  android_store_url: string;
  ios_store_url: string;
  is_active: boolean;
};

/**
 * Update one platform row (RLS: report reviewers only). Audit columns via DB triggers.
 */
export async function updateAppUpdateConfig(
  platform: AppUpdatePlatform,
  input: AppUpdateConfigSaveInput
): Promise<void> {
  const { error } = await supabase
    .from("app_update_config")
    .update(input)
    .eq("platform", platform);

  if (error) throw error;
}
