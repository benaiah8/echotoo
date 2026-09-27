/**
 * Pure helpers for Mine atmosphere warm-watch gating (Overlay integration tests).
 */

/** Warm watch runs only on authoritative candidate identity change, not photo cycle. */
export function shouldRunMineAtmosphereWarmWatch(args: {
  previousIdentityKey: string | null;
  nextIdentityKey: string | null;
}): boolean {
  const { previousIdentityKey, nextIdentityKey } = args;
  if (!nextIdentityKey) return false;
  return previousIdentityKey !== nextIdentityKey;
}

/** Whether an async warm completion may still apply atmosphere. */
export function canApplyMineAtmosphereFromWarm(args: {
  watchGeneration: number;
  currentWatchGeneration: number;
  reportIdentityKey: string;
  authoritativeIdentityKey: string | null;
}): boolean {
  if (args.watchGeneration !== args.currentWatchGeneration) return false;
  if (args.authoritativeIdentityKey == null) return false;
  return args.reportIdentityKey === args.authoritativeIdentityKey;
}

/**
 * How Overlay should react to a warm promise settlement.
 *
 * - Success + path → apply that path (child report may already have applied; dedupe).
 * - Failure → never clear. Warm alone does not prove the portrait is unusable;
 *   a child readiness report may already have applied, or may still arrive.
 * - No resolvable front path is handled separately (before warm) as genuine empty.
 */
export function resolveMineAtmosphereWarmSettlement(args: {
  warmSucceeded: boolean;
  frontPath: string | null;
}): "apply-path" | "noop" {
  if (!args.warmSucceeded) return "noop";
  if (!args.frontPath) return "noop";
  return "apply-path";
}
