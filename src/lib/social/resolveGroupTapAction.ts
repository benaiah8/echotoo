/**
 * Group tap resolver (Feed / Detail / compact).
 *
 * 1. Owns ACTIVE Group Up for source → manage (even if discoverable count = 0)
 * 2. Else discoverable_group_count > 0 → source overlay
 * 3. Else → create
 */

export type GroupTapAction = "manage" | "overlay" | "create";

export function resolveGroupTapAction(input: {
  ownsActiveGroup: boolean;
  discoverableCount: number;
}): GroupTapAction {
  if (input.ownsActiveGroup) return "manage";
  if (input.discoverableCount > 0) return "overlay";
  return "create";
}
