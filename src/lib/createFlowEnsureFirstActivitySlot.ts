/**
 * Ensures localStorage has at least one activity row so post image uploads can merge into
 * index 0 ({@link syncActivityPostImagesInDraftStorage}). Matches the Activities page seed shape.
 */
import { EDIT_POST_DATA_KEY } from "./editPostBootstrap";
import { notifyLocalDraftPersisted } from "./drafts";

const DRAFT_ACTIVITIES_KEY = "draftActivities";

const SEED_ACTIVITY = {
  title: "Stop 1",
  activityType: "",
  customActivity: "",
  locationDesc: "",
  tags: [] as string[],
  location: "",
  locationNotes: "",
  locationUrl: "",
  images: [] as string[],
  additionalInfo: [] as { title: string; value: string }[],
};

/**
 * If draft or edit activities is empty, writes a single seeded stop. No-op when a slot exists.
 */
export function ensureFirstActivitySlotForPostImages(): void {
  try {
    const editRaw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (editRaw) {
      const parsed = JSON.parse(editRaw) as {
        activities?: unknown[];
        [key: string]: unknown;
      };
      if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) {
        parsed.activities = [{ ...SEED_ACTIVITY }];
        localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify(parsed));
      }
      return;
    }

    const draftRaw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    const activities: unknown[] = draftRaw ? JSON.parse(draftRaw) : [];
    if (!Array.isArray(activities) || activities.length === 0) {
      localStorage.setItem(
        DRAFT_ACTIVITIES_KEY,
        JSON.stringify([{ ...SEED_ACTIVITY }])
      );
      notifyLocalDraftPersisted();
    }
  } catch {
    /* ignore */
  }
}
