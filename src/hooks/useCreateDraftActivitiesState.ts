import { useEffect, useMemo, useState } from "react";
import { ActivityType } from "../types/post";
import { notifyLocalDraftPersisted } from "../lib/drafts";
import {
  CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
  type CreateFlowPostImageMergedDetail,
} from "../lib/createFlowDraftStorage";

const DRAFT_ACTIVITIES_KEY = "draftActivities";
const EDIT_POST_DATA_KEY = "editPostData";

const SEED_ACTIVITY: ActivityType = {
  title: "Stop 1",
  activityType: "",
  customActivity: "",
  locationDesc: "",
  tags: [],
  location: "",
  locationNotes: "",
  locationUrl: "",
  images: [],
  additionalInfo: [],
};

function cleanImages(arr: unknown): string[] {
  return Array.isArray(arr)
    ? arr
        .map(String)
        .filter(
          (u) => /^https?:\/\//.test(u) || (u.includes("/") && u.includes("."))
        )
    : [];
}

function normalizeActivity(a: any, index: number): ActivityType {
  const tags = Array.isArray(a?.tags) ? a.tags.map(String) : [];
  const title = String(a?.title ?? "").trim();
  return {
    title: title || `Stop ${index + 1}`,
    activityType: String(a?.activityType ?? ""),
    customActivity: String(a?.customActivity ?? ""),
    locationDesc: String(a?.locationDesc ?? ""),
    tags,
    location: String(a?.location ?? ""),
    locationNotes: String(a?.locationNotes ?? ""),
    locationUrl: String(a?.locationUrl ?? ""),
    images: cleanImages(a?.images),
    additionalInfo: Array.isArray(a?.additionalInfo) ? a.additionalInfo : [],
  };
}

function readInitialActivities(isEditMode: boolean): ActivityType[] {
  try {
    if (isEditMode) {
      const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { activities?: unknown[] };
        if (Array.isArray(parsed.activities) && parsed.activities.length > 0) {
          return parsed.activities.map((a, i) => normalizeActivity(a, i));
        }
      }
      return [{ ...SEED_ACTIVITY }];
    }

    const draftRaw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    const parsed = draftRaw ? (JSON.parse(draftRaw) as unknown) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((a, i) => normalizeActivity(a, i));
    }
    return [{ ...SEED_ACTIVITY }];
  } catch {
    return [{ ...SEED_ACTIVITY }];
  }
}

export function useCreateDraftActivitiesState(isEditMode: boolean) {
  const [activities, setActivities] = useState<ActivityType[]>(() =>
    readInitialActivities(isEditMode)
  );

  useEffect(() => {
    const onMerged = (e: Event) => {
      const ce = e as CustomEvent<CreateFlowPostImageMergedDetail>;
      const detail = ce.detail;
      if (!detail || typeof detail.activityIndex !== "number") return;
      const { activityIndex, images } = detail;
      if (!Array.isArray(images)) return;

      setActivities((prev) => {
        if (activityIndex < 0 || activityIndex >= prev.length) return prev;
        return prev.map((a, i) =>
          i === activityIndex ? { ...a, images: [...images] } : a
        );
      });
    };

    window.addEventListener(
      CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
      onMerged as EventListener
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
        onMerged as EventListener
      );
  }, []);

  useEffect(() => {
    try {
      if (isEditMode) {
        const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed.activities = activities;
        localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify(parsed));
        return;
      }
      localStorage.setItem(DRAFT_ACTIVITIES_KEY, JSON.stringify(activities));
      notifyLocalDraftPersisted();
    } catch {
      /* ignore persistence errors */
    }
  }, [activities, isEditMode]);

  const totalPostImages = useMemo(
    () => activities.reduce((n, a) => n + (a.images?.length ?? 0), 0),
    [activities]
  );

  return { activities, setActivities, totalPostImages };
}
