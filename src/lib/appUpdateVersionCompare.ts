/**
 * Compare dotted version strings (semver-like). Non-numeric segments treated as 0.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersionStrings(a: string, b: string): number {
  const pa = a
    .trim()
    .split(/[.+]/)
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const pb = b
    .trim()
    .split(/[.+]/)
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function isVersionLessThan(current: string, target: string): boolean {
  const t = target?.trim();
  const c = current?.trim();
  if (!t || !c) return false;
  return compareVersionStrings(c, t) < 0;
}
