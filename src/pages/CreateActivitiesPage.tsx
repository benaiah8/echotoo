import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowMainColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CreateFlowTopBar from "../components/create/CreateFlowTopBar";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../components/ui/FrostedCenterModal";
import { getConfirmDialogButtonClass } from "../components/ui/ConfirmDialog";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";
import CreateActivityDetailSection from "../sections/create/CreateActivityDetailSection";
import { Paths } from "../router/Paths";
import { PiArrowRight } from "react-icons/pi";
import {
  APP_SAFE_BOTTOM_SYNC_EVENT,
  BOTTOM_TAB_PILL_OFFSET_PX,
  resolveSafeAreaBottomLayoutPx,
} from "../lib/appSafeAreaBottom";
import { ActivityType } from "../types/post";
import {
  hasAnyDraftData,
  markDraftDirty,
  notifyLocalDraftPersisted,
  runCreateEntryDraftCleanup,
} from "../lib/drafts";
import {
  CREATE_FLOW_SESSION_KEY,
  CREATE_FLOW_SESSION_VALUE,
  RESUME_DRAFT_SEARCH_PARAM,
  RESUME_DRAFT_SEARCH_VALUE,
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
} from "../lib/draftEntryGate";
import { CREATE_FLOW_POST_IMAGE_MERGED_EVENT } from "../lib/createFlowDraftStorage";
import type { CreateFlowPostImageMergedDetail } from "../lib/createFlowDraftStorage";
import { CREATE_FLOW_LIMITS } from "../lib/createFlowLimits";

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
  const [draftExpiredOnEntry] = useState(() =>
    typeof window !== "undefined" ? runCreateEntryDraftCleanup() : false
  );

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postType = searchParams.get("type") || "experience";

  const resumeDraft =
    searchParams.get(RESUME_DRAFT_SEARCH_PARAM) === RESUME_DRAFT_SEARCH_VALUE;

  const suppressInitialDraftPersist = (() => {
    try {
      if (typeof window === "undefined") return false;
      if (localStorage.getItem("editPostData")) return false;
      if (resumeDraft) return false;
      if (
        sessionStorage.getItem(CREATE_FLOW_SESSION_KEY) ===
        CREATE_FLOW_SESSION_VALUE
      ) {
        return false;
      }
      return hasAnyDraftData();
    } catch {
      return false;
    }
  })();

  // load once — edit wins; never auto-resume local create drafts
  const [activities, setActivities] = useState<ActivityType[]>(() => {
    try {
      const editData = localStorage.getItem("editPostData");
      if (editData) {
        const parsed = JSON.parse(editData);
        if (parsed.activities && Array.isArray(parsed.activities)) {
          return parsed.activities.map(normalizeActivity);
        }
      }

      const sp = new URLSearchParams(window.location.search);
      const resume =
        sp.get(RESUME_DRAFT_SEARCH_PARAM) === RESUME_DRAFT_SEARCH_VALUE;
      const inFlow =
        sessionStorage.getItem(CREATE_FLOW_SESSION_KEY) ===
        CREATE_FLOW_SESSION_VALUE;

      if (resume || inFlow) {
        const raw = localStorage.getItem("draftActivities");
        const data = raw ? JSON.parse(raw) : [SEED];
        return (Array.isArray(data) ? data : [SEED]).map(normalizeActivity);
      }

      return [SEED].map(normalizeActivity);
    } catch {
      return [SEED];
    }
  });

  const [activityIndex, setActivityIndex] = useState(0);
  const [error, setError] = useState("");
  const [activitiesInfoOpen, setActivitiesInfoOpen] = useState(false);
  const [isEditMode] = useState(() => {
    return localStorage.getItem("editPostData") !== null;
  });

  /** Cold entry with existing local draft: avoid overwriting LS until the user edits. */
  const initialActivitiesJsonRef = useRef<string | null>(null);
  if (initialActivitiesJsonRef.current === null) {
    initialActivitiesJsonRef.current = JSON.stringify(activities);
  }

  useEffect(() => {
    if (draftExpiredOnEntry) {
      toast("Draft expired; starting fresh.", { duration: 2500 });
    }
  }, [draftExpiredOnEntry]);

  useEffect(() => {
    if (!isEditMode) markCreateFlowSessionActive();
  }, [isEditMode]);

  /**
   * Reserve bottom inset for the bottom tab + home indicator only (no fixed step strip —
   * “Continue to caption” lives in normal document flow).
   */
  useEffect(() => {
    const GAP_ABOVE_TAB = 16;
    const SCROLL_END_COMFORT = 28;
    const el = document.getElementById("bottom-tab");
    const measure = () => {
      const btH = el ? Math.round(el.getBoundingClientRect().height) : 0;
      const safe = resolveSafeAreaBottomLayoutPx();
      const total =
        BOTTOM_TAB_PILL_OFFSET_PX +
        safe +
        btH +
        GAP_ABOVE_TAB +
        SCROLL_END_COMFORT;
      document.documentElement.style.setProperty(
        "--create-actions-total-bottom",
        `${total}px`
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, measure);
    const mo = el ? new MutationObserver(measure) : null;
    if (el && mo)
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    el?.addEventListener("transitionend", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, measure);
      mo?.disconnect();
      el?.removeEventListener("transitionend", measure);
    };
  }, []);

  /** Deep link / refresh with `resumeDraft=1`: same session semantics as chooser “Continue draft”. */
  useEffect(() => {
    if (!isEditMode && resumeDraft) {
      markCreateFlowResumedLocalDraft();
    }
  }, [isEditMode, resumeDraft]);

  // Mark draft dirty in create flow only (not edit)
  useEffect(() => {
    if (!isEditMode) markDraftDirty();
  }, [isEditMode]);

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
      if (
        suppressInitialDraftPersist &&
        JSON.stringify(activities) === initialActivitiesJsonRef.current
      ) {
        return;
      }
      localStorage.setItem("draftActivities", JSON.stringify(activities));
      notifyLocalDraftPersisted();
    }
  }, [activities, isEditMode, suppressInitialDraftPersist]);

  const handleNext = useCallback(() => {
    setError("");
    navigate(`${Paths.createFinalize}?type=${postType}`);
  }, [navigate, postType]);

  const handleBackToCreatePost = useCallback(() => {
    navigate(`${Paths.createFinalize}?type=${postType}`);
  }, [navigate, postType]);

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
          icon: "arrow-left",
          label: "Back to Create post",
          onClick: handleBackToCreatePost,
        }}
        rightAction={{
          icon: "info",
          label: "How Activities and stops work",
          onClick: () => setActivitiesInfoOpen(true),
        }}
      />
      <FrostedCenterModal
        open={activitiesInfoOpen}
        onBackdropClick={() => setActivitiesInfoOpen(false)}
        aria-labelledby="activities-info-title"
      >
        <div
          className={frostedModalPanelClassName}
          style={frostedModalPanelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="activities-info-title"
            className="text-sm font-semibold text-[var(--text)]"
          >
            How to use Activities ✨
          </h2>
          <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-[var(--text)]/80">
            <p>
              Add stops, places, or little steps to help tell the story of your
              plan 🗺️📍
            </p>
            <p>
              You can keep it quick and simple, or add photos, links, locations,
              and extra notes 📸🔗📝
            </p>
            <p>
              Use it to make your post easier to follow, save, and come back to
              later 💛
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={getConfirmDialogButtonClass("primary", "intrinsic")}
              onClick={() => setActivitiesInfoOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      </FrostedCenterModal>
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

          <div className="mt-10 w-full shrink-0 pb-1">
            <button
              type="button"
              onClick={handleNext}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full border border-[var(--brand)] bg-[var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-[var(--brand-ink)] shadow-sm transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.99] sm:min-h-[52px] sm:py-3 sm:text-[14px]"
            >
              <span>Continue to caption</span>
              <PiArrowRight
                className="h-[1.1rem] w-[1.1rem] shrink-0"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
