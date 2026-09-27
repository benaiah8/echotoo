/**
 * Session-only progressive image URL readiness (Pass 2E).
 * Remembers successfully loaded resolved URLs so remounts (Feed → Detail)
 * can skip the blank/pulse phase. Does not store bitmaps.
 */

const MAX_ENTRIES = 320;
const readyByUrl = new Map<string, true>();

function normalizeUrl(url: string): string | null {
  const key = url?.trim();
  if (!key) return null;
  if (
    key.startsWith("blob:") ||
    key.startsWith("capacitor:") ||
    key.startsWith("file:")
  ) {
    return null;
  }
  return key;
}

/** Record that this exact resolved URL finished loading successfully. */
export function rememberProgressiveImageUrlReady(url: string): void {
  const key = normalizeUrl(url);
  if (!key) return;
  if (readyByUrl.has(key)) readyByUrl.delete(key);
  readyByUrl.set(key, true);
  while (readyByUrl.size > MAX_ENTRIES) {
    const oldest = readyByUrl.keys().next().value;
    if (oldest == null) break;
    readyByUrl.delete(oldest);
  }
}

export function isProgressiveImageUrlReady(url: string): boolean {
  const key = normalizeUrl(url);
  if (!key) return false;
  return readyByUrl.has(key);
}

/** Drop readiness (e.g. browser cache eviction / load error). */
export function forgetProgressiveImageUrlReady(url: string): void {
  const key = normalizeUrl(url);
  if (!key) return;
  readyByUrl.delete(key);
}

export function __resetProgressiveImageReadinessCacheForTests(): void {
  readyByUrl.clear();
}

export function __progressiveImageReadinessCacheSizeForTests(): number {
  return readyByUrl.size;
}

export const PROGRESSIVE_IMAGE_READINESS_CACHE_MAX = MAX_ENTRIES;
