/**
 * Remap carousel active index by stable media key after membership/order change (PV3.7).
 */

export function remapPublishedMediaActiveIndex(options: {
  previousKey: string | null | undefined;
  previousIndex: number;
  nextKeys: readonly string[];
}): number {
  const { previousKey, previousIndex, nextKeys } = options;
  if (nextKeys.length === 0) return 0;
  if (previousKey) {
    const found = nextKeys.indexOf(previousKey);
    if (found >= 0) return found;
  }
  return Math.max(0, Math.min(previousIndex, nextKeys.length - 1));
}
