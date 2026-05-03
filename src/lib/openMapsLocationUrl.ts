import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "./storage/utils/capacitorDetection";
import { openExternalUrl } from "./openExternalUrl";

/**
 * If the stored value is a pasted Maps embed snippet, return the iframe src URL.
 */
function resolveStoredMapsHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("<iframe") && t.includes("src=")) {
    const dquote = t.match(/src\s*=\s*"([^"]+)"/i);
    if (dquote?.[1]) return dquote[1].trim();
    const squote = t.match(/src\s*=\s*'([^']+)'/i);
    if (squote?.[1]) return squote[1].trim();
  }
  return t;
}

/** True for typical Google / Apple Maps web links and geo URIs used in this app. */
function isProbablyMapsLocationUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("geo:")) return true;
  if (lower.startsWith("maps:")) return true;
  if (!/^https?:\/\//i.test(t)) return false;

  try {
    const u = new URL(t);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (host === "maps.app" || host.endsWith(".maps.app")) return true;

    if (host === "goo.gl" && path.includes("/maps")) return true;

    if (host === "maps.google.com" || host.startsWith("maps.google."))
      return true;

    const googleMapsLikeHost =
      host.includes(".google.") ||
      /^google\.[a-z]{2,24}(\.[a-z]{2})?$/i.test(host) ||
      host.endsWith(".googleusercontent.com");

    if (path.includes("/maps") && googleMapsLikeHost) return true;

    if (host === "maps.apple.com" || host.endsWith(".maps.apple.com"))
      return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Google-hosted map links (and geo:/maps: schemes) that the native Google Maps app
 * can handle. Excludes `maps.apple.com` — those keep the non–Google Maps code path.
 */
function isOpenInGoogleMapsAppCandidate(url: string): boolean {
  if (!isProbablyMapsLocationUrl(url)) return false;
  const t = url.trim().toLowerCase();
  if (t.startsWith("geo:") || t.startsWith("maps:")) return true;
  if (!t.startsWith("http")) return false;
  try {
    const h = new URL(t).hostname.toLowerCase();
    if (h === "maps.apple.com" || h.endsWith(".maps.apple.com")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Android: Chrome intent so `com.google.android.apps.maps` handles the same https/geo URL
 * (avoids opening the default **browser** first, which then bounces to Maps).
 * @see https://developer.chrome.com/docs/android/intents/
 */
function buildAndroidOpenGoogleMapsAppIntent(href: string): string {
  const lower = href.trim().toLowerCase();
  if (lower.startsWith("geo:") || lower.startsWith("maps:")) {
    return `intent:#Intent;action=android.intent.action.VIEW;data=${encodeURIComponent(
      href,
    )};package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(
      "https://maps.google.com",
    )};end`;
  }
  const u = new URL(href);
  const scheme = u.protocol === "https:" ? "https" : "http";
  const part = u.host + u.pathname + u.search + u.hash;
  return `intent://${part}#Intent;scheme=${scheme};package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(
    href,
  )};end`;
}

function isLikelyLatLngQuery(s: string): boolean {
  return /^-?\d+(\.\d+)?[,\s]+-?\d+(\.\d+)?$/.test(
    s.replace(/\([^)]*\)/g, "").trim(),
  );
}

/**
 * iOS: build a `comgooglemaps://` URL so the Google Maps app opens (not Safari/Chrome first).
 * Returns `null` if we cannot derive a useful destination; caller falls back to InApp “external” browser.
 */
function buildIOSComGoogleMapsUrl(href: string): string | null {
  const t = href.trim();
  const low = t.toLowerCase();
  if (low.startsWith("geo:")) {
    const m = t.match(/geo:([^?]+)\??/i);
    if (m?.[1]) {
      return `comgooglemaps://?q=${encodeURIComponent(m[1].trim())}`;
    }
  }
  if (low.startsWith("maps:") && t.includes("?")) {
    return `comgooglemaps://?${t.slice(t.indexOf("?") + 1)}`;
  }
  if (!/^https?:\/\//i.test(t)) return null;

  try {
    const u = new URL(t);
    const sp = u.searchParams;
    const q = sp.get("q");
    if (q) {
      const clean = q.replace(/\s*\([^)]*\)\s*/g, "").trim();
      if (isLikelyLatLngQuery(clean)) {
        const pair = clean.split(/[,\s]+/).filter(Boolean);
        if (pair.length >= 2) {
          return `comgooglemaps://?center=${pair[0]},${pair[1]}&zoom=16`;
        }
      }
      return `comgooglemaps://?q=${encodeURIComponent(q)}`;
    }
    const daddr = sp.get("daddr");
    if (daddr) {
      return `comgooglemaps://?daddr=${encodeURIComponent(
        daddr,
      )}&directionsmode=driving`;
    }
    const ll = sp.get("ll");
    if (ll) {
      return `comgooglemaps://?center=${encodeURIComponent(ll)}&zoom=16`;
    }
    const at = t.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)\b/);
    if (at) {
      return `comgooglemaps://?center=${at[1]},${at[2]}&zoom=16`;
    }
    const m3d = t.match(/!3d(-?\d+\.?\d*)/);
    const m4d = t.match(/!4d(-?\d+\.?\d*)/);
    if (m3d && m4d) {
      return `comgooglemaps://?center=${m3d[1]},${m4d[1]}&zoom=16`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @deprecated kept for JSDoc search — opens map links.
 * - Native + Google: Android intent → Maps app; iOS `comgooglemaps://` when derivable; else InApp “external” browser.
 * - Native + Apple map web: unchanged (external browser / system).
 * - Web: `window.open` to `https` maps links.
 * Non-map-looking URLs: {@link openExternalUrl}.
 */
export async function openMapsLocationUrl(raw: string): Promise<void> {
  const resolved = resolveStoredMapsHref(raw);
  const trimmed = resolved.trim();
  if (!trimmed) return;

  if (!isProbablyMapsLocationUrl(trimmed)) {
    await openExternalUrl(trimmed);
    return;
  }

  if (isNativeApp() && isOpenInGoogleMapsAppCandidate(trimmed)) {
    if (isAndroid()) {
      try {
        const intent = buildAndroidOpenGoogleMapsAppIntent(trimmed);
        window.location.assign(intent);
        return;
      } catch (e) {
        console.error("[openMapsLocationUrl] Android intent", e);
      }
    } else if (isIOS()) {
      const gUrl = buildIOSComGoogleMapsUrl(trimmed);
      if (gUrl) {
        try {
          window.location.assign(gUrl);
          return;
        } catch (e) {
          console.error("[openMapsLocationUrl] iOS comgooglemaps", e);
        }
      }
    }
    try {
      const { InAppBrowser } = await import("@capacitor/inappbrowser");
      await InAppBrowser.openInExternalBrowser({ url: trimmed });
    } catch (e) {
      console.error("[openMapsLocationUrl] fallback", e);
      await openExternalUrl(trimmed);
    }
    return;
  }

  if (isNativeApp()) {
    try {
      const { InAppBrowser } = await import("@capacitor/inappbrowser");
      await InAppBrowser.openInExternalBrowser({ url: trimmed });
    } catch (e) {
      console.error("[openMapsLocationUrl]", e);
      await openExternalUrl(trimmed);
    }
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
