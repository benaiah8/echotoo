/**
 * Session-only aspect-ratio memory for ProgressiveImage layout="natural" (PV3.7).
 * Avoids fake 1:1 CLS on remount when ratio was already observed.
 */

const MAX_ENTRIES = 240;
const aspectByIdentity = new Map<string, number>();

function normalizeIdentity(identity: string): string | null {
  const key = identity?.trim();
  if (!key) return null;
  // Do not persist blob:/capacitor: session previews across long-lived keys.
  if (
    key.startsWith("blob:") ||
    key.startsWith("capacitor:") ||
    key.startsWith("file:")
  ) {
    return null;
  }
  return key;
}

export function rememberPublishedImageAspectRatio(
  identity: string,
  width: number,
  height: number,
): void {
  const key = normalizeIdentity(identity);
  if (!key) return;
  if (
    !(typeof width === "number") ||
    !(typeof height === "number") ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 32 ||
    height < 32
  ) {
    return;
  }
  const ratio = width / height;
  if (!(ratio > 0) || !Number.isFinite(ratio)) return;
  if (aspectByIdentity.has(key)) aspectByIdentity.delete(key);
  aspectByIdentity.set(key, ratio);
  while (aspectByIdentity.size > MAX_ENTRIES) {
    const oldest = aspectByIdentity.keys().next().value;
    if (oldest == null) break;
    aspectByIdentity.delete(oldest);
  }
}

export function getPublishedImageAspectRatio(
  identity: string,
): number | null {
  const key = normalizeIdentity(identity);
  if (!key) return null;
  const ratio = aspectByIdentity.get(key);
  return typeof ratio === "number" && ratio > 0 && Number.isFinite(ratio)
    ? ratio
    : null;
}

export function __resetPublishedImageAspectRatioCacheForTests(): void {
  aspectByIdentity.clear();
}
