/**
 * Targeted read-modify-write for post image paths in create/edit localStorage drafts.
 * Preserves non-image fields; keeps `activities[i].images` as `string[]`.
 */

const DRAFT_ACTIVITIES_KEY = "draftActivities";
const EDIT_POST_DATA_KEY = "editPostData";

/** Dispatched after a successful merge so CreateActivitiesPage can sync React state if mounted. */
export const CREATE_FLOW_POST_IMAGE_MERGED_EVENT = "createFlow:postImageMerged";

export type CreateFlowPostImageMergedDetail = {
  activityIndex: number;
  /** Full `images` array for that activity after merge (matches localStorage). */
  images: string[];
};

/** Ordered dedupe: first occurrence wins. */
function dedupeOrdered(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Sets `activities[activityIndex].images` to `[...uploadedPathsInOrder, ...rest]`
 * where `rest` are prior images not in `uploadedPathsInOrder` (stable order).
 * Matches prior `Array.from(new Set([...uploaded, ...current]))` batch semantics.
 */
export function syncActivityPostImagesInDraftStorage(
  activityIndex: number,
  uploadedPathsInOrder: string[]
): string[] | null {
  if (activityIndex < 0 || !uploadedPathsInOrder.length) return null;

  try {
    const editRaw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (editRaw) {
      const parsed = JSON.parse(editRaw) as {
        activities?: unknown[];
        [key: string]: unknown;
      };
      if (!Array.isArray(parsed.activities)) {
        console.warn(
          "[CreatePostMedia] merge: editPostData missing activities array"
        );
        return null;
      }
      if (activityIndex >= parsed.activities.length) {
        console.warn(
          "[CreatePostMedia] merge: activityIndex out of range (edit)"
        );
        return null;
      }
      const act = parsed.activities[activityIndex] as Record<string, unknown>;
      if (!act || typeof act !== "object") return null;
      const cur = Array.isArray(act.images)
        ? (act.images as unknown[]).map(String)
        : [];
      const rest = cur.filter((p) => !uploadedPathsInOrder.includes(p));
      const next = dedupeOrdered([...uploadedPathsInOrder, ...rest]);
      parsed.activities[activityIndex] = { ...act, images: next };
      localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify(parsed));
      console.log("[CreatePostMedia] synced images in editPostData", {
        activityIndex,
        count: next.length,
      });
      return next;
    }

    const draftRaw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    const activities: unknown[] = draftRaw
      ? (JSON.parse(draftRaw) as unknown[])
      : [];
    if (!Array.isArray(activities)) {
      console.warn("[CreatePostMedia] merge: draftActivities not an array");
      return null;
    }
    if (activityIndex >= activities.length) {
      console.warn(
        "[CreatePostMedia] merge: activityIndex out of range (draft)"
      );
      return null;
    }
    const act = activities[activityIndex] as Record<string, unknown>;
    if (!act || typeof act !== "object") return null;
    const cur = Array.isArray(act.images)
      ? (act.images as unknown[]).map(String)
      : [];
    const rest = cur.filter((p) => !uploadedPathsInOrder.includes(p));
    const next = dedupeOrdered([...uploadedPathsInOrder, ...rest]);
    activities[activityIndex] = { ...act, images: next };
    localStorage.setItem(DRAFT_ACTIVITIES_KEY, JSON.stringify(activities));
    console.log("[CreatePostMedia] synced images in draftActivities", {
      activityIndex,
      count: next.length,
    });
    return next;
  } catch (e) {
    console.error("[CreatePostMedia] merge failed", e);
    return null;
  }
}

/**
 * Back-compat named export for older imports / cached bundles that expect this symbol.
 * Prefer {@link syncActivityPostImagesInDraftStorage} for multi-file batch order.
 */
export function mergePostImagePathIntoDraftStorage(
  activityIndex: number,
  path: string
): string[] | null {
  if (!path) return null;
  return syncActivityPostImagesInDraftStorage(activityIndex, [path]);
}

export function dispatchPostImageMerged(
  detail: CreateFlowPostImageMergedDetail
) {
  window.dispatchEvent(
    new CustomEvent<CreateFlowPostImageMergedDetail>(
      CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
      { detail }
    )
  );
}
