import {
  extractStoredMapsHref,
  isProbablyMapsLocationUrl,
} from "./openMapsLocationUrl";

export const CREATE_FLOW_LOCATION_URL_ERROR =
  "Enter a link starting with http:// or https://";

export function isSafeHttpOrHttpsUrl(href: string): boolean {
  const t = href.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Empty is valid. Non-empty must be http(s) after iframe-src extraction. */
export function normalizeCreateFlowLocationUrl(raw: string): {
  href: string;
  error: string | null;
} {
  const href = extractStoredMapsHref(raw).trim();
  if (!href) return { href: "", error: null };
  if (!isSafeHttpOrHttpsUrl(href)) {
    return { href, error: CREATE_FLOW_LOCATION_URL_ERROR };
  }
  return { href, error: null };
}

export function hasV4VisibleLocation(
  location: string | null | undefined,
  locationUrl: string | null | undefined
): boolean {
  if ((location ?? "").trim()) return true;
  const { href, error } = normalizeCreateFlowLocationUrl(locationUrl ?? "");
  return !error && href.length > 0;
}

/**
 * Complete typed/pasted http(s) URL only.
 * Incomplete values like `https://map` stay ordinary place text (hostname needs a dot).
 */
export function tryRecognizeCompleteSafeHttpUrl(
  raw: string
): string | null {
  const href = extractStoredMapsHref(raw).trim();
  if (!href) return null;
  if (/\s/.test(href)) return null;
  if (!isSafeHttpOrHttpsUrl(href)) return null;
  try {
    const host = new URL(href).hostname;
    if (!host.includes(".")) return null;
    return href;
  } catch {
    return null;
  }
}

/**
 * Pull a complete safe URL out of an otherwise ordinary location string.
 * A URL that is the entire value, or a line of its own, becomes `url`.
 * Surrounding lines stay in `text`. Incomplete strings like `https://map` stay text.
 */
export function splitLocationTextAndCompleteUrl(raw: string): {
  text: string;
  url: string | null;
} {
  const whole = tryRecognizeCompleteSafeHttpUrl(raw);
  if (whole) return { text: "", url: whole };

  const lines = raw.split(/\r?\n/);
  let url: string | null = null;
  const kept: string[] = [];
  for (const line of lines) {
    const recognized = tryRecognizeCompleteSafeHttpUrl(line);
    if (recognized && url === null) {
      url = recognized;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join("\n"), url };
}

export function locationAttachmentLabel(href: string): string {
  return isProbablyMapsLocationUrl(href) ? "Google Maps link" : "Location link";
}

export function createFlowMapsSearchOrRootUrl(placeName: string): string {
  const q = placeName.trim();
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : "https://maps.google.com";
}
