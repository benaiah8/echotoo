/**
 * Session / device-local preview URLs that must never be rewritten through
 * Supabase Storage (PASS LI1D.1).
 *
 * These are presentation-only. Do not persist them into draftMeta / activities /
 * mediaOrder.
 */

/**
 * True when `src` is a WebView-loadable local/session preview URL.
 * Ordinary remote HTTPS Supabase / CDN URLs return false.
 */
export function isLocalPreviewUrl(src: string | null | undefined): boolean {
  if (typeof src !== "string") return false;
  const s = src.trim();
  if (!s) return false;

  if (s.startsWith("blob:")) return true;
  if (s.startsWith("capacitor:")) return true;
  if (s.startsWith("file:")) return true;
  // Transient in-memory previews (not Storage object keys).
  if (s.startsWith("data:")) return true;

  if (!/^https?:\/\//i.test(s)) return false;

  try {
    const url = new URL(s);
    const host = url.hostname.toLowerCase();
    // Capacitor.convertFileSrc → http(s)://localhost/_capacitor_file_/...
    if (host !== "localhost" && host !== "127.0.0.1") return false;
    const path = url.pathname;
    if (path.includes("/_capacitor_file_/")) return true;
    if (path.includes("/_capacitor_content_/")) return true;
    return false;
  } catch {
    return false;
  }
}
