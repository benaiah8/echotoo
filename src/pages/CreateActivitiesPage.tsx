import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowMainColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CreateFlowTopBar from "../components/create/CreateFlowTopBar";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";
import CreateActivityDetailSection from "../sections/create/CreateActivityDetailSection";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";
import { ActivityType } from "../types/post";
import { markDraftDirty } from "../lib/drafts";
import { CREATE_FLOW_POST_IMAGE_MERGED_EVENT } from "../lib/createFlowDraftStorage";
import type { CreateFlowPostImageMergedDetail } from "../lib/createFlowDraftStorage";
import { CREATE_FLOW_LIMITS } from "../lib/createFlowLimits";
import { dispatchCreateFlowLeaveRequest } from "../lib/createFlowLeaveRequest";

const SEED: ActivityType = {
  title: "Stop 1",
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
    ? arr
        .map(String)
        .filter(
          (u) => /^https?:\/\//.test(u) || (u.includes("/") && u.includes("."))
        )
    : [];

const normalizeActivity = (a: any) => {
  const tags = Array.isArray(a?.tags) ? a.tags.map(String) : [];
  const activityType = a?.activityType ?? "";

  // If tags is empty but activityType exists, use activityType as the first tag
  const finalTags = tags.length > 0 ? tags : activityType ? [activityType] : [];

  return {
    title: a?.title ?? "",
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

  // Flow: Create → Activities → Finalize (Phase 5A shell) → … → Preview
  const base = `?type=${postType}`;
  const paths = [
    `${Paths.create}${base}`, // step 1 (Create landing)
    `${Paths.createActivities}${base}`, // step 2 (this page)
    `${Paths.createFinalize}${base}`, // step 3 (merged final-step shell)
    `${Paths.preview}${base}`, // step 4 (legacy preview / publish)
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

  // Sync React state when CreatePostMediaProvider merges images into localStorage (same mount)
  useEffect(() => {
    const onMerged = (e: Event) => {
      const ce = e as CustomEvent<CreateFlowPostImageMergedDetail>;
      const detail = ce.detail;
      if (!detail || typeof detail.activityIndex !== "number") return;
      const { activityIndex: idx, images } = detail;
      if (!Array.isArray(images)) return;
      setActivities((prev) => {
        if (idx < 0 || idx >= prev.length) return prev;
        return prev.map((a, i) =>
          i === idx ? { ...a, images: [...images] } : a
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

  const handleNext = useCallback(() => {
    setError("");
    navigate(`${Paths.createFinalize}?type=${postType}`);
  }, [navigate, postType]);

  const handleLeaveCreateFlow = useCallback(() => {
    dispatchCreateFlowLeaveRequest(() => navigate(Paths.home));
  }, [navigate]);

  const addActivity = useCallback(() => {
    setActivities((prev) => {
      if (prev.length >= CREATE_FLOW_LIMITS.activities.maxStopsPerPost) {
        return prev;
      }
      const next = [
        ...prev,
        {
          title: `Stop ${prev.length + 1}`,
          activityType: "",
          customActivity: "",
          locationDesc: "",
          tags: [],
          location: "",
          locationNotes: "",
          locationUrl: "",
          images: [],
        } as ActivityType,
      ];
      setActivityIndex(next.length - 1);
      return next;
    });
  }, []);

  return (
    <PrimaryPageContainer capacitorNotchScrim>
      <CreateFlowTopBar
        emphasizeWhiteBorder
        leftAction={{
          icon: "close",
          label: "Leave create flow",
          onClick: handleLeaveCreateFlow,
        }}
        rightAction={{
          icon: "arrow-right",
          label: "Continue to caption",
          onClick: handleNext,
        }}
      />
      <CreateFlowKeyboardShell>
        <div
          className="flex-1 w-full px-2.5 flex flex-col"
          style={createFlowMainColumnStyle}
        >
          <CreateActivityHeaderSection
            activities={activities}
            activity={activityIndex}
            setActivities={setActivities}
            setActivity={setActivityIndex}
            onAddStop={addActivity}
            canAddStop={
              activities.length < CREATE_FLOW_LIMITS.activities.maxStopsPerPost
            }
          />

          <CreateActivityDetailSection
            activities={activities}
            activity={activityIndex}
            activityIndex={activityIndex}
            setActivities={setActivities}
          />

          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

          <div className="min-h-0 flex-1" />
          <CreateTabsSection
            step={isEditMode ? 1 : 2}
            paths={paths}
            onNext={handleNext}
            isEditMode={isEditMode}
            forwardOnly
            nextLabel="Continue to caption"
            stableOnScroll
            emphasizeNext
          />
        </div>
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
