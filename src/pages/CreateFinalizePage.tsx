/**
 * Merged create final step: caption-first editing + preview body shell.
 * Publishes directly via {@link executeCreateFlowPublish}; same success flow as Preview.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { PiWarning } from "react-icons/pi";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";

import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowTopBar from "../components/create/CreateFlowTopBar";
import { useCreateFlowNotices } from "../components/create/CreateFlowNoticeContext";
import CreateFlowKeyboardShell, {
  createFlowMainColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CalendarModal from "../components/CalendarModal";
import {
  FinalizeDateSchedulePanel,
  FinalizeRatePanel,
  FinalizeRsvpPanel,
  FinalizeVisibilityPanel,
} from "../components/create/CreateFinalizeMetaPanels";
import CreateFinalizeMetadataRow from "../components/create/CreateFinalizeMetadataRow";
import CreateFlowPostTagsField from "../components/create/CreateFlowPostTagsField";
import PostDetailBody, {
  Post as DetailPost,
} from "../components/detail/PostDetailBody";
import { useCreatePostMedia } from "../components/create/CreatePostMediaProvider";
import CreateFinalizeHeroImageCta from "../components/create/CreateFinalizeHeroImageCta";
import CreateFinalizeActivitiesCta from "../components/create/CreateFinalizeActivitiesCta";
import CreateFinalizeHeroImageDock from "../components/create/CreateFinalizeHeroImageDock";
import { hasMeaningfulActivityContent } from "../lib/createFlowMeaningfulActivity";
import ActionSheet from "../components/ui/ActionSheet";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import PreviewUploadOverlayPill from "../components/ui/PreviewUploadOverlayPill";
import PostedSuccessModal from "../components/ui/PostedSuccessModal";
import InviteDrawer from "../components/ui/InviteDrawer";
import { Paths, postDetailPath } from "../router/Paths";
import { getPublicShareBaseUrl } from "../lib/publicSiteUrl";
import { shareUrl } from "../lib/shareUrl";
import { supabase } from "../lib/supabaseClient";
import { discardAllDrafts, notifyLocalDraftPersisted } from "../lib/drafts";
import {
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
  RESUME_DRAFT_SEARCH_PARAM,
  RESUME_DRAFT_SEARCH_VALUE,
} from "../lib/draftEntryGate";
import { dispatchCreateFlowLeaveRequest } from "../lib/createFlowLeaveRequest";
import { getViewerAuthUserId } from "../api/services/follows";
import { executeCreateFlowPublish } from "../lib/createFlowPublish";
import { clampCaption, CREATE_FLOW_CAPTION_MAX } from "../lib/createFlowLimits";
import {
  APP_SAFE_BOTTOM_SYNC_EVENT,
  BOTTOM_TAB_PILL_OFFSET_PX,
  resolveSafeAreaBottomLayoutPx,
} from "../lib/appSafeAreaBottom";
import { CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID } from "../lib/createFlowNoticeIds";
import { formatDateSummary } from "../lib/createFlowDateSummary";
import { useCreateDraftActivitiesState } from "../hooks/useCreateDraftActivitiesState";
import { navigateAfterEditPublish } from "../lib/editPostBootstrap";

const GAP_ABOVE_TAB = 16;
const PREVIEW_ACTION_STRIP_HEIGHT_PX = 36;

/** After mount scroll (~120ms), allow smooth scroll to settle before caption entry pulse. */
const FINALIZE_CAPTION_PULSE_START_MS = 550;
const FINALIZE_CAPTION_PULSE_DURATION_MS = 900;
/** Desktop-only auto-focus after pulse + small buffer (avoids keyboard fighting animation on touch). */
const FINALIZE_DESKTOP_CAPTION_FOCUS_MS =
  FINALIZE_CAPTION_PULSE_START_MS + FINALIZE_CAPTION_PULSE_DURATION_MS + 80;

// [LAUNCH] Anonymous posting disabled — coerce to public/friends for controls
type VisibilityCtl = "public" | "friends";

type DraftMeta = {
  caption?: string;
  tags?: string[];
  visibility?: "public" | "friends" | "anonymous";
  rsvpCapacity?: number | null | "";
  rsvpEnabled?: boolean;
  selectedDates?: string[];
  isRecurring?: boolean;
  recurrenceDays?: string[];
  /** Mirrors `posts.rating_enabled`; defaults false until rating UI exists. */
  ratingEnabled?: boolean;
};

type DraftActivity = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  images?: unknown[];
  additionalInfo?: { title: string; value: string }[];
};

type SanitizedDraftActivity = DraftActivity & {
  _idx: number;
  images: string[];
};

function read<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
}

const isHttpUrl = (v: unknown): v is string =>
  typeof v === "string" &&
  (/^https?:\/\//.test(v) || (v.includes("/") && v.includes(".")));

const isCloudinaryUrl = (u: string) => u.includes("res.cloudinary.com");

const cleanImages = (arr: unknown): string[] => {
  const valid = Array.isArray(arr) ? arr.map(String).filter(isHttpUrl) : [];
  const nonCloudinary = valid.filter((u) => !isCloudinaryUrl(u));
  const hadCloudinary = valid.some(isCloudinaryUrl);
  if (hadCloudinary && nonCloudinary.length === 0) {
    console.warn(
      "[CreateFinalizePage] Dropping Cloudinary-only images (would store empty); backfill later",
      { droppedCount: valid.length, first: valid[0]?.substring(0, 80) }
    );
    return [];
  }
  return hadCloudinary ? nonCloudinary : valid;
};

function readInitialCaption(): string {
  try {
    const ed = localStorage.getItem("editPostData");
    if (ed) return clampCaption(JSON.parse(ed).caption ?? "");
    const m = localStorage.getItem("draftMeta");
    if (m) return clampCaption(JSON.parse(m).caption ?? "");
  } catch {
    /* ignore */
  }
  return "";
}

function coerceVisibility(v: unknown): VisibilityCtl {
  const s = String(v || "public").toLowerCase();
  return s === "friends" ? "friends" : "public";
}

type FinalizePublishWarningKey = "hashtags" | "dates";

type FinalizePublishWarningItem = {
  key: FinalizePublishWarningKey;
  heading: string;
  explanation: string;
};

/** Recommended-item nudges (not blocking); same rules as before this pass. */
function getFinalizePublishWarnings(
  postType: "experience" | "hangout",
  missingHashtags: boolean,
  missingHangoutSchedule: boolean
): FinalizePublishWarningItem[] {
  const out: FinalizePublishWarningItem[] = [];
  if (postType === "experience") {
    if (missingHashtags) {
      out.push({
        key: "hashtags",
        heading: "No hashtags added",
        explanation:
          "Hashtags help people find your post and improve discoverability.",
      });
    }
    return out;
  }
  if (missingHashtags) {
    out.push({
      key: "hashtags",
      heading: "No hashtags added",
      explanation:
        "Hashtags help people find your post and improve discoverability.",
    });
  }
  if (missingHangoutSchedule) {
    out.push({
      key: "dates",
      heading: "No date added",
      explanation:
        "Dates help Hangouts appear at the right time and make them more useful to others.",
    });
  }
  return out;
}

function FinalizePublishWarningBox({
  heading,
  explanation,
}: {
  heading: string;
  explanation: string;
}) {
  return (
    <div className="flex gap-2.5 rounded-[var(--create-radius-panel)] border border-[var(--create-border-subtle)] bg-[color-mix(in_oklab,var(--surface-2)_88%,transparent)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <PiWarning
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/90 dark:text-amber-400/85"
        aria-hidden
      />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[var(--text)]">
          {heading}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text)]/72">
          {explanation}
        </p>
      </div>
    </div>
  );
}

/** Default for new drafts / edit rows without explicit `ratingEnabled`. */
function defaultRatingEnabledForPostType(
  postType: "experience" | "hangout"
): boolean {
  return postType === "experience";
}

function readFinalizeInitialDraft(postType: "experience" | "hangout"): {
  tags: string[];
  visibility: VisibilityCtl;
  selectedDates: Date[];
  isRecurring: boolean;
  recurrenceDays: string[];
  rsvpCapacity: number;
  rsvpEnabled: boolean;
  ratingEnabled: boolean;
} {
  const ed = read<any>("editPostData", null);
  const m = read<DraftMeta>("draftMeta", {});
  if (ed) {
    const t = (ed.type || "experience").toLowerCase();
    const edPostType: "experience" | "hangout" =
      t === "hangout" ? "hangout" : "experience";
    return {
      tags: Array.isArray(ed.tags) ? ed.tags.map(String) : [],
      visibility: coerceVisibility(ed.visibility),
      selectedDates: Array.isArray(ed.selected_dates)
        ? ed.selected_dates.map((iso: string) => new Date(iso))
        : [],
      isRecurring: !!ed.is_recurring,
      recurrenceDays: Array.isArray(ed.recurrence_days)
        ? ed.recurrence_days.map(String)
        : [],
      rsvpCapacity: typeof ed.rsvp_capacity === "number" ? ed.rsvp_capacity : 5,
      rsvpEnabled:
        typeof ed.rsvp_capacity === "number" && ed.rsvp_capacity >= 0,
      ratingEnabled:
        typeof ed.ratingEnabled === "boolean"
          ? ed.ratingEnabled
          : defaultRatingEnabledForPostType(edPostType),
    };
  }
  return {
    tags: m.tags || [],
    visibility: coerceVisibility(m.visibility),
    selectedDates: (m.selectedDates || []).map((iso) => new Date(iso)),
    isRecurring: !!m.isRecurring,
    recurrenceDays: m.recurrenceDays || [],
    rsvpCapacity: typeof m.rsvpCapacity === "number" ? m.rsvpCapacity : 5,
    /** Off unless draft explicitly saved RSVP on (do not infer from capacity alone). */
    rsvpEnabled: m.rsvpEnabled === true,
    ratingEnabled:
      typeof m.ratingEnabled === "boolean"
        ? m.ratingEnabled
        : defaultRatingEnabledForPostType(postType),
  };
}

export default function CreateFinalizePage() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const [q] = useSearchParams();
  const { upsertNotice, removeNotice, notices } = useCreateFlowNotices();
  /** Single final publish modal (optional warning boxes + publish / back). */
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPostedModal, setShowPostedModal] = useState(false);
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  /** Brief caption emphasis after scroll settles (see mount timers below). */
  const [captionEntryPulse, setCaptionEntryPulse] = useState(false);
  /** When true, hero/author/below at full opacity; false = caption-focus dimming. */
  const [fullProminence, setFullProminence] = useState(false);

  const editData = useMemo(() => read<any>("editPostData", null), []);
  const isEditMode = editData !== null;

  useEffect(() => {
    if (!isEditMode) markCreateFlowSessionActive();
  }, [isEditMode]);

  const resumeDraft =
    q.get(RESUME_DRAFT_SEARCH_PARAM) === RESUME_DRAFT_SEARCH_VALUE;

  /** Cold/deep link with `resumeDraft=1`: match Activities page session flag for leave-dialog copy. */
  useEffect(() => {
    if (!isEditMode && resumeDraft) {
      markCreateFlowResumedLocalDraft();
    }
  }, [isEditMode, resumeDraft]);

  const publishActionLabel = isEditMode ? "Republish" : "Publish";

  const postType = isEditMode
    ? ((editData.type || "experience").toLowerCase() as
        | "experience"
        | "hangout")
    : ((q.get("type") || "experience").toLowerCase() as
        | "experience"
        | "hangout");

  const {
    activities: draftActivitiesState,
    setActivities: setDraftActivitiesState,
    totalPostImages,
  } = useCreateDraftActivitiesState(isEditMode);

  const initialDraft = useMemo(
    () => readFinalizeInitialDraft(postType),
    [postType]
  );

  const [caption, setCaption] = useState(() => readInitialCaption());
  const [tags, setTags] = useState<string[]>(() => initialDraft.tags);
  const [visibility, setVisibility] = useState<VisibilityCtl>(
    () => initialDraft.visibility
  );
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    () => initialDraft.selectedDates
  );
  const [isRecurring, setIsRecurring] = useState(
    () => initialDraft.isRecurring
  );
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>(
    () => initialDraft.recurrenceDays
  );
  const [rsvpCapacity, setRsvpCapacity] = useState(
    () => initialDraft.rsvpCapacity
  );
  const [rsvpEnabled, setRsvpEnabled] = useState(
    () => initialDraft.rsvpEnabled
  );
  const [ratingEnabled, setRatingEnabled] = useState(
    () => initialDraft.ratingEnabled
  );
  const [showCal, setShowCal] = useState(false);

  const sanitizedActivities = useMemo((): SanitizedDraftActivity[] => {
    return (draftActivitiesState || []).map((a: DraftActivity, i: number) => ({
      ...a,
      images: cleanImages(a?.images),
      _idx: i,
    }));
  }, [draftActivitiesState]);

  const hasMeaningfulActivities = useMemo(
    () =>
      hasMeaningfulActivityContent(
        sanitizedActivities.map((a) => ({
          title: a.title,
          activityType: a.activityType,
          customActivity: a.customActivity,
          locationDesc: a.locationDesc,
          location: a.location,
          locationNotes: a.locationNotes,
          locationUrl: a.locationUrl,
          tags: a.tags,
          images: Array.isArray(a.images) ? (a.images as string[]) : [],
          additionalInfo: a.additionalInfo,
        }))
      ),
    [sanitizedActivities]
  );

  const dbVisibility = visibility === "friends" ? "friends" : "public";

  const dateSummary = useMemo(
    () => formatDateSummary(selectedDates),
    [selectedDates]
  );

  const hasSchedule = useMemo(
    () => selectedDates.length > 0 || recurrenceDays.length > 0 || isRecurring,
    [selectedDates.length, recurrenceDays.length, isRecurring]
  );

  const missingHashtags = tags.length === 0;
  const missingHangoutSchedule = postType === "hangout" && !hasSchedule;

  const finalizePublishWarnings = useMemo(
    () =>
      getFinalizePublishWarnings(
        postType,
        missingHashtags,
        missingHangoutSchedule
      ),
    [postType, missingHashtags, missingHangoutSchedule]
  );

  const finalizePublishModalMessage = useMemo(
    () => (
      <div className="space-y-3">
        {finalizePublishWarnings.map((w) => (
          <FinalizePublishWarningBox
            key={w.key}
            heading={w.heading}
            explanation={w.explanation}
          />
        ))}
        {finalizePublishWarnings.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-[var(--text)]/72">
            {isEditMode
              ? "Your changes will go live when you republish."
              : "Your post will go live when you publish."}
          </p>
        ) : null}
      </div>
    ),
    [finalizePublishWarnings, isEditMode]
  );

  const toggleDay = (code: string) =>
    setRecurrenceDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );

  const visibilityAbbrev = visibility === "friends" ? "Fr" : "Pu";

  const visibilityPillEnd = (
    <span
      className="create-meta-pill-endcap inline-flex h-4 min-w-[1.1rem] shrink-0 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold tabular-nums leading-none text-[var(--create-meta-pill-endcap-fg)]"
      aria-hidden
    >
      {visibilityAbbrev}
    </span>
  );

  const ratePillEnd = (
    <span className="create-meta-pill-endcap inline-flex h-4 min-w-[1.1rem] shrink-0 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold tabular-nums leading-none text-[var(--create-meta-pill-endcap-fg)]">
      {ratingEnabled ? "On" : "Off"}
    </span>
  );

  const rsvpPillEnd =
    postType === "hangout" ? (
      rsvpEnabled && typeof rsvpCapacity === "number" ? (
        <span className="create-meta-pill-endcap inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold tabular-nums leading-none text-[var(--create-meta-pill-endcap-fg)]">
          {rsvpCapacity}
        </span>
      ) : (
        <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
      )
    ) : (
      <span className="text-[9px] font-medium text-[var(--create-meta-pill-fg)] opacity-45">
        —
      </span>
    );

  const { hasPendingUploads, jobs } = useCreatePostMedia();

  const previewUploadingCount = useMemo(
    () => jobs.filter((j) => j.status === "uploading").length,
    [jobs]
  );

  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id?: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  }>({
    display_name: localStorage.getItem("my_display_name") || undefined,
    username: localStorage.getItem("my_username") || undefined,
    avatar_url: localStorage.getItem("my_avatar_url") || undefined,
  });

  const [viewerAuthUserId, setViewerAuthUserId] = useState<string | null>(null);

  /** Persist caption + metadata (same shape as CreateCategoryPage). */
  useEffect(() => {
    try {
      const selectedIso = selectedDates.map((d) => d.toISOString());
      if (isEditMode) {
        const raw = localStorage.getItem("editPostData");
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.caption = caption;
          parsed.tags = tags;
          parsed.visibility = visibility;
          parsed.rsvp_capacity = rsvpEnabled ? rsvpCapacity : null;
          parsed.selected_dates = selectedIso;
          parsed.is_recurring = isRecurring;
          parsed.recurrence_days = recurrenceDays;
          parsed.ratingEnabled = ratingEnabled;
          localStorage.setItem("editPostData", JSON.stringify(parsed));
        }
      } else {
        const raw = localStorage.getItem("draftMeta");
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          "draftMeta",
          JSON.stringify({
            ...prev,
            caption,
            tags,
            visibility,
            rsvpCapacity,
            rsvpEnabled,
            ratingEnabled,
            selectedDates: selectedIso,
            isRecurring,
            recurrenceDays,
          })
        );
        notifyLocalDraftPersisted();
      }
    } catch {
      /* ignore */
    }
  }, [
    caption,
    tags,
    visibility,
    rsvpCapacity,
    rsvpEnabled,
    ratingEnabled,
    selectedDates,
    isRecurring,
    recurrenceDays,
    isEditMode,
  ]);

  useEffect(() => {
    if (caption.trim().length > 0) {
      removeNotice(CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID);
    }
  }, [caption, removeNotice]);

  useEffect(() => {
    const getCurrentUserProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authId = session?.user?.id ?? null;
      setViewerAuthUserId(authId);

      if (!session?.user) {
        return;
      }

      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(session.user.id);

      if (profile) {
        setCurrentUserProfile({
          id: profile.id,
          display_name: profile.display_name ?? undefined,
          username: profile.username ?? undefined,
          avatar_url: profile.avatar_url ?? undefined,
        });
        if (profile.display_name) {
          localStorage.setItem("my_display_name", profile.display_name);
        }
        if (profile.username) {
          localStorage.setItem("my_username", profile.username);
        }
        if (profile.avatar_url) {
          localStorage.setItem("my_avatar_url", profile.avatar_url);
        }
      }
    };
    getCurrentUserProfile();

    const onUpdated = () => getCurrentUserProfile();
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () => {
      const btH = el ? Math.round(el.getBoundingClientRect().height) : 0;
      const safe = resolveSafeAreaBottomLayoutPx();
      const total =
        BOTTOM_TAB_PILL_OFFSET_PX +
        safe +
        btH +
        GAP_ABOVE_TAB +
        PREVIEW_ACTION_STRIP_HEIGHT_PX;
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

  /** Scroll the caption block (label + field) into view; focus textarea on desktop only. */
  const scrollCaptionIntoView = () => {
    const block = document.getElementById("create-finalize-caption-anchor");
    block?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      if (!window.matchMedia("(pointer: fine)").matches) return;
      const ta = document.getElementById("create-finalize-caption");
      if (ta instanceof HTMLTextAreaElement) {
        ta.focus({ preventScroll: true });
      }
    }, 360);
  };

  /**
   * Land on caption as the focal point. Delayed so it runs after
   * {@link PrimaryPageContainer}'s scroll-to-top on mount (avoids fighting it).
   */
  useEffect(() => {
    const t = window.setTimeout(() => {
      document
        .getElementById("create-finalize-caption-anchor")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setCaptionEntryPulse(true);
    }, FINALIZE_CAPTION_PULSE_START_MS);
    const t2 = window.setTimeout(() => {
      setCaptionEntryPulse(false);
    }, FINALIZE_CAPTION_PULSE_START_MS + FINALIZE_CAPTION_PULSE_DURATION_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const anchor = document.getElementById("create-finalize-caption-anchor");
      if (!anchor?.contains(e.target as Node)) {
        setFullProminence(true);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!window.matchMedia("(pointer: fine)").matches) return;
      const ta = document.getElementById("create-finalize-caption");
      if (ta instanceof HTMLTextAreaElement) {
        ta.focus({ preventScroll: true });
      }
    }, FINALIZE_DESKTOP_CAPTION_FOCUS_MS);
    return () => window.clearTimeout(t);
  }, []);

  const previewPost: DetailPost = {
    id: "draft",
    type: postType === "hangout" ? "hangout" : "experience",
    caption,
    created_at: new Date().toISOString(),
    author_id: viewerAuthUserId ?? "",
    author: {
      id: currentUserProfile.id ?? "",
      display_name: currentUserProfile.display_name ?? "You",
      username: currentUserProfile.username ?? "you",
      avatar_url: currentUserProfile.avatar_url ?? null,
    },
    tags: tags.length ? tags : undefined,
    activities: sanitizedActivities.map((a: DraftActivity, i: number) => ({
      title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
      images: Array.isArray(a.images) ? (a.images as string[]) : [],
      order_idx: i,
      location_name: a.location ?? null,
      location_desc: a.locationDesc ?? null,
      location_url: a.locationUrl || null,
      location_notes: a.locationNotes || null,
      additional_info: a.additionalInfo || null,
      tags: a.tags || null,
    })),
    visibility: dbVisibility,
    is_anonymous: false,
    anonymous_name: null,
    anonymous_avatar: null,
    rsvp_capacity:
      postType === "hangout" && rsvpEnabled && typeof rsvpCapacity === "number"
        ? rsvpCapacity
        : null,
    selected_dates: selectedDates.length
      ? selectedDates.map((d) => d.toISOString())
      : null,
    is_recurring: isRecurring || null,
    recurrence_days: recurrenceDays.length ? recurrenceDays : null,
    rating_enabled: ratingEnabled,
  };

  const showCaptionHighlight = notices.some(
    (n) => n.id === CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID
  );

  /** Opens confirm modal, or runs validation / upload gate first. */
  const requestPublish = () => {
    if (hasPendingUploads) {
      toast.error("Images are still uploading. Please wait before continuing.");
      return;
    }
    if (!caption.trim()) {
      upsertNotice({
        id: CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID,
        variant: "warning",
        message: "Add a caption to continue.",
        onAction: scrollCaptionIntoView,
        actionLabel: "Show",
      });
      scrollCaptionIntoView();
      return;
    }
    setPublishModalOpen(true);
  };

  const handleFinalizePublish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        dispatch(setAuthModal(true));
        toast.error("Please sign in to continue");
        return;
      }

      if (isEditMode && !editData?.postId) {
        toast.error("Missing post to update.");
        return;
      }

      const captionSafe = clampCaption(caption);
      const rsvpForDb =
        postType === "hangout" &&
        rsvpEnabled &&
        typeof rsvpCapacity === "number"
          ? rsvpCapacity
          : null;

      const { post } = await executeCreateFlowPublish({
        postType: postType === "hangout" ? "hangout" : "experience",
        caption: captionSafe,
        tags,
        visibility: dbVisibility === "friends" ? "friends" : "public",
        rsvpCapacity: rsvpForDb,
        selectedDatesIso: selectedDates.map((d) => d.toISOString()),
        isRecurring,
        recurrenceDays,
        activities: sanitizedActivities,
        isEditMode,
        editPostId: isEditMode ? editData.postId : undefined,
        ratingEnabled,
      });

      if (isEditMode && editData?.postId) {
        const returnPath = editData.returnPath || "/u/me";
        const returnState = editData.returnState;
        localStorage.removeItem("draftMeta");
        localStorage.removeItem("draftActivities");
        discardAllDrafts();
        localStorage.removeItem("editPostData");
        setPublishModalOpen(false);
        navigateAfterEditPublish(nav, { returnPath, returnState });
        return;
      }

      setNewPostId(post.id);
      setPublishModalOpen(false);
      setShowPostedModal(true);
    } catch (e) {
      console.error("[CreateFinalizePage] publish failed", e);
      toast.error("Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const goToProfileAfterPost = async () => {
    setShowPostedModal(false);
    try {
      localStorage.removeItem("draftMeta");
      localStorage.removeItem("draftActivities");
      discardAllDrafts();
    } catch {
      /* ignore */
    }
    const userId = await getViewerAuthUserId();
    if (!userId) return nav(Paths.profile);
    return nav(Paths.profileMe);
  };

  const handleLeaveCreateFlow = useCallback(() => {
    dispatchCreateFlowLeaveRequest(() => nav(Paths.home));
  }, [nav]);

  const goToActivities = useCallback(() => {
    nav(`${Paths.createActivities}?type=${postType}`);
  }, [nav, postType]);

  return (
    <PrimaryPageContainer back capacitorNotchScrim>
      <CreateFlowTopBar
        emphasizeWhiteBorder
        leftAction={{
          icon: "close",
          label: "Leave create flow",
          onClick: handleLeaveCreateFlow,
        }}
        rightAction={{
          icon: "check",
          label: publishActionLabel,
          onClick: requestPublish,
        }}
      />
      <CreateFlowKeyboardShell>
        {/* Modal at shell root — same pattern as CreateCategoryPage */}
        <CalendarModal
          show={showCal}
          selectedDates={selectedDates}
          onSelectDates={(ds) => setSelectedDates(ds || [])}
          isRecurring={isRecurring}
          recurrenceDays={recurrenceDays}
          onToggleRecurrenceDay={toggleDay}
          onClose={() => setShowCal(false)}
        />
        {/* Match legacy preview horizontal density: page-content-wide only (no extra px-4). */}
        <div
          className="flex-1 w-full flex flex-col"
          style={createFlowMainColumnStyle}
        >
          <div className="flex-1 w-full page-content-wide min-h-0">
            <PostDetailBody
              post={previewPost}
              isPreview={true}
              composeFinalizeShell
              composeFinalizeCaption={{
                value: caption,
                onChange: (next) => setCaption(clampCaption(next)),
                maxLength: CREATE_FLOW_CAPTION_MAX,
                highlight: showCaptionHighlight,
                entryPulse: captionEntryPulse,
                surroundingDeemphasize: !fullProminence,
                onCaptionFocusChange: (focused) => setFullProminence(!focused),
                belowCaption: (
                  <CreateFlowPostTagsField
                    tags={tags}
                    onTagsChange={setTags}
                    variant="embedded"
                  />
                ),
              }}
              composeFinalizeBelowCaption={
                <CreateFinalizeMetadataRow
                  hasSchedule={hasSchedule}
                  visibilityPillEnd={visibilityPillEnd}
                  rsvpPillEnd={rsvpPillEnd}
                  ratePillEnd={ratePillEnd}
                  rsvpEnabled={postType === "hangout" && rsvpEnabled}
                  rateEnabled={ratingEnabled}
                  datePanel={
                    <FinalizeDateSchedulePanel
                      dateSummary={dateSummary}
                      selectedDates={selectedDates}
                      isRecurring={isRecurring}
                      setIsRecurring={setIsRecurring}
                      recurrenceDays={recurrenceDays}
                      toggleDay={toggleDay}
                      onOpenCalendar={() => setShowCal(true)}
                    />
                  }
                  visibilityPanel={
                    <FinalizeVisibilityPanel
                      visibility={visibility}
                      onVisibilityChange={setVisibility}
                    />
                  }
                  rsvpPanel={
                    <FinalizeRsvpPanel
                      rsvpEnabled={rsvpEnabled}
                      setRsvpEnabled={setRsvpEnabled}
                      rsvpCapacity={rsvpCapacity}
                      setRsvpCapacity={setRsvpCapacity}
                    />
                  }
                  ratePanel={
                    <FinalizeRatePanel
                      ratingEnabled={ratingEnabled}
                      setRatingEnabled={setRatingEnabled}
                    />
                  }
                />
              }
              composeFinalizeStripPreviewMeta
              composeFinalizeShowActivityTimeline={hasMeaningfulActivities}
              composeFinalizeEmptyHeroCta={
                <CreateFinalizeHeroImageCta
                  totalImagesPost={totalPostImages}
                  variant="empty"
                />
              }
              composeFinalizeHeroBottomOverlayCta={
                <CreateFinalizeHeroImageDock
                  activities={draftActivitiesState}
                  setActivities={setDraftActivitiesState}
                  totalImagesPost={totalPostImages}
                />
              }
              composeFinalizeActivitiesCta={
                <CreateFinalizeActivitiesCta
                  hasMeaningfulActivities={hasMeaningfulActivities}
                  stopCount={draftActivitiesState.length}
                  onClick={goToActivities}
                />
              }
              previewHeroOverlay={
                previewUploadingCount > 0 ? (
                  <PreviewUploadOverlayPill
                    uploadingCount={previewUploadingCount}
                  />
                ) : undefined
              }
            />
          </div>
        </div>

        <ActionSheet
          onBack={handleLeaveCreateFlow}
          onPublish={requestPublish}
          publishing={publishing}
          backText="Leave"
          publishText={publishActionLabel}
          stableActions
          enhancedSurface
          lockActionsWhilePendingUploads={hasPendingUploads}
        />

        <ConfirmDialog
          open={publishModalOpen}
          onClose={() => !publishing && setPublishModalOpen(false)}
          onConfirm={() => void handleFinalizePublish()}
          title={isEditMode ? "Republish this post?" : "Publish this post?"}
          message={finalizePublishModalMessage}
          confirmLabel={publishActionLabel}
          cancelLabel="Back"
          confirmVariant="primary"
          isLoading={publishing}
        />

        <PostedSuccessModal
          open={showPostedModal}
          onDismiss={() => void goToProfileAfterPost()}
          onShareClick={async () => {
            try {
              if (!newPostId) return;
              const postUrl = `${getPublicShareBaseUrl()}${postDetailPath(
                postType === "hangout" ? "hangout" : "experience",
                newPostId
              )}`;
              const title = `Check out this ${
                postType === "hangout" ? "hangout" : "experience"
              }`;
              await shareUrl({ title, url: postUrl });
            } catch (error) {
              console.error("Error sharing:", error);
            }
          }}
          onInviteClick={() => setShowInviteDrawer(true)}
        />

        {newPostId ? (
          <InviteDrawer
            isOpen={showInviteDrawer}
            onClose={() => setShowInviteDrawer(false)}
            postId={newPostId}
            postType={postType === "hangout" ? "hangout" : "experience"}
            postCaption={caption.trim() || "Untitled"}
          />
        ) : null}
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
