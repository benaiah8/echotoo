/**
 * Resolve store listing URL for App Update prompts.
 * Android may fall back to the canonical Play listing; iOS never invents a URL.
 */

export const ECHOTOO_ANDROID_PACKAGE_ID = "com.echotoo.app";

/** Empty in the iOS App Store build (__ECHOTOO_IOS_BUILD__); iOS never uses it. */
export const ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL = __ECHOTOO_IOS_BUILD__
  ? ""
  : `https://play.google.com/store/apps/details?id=${ECHOTOO_ANDROID_PACKAGE_ID}`;

export function resolveAppUpdateStoreUrl(
  platform: "android" | "ios",
  configuredUrl: string | null | undefined
): { url: string; usedFallback: boolean } {
  const trimmed = (configuredUrl ?? "").trim();
  if (trimmed) {
    return { url: trimmed, usedFallback: false };
  }
  if (platform === "android") {
    return {
      url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      usedFallback: true,
    };
  }
  return { url: "", usedFallback: false };
}
