import { isNativeApp } from "./storage/utils/capacitorDetection";

/**
 * Opens a Supabase OAuth authorization URL without relying on the client’s
 * implicit browser redirect. Native uses `@capacitor/browser` (SFSafariViewController
 * on iOS); web uses a full navigation so PKCE OAuth completes in the same tab.
 */
export async function openOAuthUrl(url: string): Promise<void> {
  if (!url) return;
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}
