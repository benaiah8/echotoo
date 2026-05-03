/**
 * Canonical https origin for user-facing share/profile/post links.
 * In Capacitor, `window.location.origin` is not a public web URL — set
 * `VITE_PUBLIC_APP_URL` (e.g. https://example.com) in native builds.
 */
export function getPublicShareBaseUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_APP_URL;
  if (typeof raw === "string") {
    const t = raw.trim().replace(/\/+$/, "");
    if (t) return t;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}
