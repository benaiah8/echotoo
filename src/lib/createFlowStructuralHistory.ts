/**
 * Session-only composer history helpers for Create Finalize (caption + activities).
 */
import type { ActivityType } from "../types/post";

export const CREATE_FINALIZE_STRUCTURAL_HISTORY_MAX = 20;

export type FinalizeComposerSnapshot = {
  caption: string;
  activities: ActivityType[];
};

export function cloneActivities(activities: readonly ActivityType[]): ActivityType[] {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(activities) as ActivityType[];
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(activities)) as ActivityType[];
}

export function cloneComposerSnapshot(
  snapshot: FinalizeComposerSnapshot
): FinalizeComposerSnapshot {
  return {
    caption: snapshot.caption,
    activities: cloneActivities(snapshot.activities),
  };
}

export function activitiesSnapshotsEqual(
  a: readonly ActivityType[],
  b: readonly ActivityType[]
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function composerSnapshotsEqual(
  a: FinalizeComposerSnapshot,
  b: FinalizeComposerSnapshot
): boolean {
  return a.caption === b.caption && activitiesSnapshotsEqual(a.activities, b.activities);
}

/** Push snapshot onto stack; skip if identical to latest entry; cap length. */
export function pushComposerSnapshot(
  stack: readonly FinalizeComposerSnapshot[],
  snapshot: FinalizeComposerSnapshot
): FinalizeComposerSnapshot[] {
  const clone = cloneComposerSnapshot(snapshot);
  const last = stack[stack.length - 1];
  if (last && composerSnapshotsEqual(last, clone)) {
    return [...stack];
  }
  const next = [...stack, clone];
  if (next.length <= CREATE_FINALIZE_STRUCTURAL_HISTORY_MAX) {
    return next;
  }
  return next.slice(next.length - CREATE_FINALIZE_STRUCTURAL_HISTORY_MAX);
}
