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

/**
 * Parse a native build string (Android versionCode / iOS CFBundleVersion) to a
 * finite non-negative integer. Rejects empty, non-numeric, or fractional values.
 */
export function parseBuildNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** True when both sides parse and current < target. */
export function isBuildLessThan(
  currentBuild: string | null | undefined,
  targetBuild: string | null | undefined
): boolean {
  const c = parseBuildNumber(currentBuild);
  const t = parseBuildNumber(targetBuild);
  if (c == null || t == null) return false;
  return c < t;
}

export function isBuildGreaterOrEqual(
  currentBuild: string | null | undefined,
  targetBuild: string | null | undefined
): boolean {
  const c = parseBuildNumber(currentBuild);
  const t = parseBuildNumber(targetBuild);
  if (c == null || t == null) return false;
  return c >= t;
}

/**
 * Whether the install is strictly below a config target.
 *
 * Prefer numeric build when the target build is populated AND the install
 * build is parseable. If the target build is populated but the install build
 * is missing/malformed → not below (fail open — never invent a hard block).
 * If the target build is empty/null → fall back to marketing-version compare.
 */
export function isInstallBelowTarget(args: {
  installedVersion: string | null | undefined;
  installedBuild: string | null | undefined;
  targetVersion: string | null | undefined;
  targetBuild: string | null | undefined;
}): boolean {
  const targetBuild = args.targetBuild?.trim() ?? "";
  if (targetBuild) {
    const installed = parseBuildNumber(args.installedBuild);
    const target = parseBuildNumber(targetBuild);
    if (installed == null || target == null) {
      // Target build set but we cannot compare safely → fail open.
      return false;
    }
    return installed < target;
  }
  const tv = args.targetVersion?.trim() ?? "";
  const iv = args.installedVersion?.trim() ?? "";
  if (!tv || !iv) return false;
  return isVersionLessThan(iv, tv);
}
