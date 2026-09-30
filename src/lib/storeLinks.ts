/**
 * Public store listing URLs (web / marketing). Override via Vite env when needed.
 */

export const APP_STORE_URL =
  import.meta.env.VITE_APP_STORE_URL ||
  "https://apps.apple.com/app/id6764676789";

/** Empty in the iOS App Store build (__ECHOTOO_IOS_BUILD__). */
export const PLAY_STORE_URL = __ECHOTOO_IOS_BUILD__
  ? ""
  : import.meta.env.VITE_PLAY_STORE_URL ||
    "https://play.google.com/store/apps/details?id=com.echotoo.app&pcampaignid=web_share";

export function hasAppStoreUrl(): boolean {
  return Boolean(String(APP_STORE_URL ?? "").trim());
}

export function hasPlayStoreUrl(): boolean {
  return Boolean(String(PLAY_STORE_URL ?? "").trim());
}
