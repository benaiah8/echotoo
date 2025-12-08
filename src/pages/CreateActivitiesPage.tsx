import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";
import CreateActivityDetailSection from "../sections/create/CreateActivityDetailSection";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";
import { ActivityType } from "../types/post";
import { markDraftDirty } from "../lib/drafts"; // ← NEW

const SEED: ActivityType = {
  title: "Activity 1",
  activityType: "",
  customActivity: "",
  locationDesc: "",
  tags: [],
  location: "",
  locationNotes: "",
  locationUrl: "",
  images: [],
};

const cleanImages = (arr: unknown): string[] =>
  Array.isArray(arr)
    ? arr.map(String).filter((u) => /^https?:\/\//.test(u))
    : [];

const normalizeActivity = (a: any) => {
  const tags = Array.isArray(a?.tags) ? a.tags.map(String) : [];
  const activityType = a?.activityType ?? "";

  // If tags is empty but activityType exists, use activityType as the first tag
  const finalTags = tags.length > 0 ? tags : activityType ? [activityType] : [];

  return {
    title: a?.title ?? "Activity",
    activityType: activityType,
    customActivity: a?.customActivity ?? "",
    locationDesc: a?.locationDesc ?? "",
    tags: finalTags,
    location: a?.location ?? "",
    locationNotes: a?.locationNotes ?? "",
    locationUrl: a?.locationUrl ?? "",
    images: cleanImages(a?.images),
    additionalInfo: Array.isArray(a?.additionalInfo) ? a.additionalInfo : [],
  };
};

export default function CreateActivitiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postType = searchParams.get("type") || "experience";

  // Flow: Create → Activities → (Caption+Tags) → Preview
  const base = `?type=${postType}`;
  const paths = [
    `${Paths.create}${base}`, // step 1 (Create landing)
    `${Paths.createActivities}${base}`, // step 2 (this page)
    `${Paths.createCategories}${base}`, // step 3 (merged Caption+Tags page)
    `${Paths.preview}${base}`, // step 4
  ];

  // load once
  const [activities, setActivities] = useState<ActivityType[]>(() => {
    try {
      // Check if we're in edit mode
      const editData = localStorage.getItem("editPostData");
      if (editData) {
        const parsed = JSON.parse(editData);
        if (parsed.activities && Array.isArray(parsed.activities)) {
          return parsed.activities.map(normalizeActivity);
        }
      }

      // Fallback to draft data
      const raw = localStorage.getItem("draftActivities");
      const data = raw ? JSON.parse(raw) : [SEED];
      return (Array.isArray(data) ? data : [SEED]).map(normalizeActivity);
    } catch {
      return [SEED];
    }
  });

  const [activityIndex, setActivityIndex] = useState(0);
  const [error, setError] = useState("");
  const [isEditMode, setIsEditMode] = useState(() => {
    return localStorage.getItem("editPostData") !== null;
  });

  // mark draft dirty as soon as we land here
  useEffect(() => {
    markDraftDirty();
  }, []);

  // persist on every change
  useEffect(() => {
    if (isEditMode) {
      // In edit mode, update the edit data
      const editData = localStorage.getItem("editPostData");
      if (editData) {
        const parsed = JSON.parse(editData);
        parsed.activities = activities;
        localStorage.setItem("editPostData", JSON.stringify(parsed));
      }
    } else {
      // In create mode, use draft data
      localStorage.setItem("draftActivities", JSON.stringify(activities));
    }
  }, [activities, isEditMode]);

  const handleNext = () => {
    setError("");
    navigate(paths[2]);
  };

  const handlePrev = () => {
    // In Create Activities mode, we don't allow going back
    // This prevents navigation to the Create landing page
    return;
  };

  return (
    <PrimaryPageContainer>
      <div
        className="flex-1 w-full px-4 flex flex-col"
        style={{
          // ensures nothing hides under the fixed action bar + BottomTab
          paddingBottom:
            "calc(var(--create-actions-total-bottom, 120px) + 24px)",
        }}
      >
        <CreateActivityHeaderSection
          activities={activities}
          activity={activityIndex}
          setActivities={setActivities}
          setActivity={setActivityIndex}
        />

        <div className="mt-2">
          <CreateActivityDetailSection
            activities={activities}
            activity={activityIndex}
            activityIndex={activityIndex}
            setActivities={setActivities}
          />
        </div>

        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

        <div className="flex-1" />
        <CreateTabsSection
          step={isEditMode ? 1 : 2}
          paths={paths}
          onNext={handleNext}
          isEditMode={isEditMode}
          hidePrev={isEditMode}
        />
      </div>
    </PrimaryPageContainer>
  );
}
