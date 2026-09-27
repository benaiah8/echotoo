import type { AppUpdateRuntimeConfig } from "../api/services/appUpdateRuntime";
import { softDismissSignature } from "./appUpdateDecision";

const PREFIX = "echotoo_app_update_";

export const APP_UPDATE_LAST_CHECK_KEY = `${PREFIX}last_check_at`;
export const APP_UPDATE_CACHED_CONFIG_KEY = `${PREFIX}cached_config_json`;
/** Value: soft-dismiss signature for platform + latest target. */
export const APP_UPDATE_SOFT_DISMISS_KEY = `${PREFIX}soft_dismiss`;

const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export function getCooldownMs(): number {
  return COOLDOWN_MS;
}

export function readLastCheckAt(): number | null {
  try {
    const raw = localStorage.getItem(APP_UPDATE_LAST_CHECK_KEY);
    if (!raw) return null;
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastCheckAtNow(): void {
  try {
    localStorage.setItem(APP_UPDATE_LAST_CHECK_KEY, new Date().toISOString());
  } catch {
    /* noop */
  }
}

export function isCooldownExpired(now: number): boolean {
  const last = readLastCheckAt();
  if (last == null) return true;
  return now - last >= COOLDOWN_MS;
}

export function readCachedConfig(): AppUpdateRuntimeConfig | null {
  try {
    const raw = localStorage.getItem(APP_UPDATE_CACHED_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUpdateRuntimeConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedConfig(config: AppUpdateRuntimeConfig): void {
  try {
    localStorage.setItem(APP_UPDATE_CACHED_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* noop */
  }
}

export function readSoftDismissSignature(): string | null {
  try {
    return localStorage.getItem(APP_UPDATE_SOFT_DISMISS_KEY);
  } catch {
    return null;
  }
}

export function writeSoftDismissSignature(
  platform: string,
  latestVersion: string,
  latestBuild?: string | null
): void {
  try {
    const v = latestVersion.trim();
    if (!v && !(latestBuild ?? "").trim()) return;
    localStorage.setItem(
      APP_UPDATE_SOFT_DISMISS_KEY,
      softDismissSignature(platform, latestVersion, latestBuild)
    );
  } catch {
    /* noop */
  }
}

export function isSoftDismissedFor(
  platform: string,
  latestVersion: string,
  latestBuild?: string | null
): boolean {
  const sig = softDismissSignature(platform, latestVersion, latestBuild);
  if (!latestVersion.trim() && !(latestBuild ?? "").trim()) return false;
  return readSoftDismissSignature() === sig;
}
