/**
 * Conservative URL detection for V4 Section body text (plain textarea).
 * Shared safe http(s) tokenization lives in {@link safeHttpUrlText}.
 */
import {
  extractSafeHttpUrlsFromText,
  normalizeSafeHttpUrl,
  safeHttpUrlDisplayHost,
} from "./safeHttpUrlText";

export const V4_SECTION_URL_MAX = 3;

/** Normalize a matched token to a safe https URL, or null if invalid. */
export function normalizeSectionBodyUrl(raw: string): string | null {
  return normalizeSafeHttpUrl(raw);
}

export function sectionUrlDisplayLabel(href: string): string {
  return safeHttpUrlDisplayHost(href);
}

/**
 * Extract up to `max` unique safe URLs from Section body, first-seen order.
 */
export function extractSectionBodyUrls(
  text: string,
  max = V4_SECTION_URL_MAX,
): Array<{ href: string; label: string }> {
  return extractSafeHttpUrlsFromText(text, max);
}
