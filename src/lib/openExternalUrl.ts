import { isNativeApp } from "./storage/utils/capacitorDetection";

/** URLs opened in Capacitor Browser on native (avoids WKWebView `_blank` issues). */
function isBrowserOpenable(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.startsWith("https://") ||
    u.startsWith("http://") ||
    u.startsWith("mailto:") ||
    u.startsWith("tel:")
  );
}

/**
 * Open an external link. On native Capacitor, uses `@capacitor/browser`.
 * On web, uses `window.open` with `noopener,noreferrer` (previous behavior).
 */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isNativeApp() && isBrowserOpenable(trimmed)) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: trimmed });
    } catch (e) {
      console.error("[openExternalUrl]", e);
    }
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
