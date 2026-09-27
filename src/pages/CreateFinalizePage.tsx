/**
 * Merged create final step: caption-first editing + preview body shell.
 * Publishes directly via {@link executeCreateFlowPublish}; same success flow as Preview.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { PiWarning, PiXBold } from "react-icons/pi";
import { useDispatch } from "react-redux";
import { useAppSelector } from "../app/hooks";
import { setAuthModal } from "../reducers/modalReducer";

import CreateFinalizeComposerShell from "../components/create/CreateFinalizeComposerShell";
import { CreateFinalizeMediaChromeProvider } from "../components/create/CreateFinalizeMediaChromeContext";
import CreateFlowTopBar from "../components/create/CreateFlowTopBar";
import { useCreateFlowNotices } from "../components/create/CreateFlowNoticeContext";
import CreateFlowKeyboardShell from "../components/create/CreateFlowKeyboardShell";
import { finalizeMetaStackGapClass } from "../lib/createFlowFinalizeMetaSurface";
import { FINALIZE_COMPOSER_CANVAS_COLUMN_CLASS } from "../lib/createFlowChrome";
import { finalizeComposerFooterPadCss } from "../lib/createFlowFinalizeFooterPad";
import CreateFinalizeMetadataRow from "../components/create/CreateFinalizeMetadataRow";
import CreateFinalizeCaptionMetaActions, {
  CreateFinalizeAddSectionTrigger,
} from "../components/create/CreateFinalizeCaptionMetaActions";
import CreateFinalizeLocationSheet from "../components/create/CreateFinalizeLocationSheet";
import CreateFinalizeScheduleSheet from "../components/create/CreateFinalizeScheduleSheet";
import CreateFinalizeSettingsSheet from "../components/create/CreateFinalizeSettingsSheet";
import CreateFinalizeTagsSheet from "../components/create/CreateFinalizeTagsSheet";
import CreateFinalizeCanvasTagsRow from "../components/create/CreateFinalizeCanvasTagsRow";
import CreateFinalizeStructuredMetaBlocks from "../components/create/CreateFinalizeStructuredMetaBlocks";
import {
  CreateFinalizeKeyInfoNotesArea,
  CreateFinalizeKeyInfoRoot,
} from "../components/create/CreateFinalizeKeyInfoBlock";
import {
  CreateFinalizeSectionsEditors,
  type ActiveWritingBlock,
} from "../components/create/CreateFinalizeSectionsBlock";
import PostDetailBody, {
  Post as DetailPost,
} from "../components/detail/PostDetailBody";
import { useCreatePostMedia } from "../components/create/CreatePostMediaProvider";
import CreateFinalizeHeroImageDock from "../components/create/CreateFinalizeHeroImageDock";
import CreateFinalizeHeroMedia from "../components/create/CreateFinalizeHeroMedia";
import CreateFinalizeHeroPaginationDots from "../components/create/CreateFinalizeHeroPaginationDots";
import { clampFinalizeHeroMediaIndex, remapHeroIndexAfterMediaRemove } from "../lib/createFinalizeHeroMedia";
import {
  countCreateFinalizeImages,
  hasCreateFinalizeMedia,
} from "../lib/createFinalizeMediaPresence";
import { resolveFinalizeComposeHeroFrame } from "../lib/createFinalizeVideoHeroFrame";
import { hasActivePostVideo, needsPublishTimeVideoUpload } from "../lib/createPostVideoUpload";
import { hasV4FinalizeLegacyTimeline } from "../lib/createFlowMeaningfulActivity";
import { hasV4VisibleLocation } from "../lib/createFlowLocation";
import { formatScheduleSheetSummaryLine } from "../lib/createFlowDateSummary";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import PreviewUploadOverlayPill from "../components/ui/PreviewUploadOverlayPill";
import { shouldShowFinalizeHeroUploadOverlayPill } from "../lib/createFinalizeUploadOverlay";
import PostedSuccessModal from "../components/ui/PostedSuccessModal";
import InviteDrawer from "../components/ui/InviteDrawer";
import { Paths, postDetailPath } from "../router/Paths";
import { getPublicShareBaseUrl } from "../lib/publicSiteUrl";
import { shareUrl } from "../lib/shareUrl";
import { supabase } from "../lib/supabaseClient";
import {
  discardAllDrafts,
  discardOwnerPublishedEditLocalState,
  ensureDraftPublishPostId,
  notifyLocalDraftPersisted,
  readDraftCreatePostType,
  readDraftPublishPostId,
  type DraftMeta,
} from "../lib/drafts";
import {
  applyCombinedMediaProgress,
  assertPublishImagePayloadHasNoLocalLeak,
  cleanupDraftImagesAfterSuccessfulPublish,
  createCombinedMediaProgressState,
  mapActivityImagesToRemotePaths,
  mapMediaOrderImagesToRemotePaths,
  reconcileDraftImages,
  selectSurvivingDraftImagesForPublish,
  snapshotCreatePublishMedia,
  uploadSurvivingDraftImagesForPublish,
} from "../lib/createDraftImage";
import { readDraftVideoMeta } from "../lib/createDraftVideo";
import {
  reconcileActiveVideoIntoPublishMediaOrder,
  mapDraftMediaOrderToPublished,
} from "../lib/createDraftMediaOrder";
import {
  isCreateFlowResumedLocalDraft,
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
  RESUME_DRAFT_SEARCH_PARAM,
  RESUME_DRAFT_SEARCH_VALUE,
} from "../lib/draftEntryGate";
import {
  buildFreshCreateLeaveBaseline,
  establishFreshCreateLeaveBaseline,
  readFreshCreateLeaveBaseline,
} from "../lib/createFlowFreshLeaveBaseline";
import {
  hasValidSavedStructuredSchedule,
  normalizeCreatePostType,
  publishedOwnerConversionTargetType,
  resolveCreatePostTypeForSession,
  resolvePublishedEditScheduleSaveDecision,
  shouldConvertExperienceToHangoutOnScheduleCommit,
  shouldRequestEventToPlaceOnFinalScheduleRemoval,
  shouldRouteDateChipRemoveToEventToPlace,
  type PublishedTypeConversion,
} from "../lib/createFlowPostType";
import {
  CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT,
  CREATE_FLOW_EVENT_TO_PLACE_CONFIRM_DISMISS_EVENT,
  CREATE_FLOW_FINALIZE_SHEET_DISMISS_EVENT,
  CREATE_FLOW_METADATA_REMOVE_CONFIRM_DISMISS_EVENT,
  CREATE_FLOW_PLACE_TO_EVENT_CONFIRM_DISMISS_EVENT,
  CREATE_FLOW_REQUEST_PUBLISH_EVENT,
  dispatchCreateFlowLeaveRequest,
  setCreateFlowEventToPlaceConfirmOpen,
  setCreateFlowFinalizeSheetOpen,
  setCreateFlowMetadataRemoveConfirmOpen,
  setCreateFlowPlaceToEventConfirmOpen,
} from "../lib/createFlowLeaveRequest";
import { shouldConfirmCreateFlowLeave } from "../lib/createFlowLeaveGuard";
import { CREATE_FLOW_POST_IMAGE_MERGED_EVENT } from "../lib/createFlowDraftStorage";
import { getViewerAuthUserId } from "../api/services/follows";
import { executeCreateFlowPublish } from "../lib/createFlowPublish";
import { logPublishFailureOutcome } from "../lib/createPublishVideoUpload";
import {
  GENERIC_PUBLISH_FAILED_MESSAGE,
  isCanonicalPublishedVideoMediaId,
  isPublishedVideoMediaIdRequiredError,
  isPublishedVideoOrderRequiredError,
  resolvePublishedVideoMediaId,
} from "../lib/resolvePublishedVideoMediaId";
import {
  clampCaption,
  CREATE_FLOW_CAPTION_MAX,
  CREATE_FLOW_LIMITS,
} from "../lib/createFlowLimits";
import { clampString } from "../lib/createFlowLimitUtils";
import { ActivityType } from "../types/post";
import { isUgcTextPolicyError } from "../lib/ugcTextPolicy";
import { CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID } from "../lib/createFlowNoticeIds";
import {
  extractExplicitStartTime,
  parseCreateFlowStartTime,
  type CreateFlowStartTime,
} from "../lib/createFlowStartTime";
import { useCreateDraftActivitiesState } from "../hooks/useCreateDraftActivitiesState";
import { useCreateFinalizeStructuralHistory } from "../hooks/useCreateFinalizeStructuralHistory";
import { useCreatePostMediaPicker } from "../hooks/useCreatePostMediaPicker";
import { blurActiveEditableFirst } from "../lib/blurActiveEditableFirst";
import {
  classifyTextInputType,
  inferTextEditOperationKind,
  textEditGroupKey,
  type TextEditOperationKind,
} from "../lib/createFlowTextEditOperation";
import { navigateAfterEditPublish } from "../lib/editPostBootstrap";
import {
  buildOwnerEditVideoEditPayload,
  deriveOwnerEditVideoOp,
  resolvePublishedMediaIdForEditSave,
} from "../lib/editPublishedMedia";
import type { PublishedVideoReference } from "../lib/editPublishedMedia";
import { navigateToOwnProfileAfterPublish } from "../lib/profilePublishNavigation";
import { CREATE_FLOW_ADVISORY_HIGHLIGHT_MS } from "../lib/createFlowAdvisoryHighlight";
import {
  createFlowPrimaryCtaBusyLabel,
  createFlowPrimaryCtaLabel,
} from "../lib/postTypeLabels";
import { getCachedAvatar } from "../lib/avatarCache";
import {
  extractV4KeyInfoValues,
  mergeV4KeyInfoIntoAdditionalInfo,
  stripV4KeyInfoFromAdditionalInfo,
} from "../lib/createFlowV4KeyInfo";
import {
  V4_SECTION_MAX,
  countV4Sections,
  createEmptyV4SectionActivity,
  findEmptyV4SectionClientId,
  getV4SectionClientId,
  isV4Section,
  removeEmptyV4Sections,
  getAppendV4SectionIndex,
  sanitizeV4SectionBodyForCommit,
  clampV4SectionBody,
} from "../lib/createFlowV4Section";

const FINALIZE_PUBLISH_UGC_INLINE_ALERT_COPY =
  "This post may violate EchoToo\u2019s Community Guidelines. Please revise the wording before publishing.";

type PublishPhase =
  | "idle"
  | "preparing_video"
  | "uploading_media"
  | "uploading_video"
  | "processing_video"
  | "creating_post";

const DRAFT_ACTIVITY_SEED: ActivityType = {
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

/** After mount scroll (~120ms), allow smooth scroll to settle before caption entry pulse. */
const FINALIZE_CAPTION_PULSE_START_MS = 550;
const FINALIZE_CAPTION_PULSE_DURATION_MS = 900;
/** One footer owner: closed safe-area seat vs `--create-keyboard-inset`. */
const FINALIZE_COMPOSER_FOOTER_PAD_CSS = finalizeComposerFooterPadCss();

/** Desktop-only auto-focus after pulse + small buffer (avoids keyboard fighting animation on touch). */
const FINALIZE_DESKTOP_CAPTION_FOCUS_MS =
  FINALIZE_CAPTION_PULSE_START_MS + FINALIZE_CAPTION_PULSE_DURATION_MS + 80;

// [LAUNCH] Anonymous posting disabled — coerce to public/friends for controls
type VisibilityCtl = "public" | "friends";

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
  sectionBody?: string;
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
      { droppedCount: valid.length, first: valid[0]?.substring(0, 80) },
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

type FinalizePublishWarningKey = "hashtags" | "dates" | "location";

type FinalizePublishWarningItem = {
  key: FinalizePublishWarningKey;
  heading: string;
  explanation: string;
};

/** Soft hashtag nudge only; date/location owned by type/schedule (optional location). */
function getFinalizePublishWarnings(
  missingHashtags: boolean,
): FinalizePublishWarningItem[] {
  if (!missingHashtags) return [];
  return [
    {
      key: "hashtags",
      heading: "No hashtags added",
      explanation:
        "Hashtags help people find your post and improve discoverability.",
    },
  ];
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
  postType: "experience" | "hangout",
): boolean {
  return postType === "experience";
}

function hasMeaningfulEventOnlyScheduleState(args: {
  selectedDates: Date[];
  isRecurring: boolean;
  recurrenceDays: string[];
  pendingStartTime: CreateFlowStartTime | null;
  rsvpEnabled: boolean;
}): boolean {
  if (args.selectedDates.length > 0) return true;
  if (args.isRecurring) return true;
  if (args.recurrenceDays.length > 0) return true;
  if (args.pendingStartTime != null) return true;
  if (args.rsvpEnabled) return true;
  return false;
}

function getEventToPlaceConfirmMessage(args: {
  selectedDates: Date[];
  isRecurring: boolean;
  recurrenceDays: string[];
  pendingStartTime: CreateFlowStartTime | null;
  rsvpEnabled: boolean;
}): string {
  const hasDate =
    args.selectedDates.length > 0 || args.pendingStartTime != null;
  const hasRecurrence = args.isRecurring || args.recurrenceDays.length > 0;
  const hasRsvp = args.rsvpEnabled;

  const parts: string[] = [];
  if (hasDate) parts.push("date and time");
  if (hasRecurrence) parts.push("recurrence");
  if (hasRsvp) parts.push("RSVP");

  if (parts.length >= 3) {
    return "Date, time, recurrence, and RSVP settings will be removed.";
  }
  if (parts.length === 2) {
    return `${parts[0][0].toUpperCase()}${parts[0].slice(1)} and ${parts[1]} settings will be removed.`;
  }
  if (parts.length === 1) {
    const label = parts[0];
    return `${label[0].toUpperCase()}${label.slice(1)} settings will be removed.`;
  }
  return "Event-only settings will be removed.";
}

/** Create mode: resume uses stored type; fresh entry prefers explicit URL over stale meta. */
function readInitialCreatePostType(
  urlType: string | null,
  resumeDraft: boolean,
): "experience" | "hangout" {
  return resolveCreatePostTypeForSession({
    urlType,
    resumeDraft,
    storedType: readDraftCreatePostType(),
    isResumedSession: isCreateFlowResumedLocalDraft(),
  });
}

function readFinalizeInitialDraft(postType: "experience" | "hangout"): {
  tags: string[];
  visibility: VisibilityCtl;
  selectedDates: Date[];
  isRecurring: boolean;
  recurrenceDays: string[];
  pendingStartTime: CreateFlowStartTime | null;
  rsvpCapacity: number;
  rsvpEnabled: boolean;
  /** Published edit only: numeric historical capacity, else null. */
  historicalRsvpCapacity: number | null;
  ratingEnabled: boolean;
} {
  const ed = read<any>("editPostData", null);
  const m = read<DraftMeta>("draftMeta", {});
  if (ed) {
    const t = (ed.type || "experience").toLowerCase();
    const edPostType: "experience" | "hangout" =
      t === "hangout" ? "hangout" : "experience";
    const selectedDates = Array.isArray(ed.selected_dates)
      ? ed.selected_dates.map((iso: string) => new Date(iso))
      : [];
    return {
      tags: Array.isArray(ed.tags) ? ed.tags.map(String) : [],
      visibility: coerceVisibility(ed.visibility),
      selectedDates,
      isRecurring: !!ed.is_recurring,
      recurrenceDays: Array.isArray(ed.recurrence_days)
        ? ed.recurrence_days.map(String)
        : [],
      pendingStartTime:
        selectedDates.length > 0
          ? null
          : parseCreateFlowStartTime(ed.pendingStartTime),
      rsvpCapacity: typeof ed.rsvp_capacity === "number" ? ed.rsvp_capacity : 5,
      rsvpEnabled:
        typeof ed.rsvp_capacity === "number" && ed.rsvp_capacity >= 0,
      historicalRsvpCapacity:
        typeof ed.rsvp_capacity === "number" ? ed.rsvp_capacity : null,
      ratingEnabled:
        typeof ed.ratingEnabled === "boolean"
          ? ed.ratingEnabled
          : defaultRatingEnabledForPostType(edPostType),
    };
  }
  const selectedDates = (m.selectedDates || []).map((iso) => new Date(iso));
  return {
    tags: m.tags || [],
    visibility: coerceVisibility(m.visibility),
    selectedDates,
    isRecurring: !!m.isRecurring,
    recurrenceDays: m.recurrenceDays || [],
    pendingStartTime:
      selectedDates.length > 0
        ? null
        : parseCreateFlowStartTime(m.pendingStartTime),
    rsvpCapacity: typeof m.rsvpCapacity === "number" ? m.rsvpCapacity : 5,
    rsvpEnabled: false,
    historicalRsvpCapacity: null,
    ratingEnabled:
      typeof m.ratingEnabled === "boolean"
        ? m.ratingEnabled
        : defaultRatingEnabledForPostType(postType),
  };
}

function readInitialPostAuthor(
  editData: {
    returnState?: { initialPost?: unknown };
  } | null,
): {
  avatar_url?: string | null;
  display_name?: string | null;
} | null {
  const initialPost = editData?.returnState?.initialPost;
  if (!initialPost || typeof initialPost !== "object") return null;
  const author = (initialPost as { author?: unknown }).author;
  if (!author || typeof author !== "object") return null;
  const a = author as {
    avatar_url?: string | null;
    display_name?: string | null;
  };
  return {
    avatar_url: typeof a.avatar_url === "string" ? a.avatar_url : null,
    display_name: typeof a.display_name === "string" ? a.display_name : null,
  };
}

export default function CreateFinalizePage() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const authUserId = useAppSelector((s) => s.auth?.user?.id ?? null);
  const [q] = useSearchParams();
  const { removeNotice } = useCreateFlowNotices();
  /** Single final publish modal (optional warning boxes + publish / back). */
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  /** Temporary field nudges after publish-warning modal Back (keys match {@link getFinalizePublishWarnings}). */
  const [highlightedPublishWarningKeys, setHighlightedPublishWarningKeys] =
    useState<Set<FinalizePublishWarningKey>>(() => new Set());
  const publishWarningHighlightTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  /** UGC policy violation: show inline alert in publish confirm (no top toast). */
  const [publishModalUgcInline, setPublishModalUgcInline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  /** Combined image+video publish progress (0–100); high-water monotonic. */
  const [publishMediaUploadProgress, setPublishMediaUploadProgress] = useState<
    number | null
  >(null);
  const publishInFlightRef = useRef(false);
  const publishImageAbortRef = useRef<AbortController | null>(null);
  const [showPostedModal, setShowPostedModal] = useState(false);
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  /** Brief caption emphasis after scroll settles (see mount timers below). */
  const [captionEntryPulse, setCaptionEntryPulse] = useState(false);
  /**
   * Caption-required visual only (failed Publish). Not the notice banner;
   * cleared on caption focus. Publish still blocked while caption empty.
   */
  const [captionRequiredVisual, setCaptionRequiredVisual] = useState(false);
  const [captionRequiredPulse, setCaptionRequiredPulse] = useState(false);
  const captionRequiredPulseTimerRef = useRef<number | null>(null);
  /** Caption textarea focused — compact empty canvas + focus pulse owner. */
  const [captionFocused, setCaptionFocused] = useState(false);
  const [captionFocusPulse, setCaptionFocusPulse] = useState(false);
  const captionFocusPulseTimerRef = useRef<number | null>(null);
  /** When true, hero/author/below at full opacity; false = caption-focus dimming. */
  const [fullProminence, setFullProminence] = useState(false);
  const [activeWritingBlock, setActiveWritingBlock] =
    useState<ActiveWritingBlock>(null);
  const activeWritingBlockRef = useRef<ActiveWritingBlock>(null);
  activeWritingBlockRef.current = activeWritingBlock;
  const writingBlurTimerRef = useRef<number | null>(null);
  const skipSectionBlurRef = useRef(false);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeKeyInfoEditorRef = useRef<(() => void) | null>(null);
  const [sectionComposeClientId, setSectionComposeClientId] = useState<
    string | null
  >(null);
  const sectionComposeClientIdRef = useRef<string | null>(null);
  sectionComposeClientIdRef.current = sectionComposeClientId;
  const [autoFocusSectionClientId, setAutoFocusSectionClientId] = useState<
    string | null
  >(null);

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

  const [createPostType, setCreatePostType] = useState<
    "experience" | "hangout"
  >(() => readInitialCreatePostType(q.get("type"), resumeDraft));

  const postType = isEditMode
    ? normalizeCreatePostType(editData.type || "experience")
    : createPostType;

  const [placeToEventConfirmOpen, setPlaceToEventConfirmOpen] = useState(false);
  const [eventToPlaceConfirmOpen, setEventToPlaceConfirmOpen] = useState(false);
  /** Shared owner/admin published conversion confirm (Post↔Event). */
  const [publishedTypeConversionKind, setPublishedTypeConversionKind] =
    useState<PublishedTypeConversion | null>(null);
  /** Survives conversion confirm → republish modal → handleFinalizePublish. */
  const publishedTypeConversionIntentRef =
    useRef<PublishedTypeConversion | null>(null);
  const [metadataRemoveConfirm, setMetadataRemoveConfirm] = useState<
    "date" | "location" | null
  >(null);

  const {
    activities: draftActivitiesState,
    setActivities: setDraftActivitiesState,
  } = useCreateDraftActivitiesState(isEditMode);

  const activitiesRef = useRef(draftActivitiesState);
  activitiesRef.current = draftActivitiesState;

  const {
    canUndo: canStructuralUndo,
    canRedo: canStructuralRedo,
    recordBefore: recordStructuralSnapshot,
    undo: undoStructural,
    redo: redoStructural,
    reset: resetStructuralHistory,
  } = useCreateFinalizeStructuralHistory();

  const [finalizeHeroSlideIndex, setFinalizeHeroSlideIndex] = useState(0);

  const initialDraft = useMemo(
    () => readFinalizeInitialDraft(postType),
    [postType],
  );

  const [caption, setCaption] = useState(() => readInitialCaption());
  const captionRef = useRef(caption);
  captionRef.current = caption;

  const activeTypingGroupRef = useRef<string | null>(null);
  const pendingTextEditRef = useRef<{
    fieldId: string;
    operation: TextEditOperationKind;
  } | null>(null);

  const buildComposerSnapshot = useCallback(() => {
    return {
      caption: captionRef.current,
      activities: activitiesRef.current,
    };
  }, []);

  const closeTypingGroup = useCallback(() => {
    activeTypingGroupRef.current = null;
    pendingTextEditRef.current = null;
  }, []);

  const stashTextInputOperation = useCallback(
    (fieldId: string, inputType: string) => {
      const operation = classifyTextInputType(inputType);
      if (operation) {
        pendingTextEditRef.current = { fieldId, operation };
      }
    },
    [],
  );

  const getSectionBodyByClientId = useCallback((sectionClientId: string) => {
    for (const row of activitiesRef.current) {
      if (isV4Section(row) && getV4SectionClientId(row) === sectionClientId) {
        return row.sectionBody ?? "";
      }
    }
    return "";
  }, []);

  const ensureTextEditGroup = useCallback(
    (fieldId: string, prevValue: string, nextValue: string) => {
      const pending = pendingTextEditRef.current;
      if (pending?.fieldId === fieldId && nextValue === prevValue) {
        pendingTextEditRef.current = null;
        return;
      }
      if (nextValue === prevValue) return;

      let operation: TextEditOperationKind;
      if (pending?.fieldId === fieldId) {
        operation = pending.operation;
        pendingTextEditRef.current = null;
      } else {
        operation = inferTextEditOperationKind(prevValue, nextValue);
      }

      const groupKey = textEditGroupKey(fieldId, operation);
      if (activeTypingGroupRef.current !== groupKey) {
        closeTypingGroup();
        recordStructuralSnapshot(buildComposerSnapshot());
        activeTypingGroupRef.current = groupKey;
      }
    },
    [buildComposerSnapshot, closeTypingGroup, recordStructuralSnapshot],
  );

  const recordDiscreteBefore = useCallback(() => {
    closeTypingGroup();
    recordStructuralSnapshot(buildComposerSnapshot());
  }, [buildComposerSnapshot, closeTypingGroup, recordStructuralSnapshot]);

  const applyComposerRestore = useCallback(
    (restored: { caption: string; activities: ActivityType[] }) => {
      closeKeyInfoEditorRef.current?.();
      setCaption(restored.caption);
      setDraftActivitiesState(restored.activities);
      const restoredImageCount = restored.activities.reduce(
        (n, a) => n + (a.images?.length ?? 0),
        0,
      );
      setFinalizeHeroSlideIndex((i) => {
        if (restoredImageCount <= 0) return 0;
        return Math.min(i, restoredImageCount - 1);
      });
      setActiveWritingBlock((prev) => {
        if (prev?.kind !== "section") return prev;
        const exists = restored.activities.some(
          (row) =>
            isV4Section(row) &&
            getV4SectionClientId(row) === prev.sectionClientId,
        );
        if (!exists) {
          queueMicrotask(() => captionTextareaRef.current?.focus());
          return null;
        }
        return prev;
      });
      setSectionComposeClientId((prev) => {
        if (prev == null) return prev;
        const exists = restored.activities.some(
          (row) => isV4Section(row) && getV4SectionClientId(row) === prev,
        );
        return exists ? prev : null;
      });
    },
    [setDraftActivitiesState],
  );

  const handleComposerUndo = useCallback(() => {
    closeTypingGroup();
    closeKeyInfoEditorRef.current?.();
    blurActiveEditableFirst();
    const restored = undoStructural(buildComposerSnapshot());
    if (restored) applyComposerRestore(restored);
  }, [
    applyComposerRestore,
    buildComposerSnapshot,
    closeTypingGroup,
    undoStructural,
  ]);

  const handleComposerRedo = useCallback(() => {
    closeTypingGroup();
    closeKeyInfoEditorRef.current?.();
    blurActiveEditableFirst();
    const restored = redoStructural(buildComposerSnapshot());
    if (restored) applyComposerRestore(restored);
  }, [
    applyComposerRestore,
    buildComposerSnapshot,
    closeTypingGroup,
    redoStructural,
  ]);

  const { hasPendingUploads, jobs, registerUploadBatchHistoryBoundary, isPublishBlockedByMedia, videoJob, uploadVideoForPublish, cancelPublishVideoUpload, cleanupDraftVideoAfterPublish, publishVideoUploadProgress, mediaOrder, localVideoIngestPending, videoPreparing } =
    useCreatePostMedia();

  // LI1D.2: union activities + mediaOrder identities so local DraftImages count
  // even when React stores update on slightly different ticks.
  const effectiveCreateImageCount = useMemo(
    () =>
      countCreateFinalizeImages({
        activities: draftActivitiesState,
        mediaOrder,
      }),
    [draftActivitiesState, mediaOrder],
  );
  const hasCreateMedia = hasCreateFinalizeMedia({
    imageCount: effectiveCreateImageCount,
    hasVideo:
      hasActivePostVideo(videoJob) ||
      localVideoIngestPending ||
      videoPreparing,
  });

  const prevHasVideoRef = useRef(false);
  const prevVideoJobRef = useRef<typeof videoJob>(null);
  const prevMediaOrderRef = useRef(mediaOrder);

  useEffect(() => {
    const hasVideo = hasActivePostVideo(videoJob);
    if (hasVideo && !prevHasVideoRef.current) {
      const videoIndex = mediaOrder.findIndex((item) => item.kind === "video");
      setFinalizeHeroSlideIndex(videoIndex >= 0 ? videoIndex : 0);
    }
    prevHasVideoRef.current = hasVideo;

    const hadVideo = hasActivePostVideo(prevVideoJobRef.current);
    if (hadVideo && !hasVideo) {
      const removedIndex = prevMediaOrderRef.current.findIndex(
        (item) => item.kind === "video",
      );
      setFinalizeHeroSlideIndex((prevIndex) =>
        remapHeroIndexAfterMediaRemove(
          prevIndex,
          removedIndex >= 0 ? removedIndex : prevIndex,
          mediaOrder.length,
        ),
      );
    }
    prevVideoJobRef.current = videoJob;
    prevMediaOrderRef.current = mediaOrder;
  }, [videoJob, mediaOrder]);

  useEffect(() => {
    setFinalizeHeroSlideIndex((i) =>
      clampFinalizeHeroMediaIndex(i, mediaOrder.length),
    );
  }, [mediaOrder.length]);

  useEffect(() => {
    registerUploadBatchHistoryBoundary(recordDiscreteBefore);
    return () => registerUploadBatchHistoryBoundary(null);
  }, [recordDiscreteBefore, registerUploadBatchHistoryBoundary]);

  const handleCaptionBeforeInput = useCallback(
    (inputType: string) => {
      stashTextInputOperation("caption", inputType);
    },
    [stashTextInputOperation],
  );

  const handleCaptionChange = useCallback(
    (next: string) => {
      const clamped = clampCaption(next);
      const prev = captionRef.current;
      ensureTextEditGroup("caption", prev, clamped);
      setCaption(clamped);
    },
    [ensureTextEditGroup],
  );

  const handleSectionBeforeInput = useCallback(
    (sectionClientId: string, inputType: string) => {
      stashTextInputOperation(`section:${sectionClientId}`, inputType);
    },
    [stashTextInputOperation],
  );

  const handleSectionBodyChange = useCallback(
    (sectionClientId: string, draftIndex: number, next: string) => {
      const clamped = clampV4SectionBody(next);
      const prev = getSectionBodyByClientId(sectionClientId);
      ensureTextEditGroup(`section:${sectionClientId}`, prev, clamped);
      setDraftActivitiesState((prevActivities) =>
        prevActivities.map((row, i) =>
          i === draftIndex ? { ...row, sectionBody: clamped } : row,
        ),
      );
    },
    [ensureTextEditGroup, getSectionBodyByClientId, setDraftActivitiesState],
  );

  const [tags, setTags] = useState<string[]>(() => initialDraft.tags);
  const [visibility, setVisibility] = useState<VisibilityCtl>(
    () => initialDraft.visibility,
  );
  const [selectedDates, setSelectedDates] = useState<Date[]>(
    () => initialDraft.selectedDates,
  );
  const [isRecurring, setIsRecurring] = useState(
    () => initialDraft.isRecurring,
  );
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>(
    () => initialDraft.recurrenceDays,
  );
  const [pendingStartTime, setPendingStartTime] =
    useState<CreateFlowStartTime | null>(() => initialDraft.pendingStartTime);
  const [rsvpCapacity] = useState(() => initialDraft.rsvpCapacity);
  const [rsvpEnabled, setRsvpEnabled] = useState(() => initialDraft.rsvpEnabled);
  const [ratingEnabled, setRatingEnabled] = useState(
    () => initialDraft.ratingEnabled,
  );

  /**
   * Fresh leave baseline: entry gate usually establishes it. Cold/deep finalize
   * without a baseline captures initialized defaults once — never on later edits.
   */
  const didEnsureFreshLeaveBaselineRef = useRef(false);
  useLayoutEffect(() => {
    if (didEnsureFreshLeaveBaselineRef.current) return;
    didEnsureFreshLeaveBaselineRef.current = true;
    if (isEditMode) return;
    if (resumeDraft || isCreateFlowResumedLocalDraft()) return;
    if (readFreshCreateLeaveBaseline()) return;
    ensureDraftPublishPostId({ fresh: false });
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId: readDraftPublishPostId(),
        createPostType,
        visibility,
        ratingEnabled,
        rsvpEnabled,
      }),
    );
  }, [
    createPostType,
    isEditMode,
    ratingEnabled,
    resumeDraft,
    rsvpEnabled,
    visibility,
  ]);

  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [tagsSheetOpen, setTagsSheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  /** Star deep-link only — advisory highlight on Settings Ratings section. */
  const [settingsHighlightRatings, setSettingsHighlightRatings] =
    useState(false);
  const settingsRatingsHighlightTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const anyFinalizeSheetOpen =
    scheduleSheetOpen ||
    locationSheetOpen ||
    tagsSheetOpen ||
    settingsSheetOpen;

  const clearSettingsRatingsHighlight = useCallback(() => {
    if (settingsRatingsHighlightTimerRef.current) {
      clearTimeout(settingsRatingsHighlightTimerRef.current);
      settingsRatingsHighlightTimerRef.current = null;
    }
    setSettingsHighlightRatings(false);
  }, []);

  const closeSettingsSheet = useCallback(() => {
    setSettingsSheetOpen(false);
    clearSettingsRatingsHighlight();
  }, [clearSettingsRatingsHighlight]);

  useEffect(() => {
    return () => {
      if (settingsRatingsHighlightTimerRef.current) {
        clearTimeout(settingsRatingsHighlightTimerRef.current);
      }
    };
  }, []);

  const sanitizedActivities = useMemo((): SanitizedDraftActivity[] => {
    return (draftActivitiesState || []).map((a: DraftActivity, i: number) => ({
      ...a,
      images: cleanImages(a?.images),
      _idx: i,
    }));
  }, [draftActivitiesState]);

  const hasLegacyActivityTimeline = useMemo(
    () =>
      hasV4FinalizeLegacyTimeline(
        sanitizedActivities.map((a) => ({
          title: a.title,
          activityType: a.activityType,
          customActivity: a.customActivity,
          tags: a.tags,
          additionalInfo: a.additionalInfo,
          images: Array.isArray(a.images) ? (a.images as string[]) : [],
          location: a.location,
          locationUrl: a.locationUrl,
          locationNotes: a.locationNotes,
          locationDesc: a.locationDesc,
        })),
      ),
    [sanitizedActivities],
  );

  const v4SectionCount = useMemo(
    () => countV4Sections(draftActivitiesState),
    [draftActivitiesState],
  );

  const clearWritingBlurTimer = useCallback(() => {
    if (writingBlurTimerRef.current != null) {
      window.clearTimeout(writingBlurTimerRef.current);
      writingBlurTimerRef.current = null;
    }
  }, []);

  const clearSectionComposeUi = useCallback(() => {
    setSectionComposeClientId(null);
    setAutoFocusSectionClientId(null);
    setActiveWritingBlock((prev) => (prev?.kind === "section" ? null : prev));
  }, []);

  const endSectionCompose = useCallback(() => {
    clearSectionComposeUi();
    setDraftActivitiesState((prev) => {
      const next = removeEmptyV4Sections(prev);
      return next.length === prev.length ? prev : next;
    });
  }, [clearSectionComposeUi, setDraftActivitiesState]);

  const isSectionRowEmpty = useCallback(
    (
      clientId: string,
      activities: readonly ActivityType[] = activitiesRef.current,
    ) => {
      for (const row of activities) {
        if (!isV4Section(row)) continue;
        if (getV4SectionClientId(row) === clientId) {
          return !sanitizeV4SectionBodyForCommit(row.sectionBody ?? "");
        }
      }
      return true;
    },
    [],
  );

  const beginSectionCompose = useCallback((sectionClientId: string) => {
    closeKeyInfoEditorRef.current?.();
    setSectionComposeClientId(sectionClientId);
    setActiveWritingBlock({ kind: "section", sectionClientId });
    setAutoFocusSectionClientId(sectionClientId);
  }, []);

  const toggleSectionCompose = useCallback(() => {
    const composeId = sectionComposeClientIdRef.current;
    if (composeId && isSectionRowEmpty(composeId)) {
      endSectionCompose();
      return;
    }

    const prev = activitiesRef.current;
    const existingEmpty = findEmptyV4SectionClientId(prev);
    if (existingEmpty) {
      beginSectionCompose(existingEmpty);
      return;
    }

    if (countV4Sections(prev) >= V4_SECTION_MAX) return;

    const cleanedForInsert = removeEmptyV4Sections(prev);
    const newSection = createEmptyV4SectionActivity(
      `Stop ${cleanedForInsert.length + 1}`,
    );
    const focusClientId = getV4SectionClientId(newSection);
    if (!focusClientId) return;

    recordDiscreteBefore();
    setDraftActivitiesState((current) => {
      const cleaned = removeEmptyV4Sections(current);
      if (countV4Sections(cleaned) >= V4_SECTION_MAX) return current;
      const insertAt = getAppendV4SectionIndex(cleaned);
      const next = [...cleaned];
      const clampedAt = Math.max(0, Math.min(insertAt, next.length));
      next.splice(clampedAt, 0, newSection as ActivityType);
      return next;
    });
    beginSectionCompose(focusClientId);
  }, [
    beginSectionCompose,
    endSectionCompose,
    isSectionRowEmpty,
    recordDiscreteBefore,
    setDraftActivitiesState,
  ]);

  const handleBeforeDetailOpen = useCallback(() => {
    endSectionCompose();
  }, [endSectionCompose]);

  const clearCaptionRequiredVisual = useCallback(() => {
    setCaptionRequiredVisual(false);
    setCaptionRequiredPulse(false);
    if (captionRequiredPulseTimerRef.current != null) {
      window.clearTimeout(captionRequiredPulseTimerRef.current);
      captionRequiredPulseTimerRef.current = null;
    }
  }, []);

  const clearCaptionFocusPulse = useCallback(() => {
    setCaptionFocusPulse(false);
    if (captionFocusPulseTimerRef.current != null) {
      window.clearTimeout(captionFocusPulseTimerRef.current);
      captionFocusPulseTimerRef.current = null;
    }
  }, []);

  const activateCaptionFocusPulse = useCallback(() => {
    clearCaptionFocusPulse();
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    } catch {
      reduceMotion = false;
    }
    if (reduceMotion) return;
    window.requestAnimationFrame(() => {
      setCaptionFocusPulse(true);
      captionFocusPulseTimerRef.current = window.setTimeout(() => {
        setCaptionFocusPulse(false);
        captionFocusPulseTimerRef.current = null;
      }, 650);
    });
  }, [clearCaptionFocusPulse]);

  const activateCaptionRequiredVisual = useCallback(() => {
    setCaptionRequiredVisual(true);
    setCaptionRequiredPulse(false);
    clearCaptionFocusPulse();
    if (captionRequiredPulseTimerRef.current != null) {
      window.clearTimeout(captionRequiredPulseTimerRef.current);
      captionRequiredPulseTimerRef.current = null;
    }
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    } catch {
      reduceMotion = false;
    }
    if (reduceMotion) return;
    // Restart CSS animation: off → on next frame.
    window.requestAnimationFrame(() => {
      setCaptionRequiredPulse(true);
      captionRequiredPulseTimerRef.current = window.setTimeout(() => {
        setCaptionRequiredPulse(false);
        captionRequiredPulseTimerRef.current = null;
      }, 700);
    });
  }, [clearCaptionFocusPulse]);

  const handleCaptionFocusChange = useCallback(
    (focused: boolean) => {
      setFullProminence(!focused);
      setCaptionFocused(focused);
      if (focused) {
        clearCaptionRequiredVisual();
        clearWritingBlurTimer();
        closeSettingsSheet();
        closeTypingGroup();
        endSectionCompose();
        setActiveWritingBlock({ kind: "caption" });
        // Normal empty focus flash (required visual already cleared; classes are mutually exclusive).
        if (!caption.trim()) {
          activateCaptionFocusPulse();
        }
        return;
      }
      clearCaptionFocusPulse();
      clearWritingBlurTimer();
      closeTypingGroup();
      writingBlurTimerRef.current = window.setTimeout(() => {
        setActiveWritingBlock((prev) =>
          prev?.kind === "caption" ? null : prev,
        );
      }, 80);
    },
    [
      activateCaptionFocusPulse,
      caption,
      clearCaptionFocusPulse,
      clearCaptionRequiredVisual,
      clearWritingBlurTimer,
      closeSettingsSheet,
      closeTypingGroup,
      endSectionCompose,
    ],
  );

  const handleSectionFocus = useCallback(
    (sectionClientId: string) => {
      clearWritingBlurTimer();
      closeTypingGroup();
      setActiveWritingBlock({ kind: "section", sectionClientId });
    },
    [clearWritingBlurTimer, closeTypingGroup],
  );

  const handleSectionBlur = useCallback(
    (sectionClientId: string) => {
      clearWritingBlurTimer();
      closeTypingGroup();
      writingBlurTimerRef.current = window.setTimeout(() => {
        setActiveWritingBlock((prev) =>
          prev?.kind === "section" && prev.sectionClientId === sectionClientId
            ? null
            : prev,
        );
      }, 80);
    },
    [clearWritingBlurTimer, closeTypingGroup],
  );

  const handleSectionRemoved = useCallback((removedClientId: string) => {
    setActiveWritingBlock((prev) => {
      if (prev?.kind !== "section") return prev;
      if (prev.sectionClientId === removedClientId) return null;
      return prev;
    });
    setSectionComposeClientId((prev) =>
      prev === removedClientId ? null : prev,
    );
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (skipSectionBlurRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-v4-section-editor]")) return;
      if (target.closest("[data-create-writing-toolbar]")) return;
      if (target.closest("[data-create-caption-meta-actions]")) return;
      if (target.closest("[data-create-section-add]")) return;
      if (target.closest("#create-finalize-caption")) return;
      if (target.closest("[data-create-key-info-editor]")) return;
      if (target.closest("[data-create-key-info-chips]")) return;
      endSectionCompose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [endSectionCompose]);

  const dismissSectionComposeForMeta = useCallback(() => {
    endSectionCompose();
  }, [endSectionCompose]);

  const openSettingsSheet = useCallback(
    (opts?: { highlightRatings?: boolean }) => {
      dismissSectionComposeForMeta();
      setScheduleSheetOpen(false);
      setLocationSheetOpen(false);
      setTagsSheetOpen(false);
      if (opts?.highlightRatings) {
        if (settingsRatingsHighlightTimerRef.current) {
          clearTimeout(settingsRatingsHighlightTimerRef.current);
        }
        setSettingsHighlightRatings(true);
        settingsRatingsHighlightTimerRef.current = setTimeout(() => {
          setSettingsHighlightRatings(false);
          settingsRatingsHighlightTimerRef.current = null;
        }, CREATE_FLOW_ADVISORY_HIGHLIGHT_MS);
      } else {
        clearSettingsRatingsHighlight();
      }
      setSettingsSheetOpen(true);
    },
    [clearSettingsRatingsHighlight, dismissSectionComposeForMeta],
  );

  const openDateSheetDirect = useCallback(() => {
    dismissSectionComposeForMeta();
    setLocationSheetOpen(false);
    setTagsSheetOpen(false);
    closeSettingsSheet();
    setScheduleSheetOpen(true);
  }, [closeSettingsSheet, dismissSectionComposeForMeta]);

  const requestOpenDateSheet = useCallback(() => {
    // Fresh Create: open working schedule editor while still Post/Place.
    // Post → Event conversion happens only on valid schedule Done.
    openDateSheetDirect();
  }, [openDateSheetDirect]);

  const handlePlaceToEventConfirmClose = useCallback(() => {
    setPlaceToEventConfirmOpen(false);
  }, []);

  const syncCreatePostTypeUrl = useCallback(
    (type: "hangout" | "experience") => {
      const params = new URLSearchParams(q);
      params.set("type", type);
      nav(
        { pathname: Paths.createFinalize, search: params.toString() },
        { replace: true },
      );
    },
    [nav, q],
  );

  const didSyncCreateTypeUrlRef = useRef(false);
  useLayoutEffect(() => {
    if (isEditMode || didSyncCreateTypeUrlRef.current) return;
    didSyncCreateTypeUrlRef.current = true;
    const urlNormalized = normalizeCreatePostType(q.get("type"));
    if (urlNormalized !== createPostType) {
      syncCreatePostTypeUrl(createPostType);
    }
  }, [createPostType, isEditMode, q, syncCreatePostTypeUrl]);

  const persistDraftMetaPatch = useCallback((patch: Partial<DraftMeta>) => {
    try {
      ensureDraftPublishPostId({ fresh: false });
      const raw = localStorage.getItem("draftMeta");
      const prev = raw ? (JSON.parse(raw) as DraftMeta) : {};
      localStorage.setItem("draftMeta", JSON.stringify({ ...prev, ...patch }));
      notifyLocalDraftPersisted();
    } catch {
      /* ignore */
    }
  }, []);

  const applyPlaceToEventConversion = useCallback(() => {
    setCreatePostType("hangout");
    setRatingEnabled(false);
    persistDraftMetaPatch({
      createPostType: "hangout",
      ratingEnabled: false,
    });
    syncCreatePostTypeUrl("hangout");
  }, [persistDraftMetaPatch, syncCreatePostTypeUrl]);

  const applyEventToPlaceConversion = useCallback(() => {
    setCreatePostType("experience");
    setSelectedDates([]);
    setRecurrenceDays([]);
    setIsRecurring(false);
    setPendingStartTime(null);
    setRsvpEnabled(false);
    persistDraftMetaPatch({
      createPostType: "experience",
      selectedDates: [],
      isRecurring: false,
      recurrenceDays: [],
      pendingStartTime: null,
      rsvpEnabled: false,
    });
    syncCreatePostTypeUrl("experience");
  }, [persistDraftMetaPatch, syncCreatePostTypeUrl]);

  const requestEventToPlaceConfirm = useCallback(() => {
    setScheduleSheetOpen(false);
    closeSettingsSheet();
    setMetadataRemoveConfirm(null);
    setEventToPlaceConfirmOpen(true);
  }, [closeSettingsSheet]);

  const handlePlaceToEventConfirm = useCallback(() => {
    setPlaceToEventConfirmOpen(false);
    applyPlaceToEventConversion();
    openDateSheetDirect();
  }, [applyPlaceToEventConversion, openDateSheetDirect]);

  const handleEventToPlaceConfirmClose = useCallback(() => {
    setEventToPlaceConfirmOpen(false);
  }, []);

  const handleEventToPlaceConfirm = useCallback(() => {
    setEventToPlaceConfirmOpen(false);
    applyEventToPlaceConversion();
  }, [applyEventToPlaceConversion]);

  const handleSettingsPostTypeChange = useCallback(
    (next: "hangout" | "experience") => {
      if (isEditMode || next === createPostType) return;

      if (next === "hangout") {
        // Do not convert immediately — open schedule editor; Done commits type.
        openDateSheetDirect();
        return;
      }

      if (
        hasMeaningfulEventOnlyScheduleState({
          selectedDates,
          isRecurring,
          recurrenceDays,
          pendingStartTime,
          rsvpEnabled,
        })
      ) {
        requestEventToPlaceConfirm();
        return;
      }

      applyEventToPlaceConversion();
    },
    [
      applyEventToPlaceConversion,
      createPostType,
      isEditMode,
      isRecurring,
      openDateSheetDirect,
      pendingStartTime,
      recurrenceDays,
      requestEventToPlaceConfirm,
      rsvpEnabled,
      selectedDates,
    ],
  );

  const eventToPlaceConfirmMessage = useMemo(
    () =>
      getEventToPlaceConfirmMessage({
        selectedDates,
        isRecurring,
        recurrenceDays,
        pendingStartTime,
        rsvpEnabled,
      }),
    [
      isRecurring,
      pendingStartTime,
      recurrenceDays,
      rsvpEnabled,
      selectedDates,
    ],
  );

  const handleMetadataRemoveConfirmClose = useCallback(() => {
    setMetadataRemoveConfirm(null);
  }, []);

  const handleConfirmRemoveDate = useCallback(() => {
    setSelectedDates([]);
    setRecurrenceDays([]);
    setIsRecurring(false);
    setPendingStartTime(null);
    setScheduleSheetOpen(false);
    setMetadataRemoveConfirm(null);
  }, []);

  const handleConfirmRemoveLocation = useCallback(() => {
    setDraftActivitiesState((prev) => {
      const base = prev.length > 0 ? [...prev] : [{ ...DRAFT_ACTIVITY_SEED }];
      const first = { ...base[0] };
      first.location = "";
      first.locationUrl = "";
      first.locationDesc = "";
      first.locationNotes = "";
      base[0] = first;
      return base;
    });
    setLocationSheetOpen(false);
    setMetadataRemoveConfirm(null);
  }, [setDraftActivitiesState]);

  const handleMetadataRemoveConfirm = useCallback(() => {
    if (metadataRemoveConfirm === "date") {
      handleConfirmRemoveDate();
    } else if (metadataRemoveConfirm === "location") {
      handleConfirmRemoveLocation();
    }
  }, [
    handleConfirmRemoveDate,
    handleConfirmRemoveLocation,
    metadataRemoveConfirm,
  ]);

  const openLocationEditor = useCallback(() => {
    dismissSectionComposeForMeta();
    setScheduleSheetOpen(false);
    setTagsSheetOpen(false);
    closeSettingsSheet();
    setLocationSheetOpen(true);
  }, [closeSettingsSheet, dismissSectionComposeForMeta]);

  /** Shared Tags sheet open — footer hash pill and canvas hashtag row. */
  const openTagsSheet = useCallback(() => {
    dismissSectionComposeForMeta();
    setScheduleSheetOpen(false);
    setLocationSheetOpen(false);
    closeSettingsSheet();
    setTagsSheetOpen(true);
  }, [closeSettingsSheet, dismissSectionComposeForMeta]);

  /** Confirmation secondary: dismiss confirm, then open existing Date/Location editor. */
  const handleMetadataRemoveEdit = useCallback(() => {
    const kind = metadataRemoveConfirm;
    setMetadataRemoveConfirm(null);
    if (kind === "date") {
      requestOpenDateSheet();
      return;
    }
    if (kind === "location") {
      openLocationEditor();
    }
  }, [metadataRemoveConfirm, openLocationEditor, requestOpenDateSheet]);

  const dismissTopCreateFinalizeOverlay = useCallback(() => {
    setScheduleSheetOpen(false);
    setLocationSheetOpen(false);
    setTagsSheetOpen(false);
    closeSettingsSheet();
  }, [closeSettingsSheet]);

  useEffect(() => {
    setCreateFlowFinalizeSheetOpen(anyFinalizeSheetOpen);
    return () => setCreateFlowFinalizeSheetOpen(false);
  }, [anyFinalizeSheetOpen]);

  useEffect(() => {
    window.addEventListener(
      CREATE_FLOW_FINALIZE_SHEET_DISMISS_EVENT,
      dismissTopCreateFinalizeOverlay,
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_FINALIZE_SHEET_DISMISS_EVENT,
        dismissTopCreateFinalizeOverlay,
      );
  }, [dismissTopCreateFinalizeOverlay]);

  useEffect(() => {
    setCreateFlowPlaceToEventConfirmOpen(placeToEventConfirmOpen);
    return () => setCreateFlowPlaceToEventConfirmOpen(false);
  }, [placeToEventConfirmOpen]);

  useEffect(() => {
    setCreateFlowEventToPlaceConfirmOpen(eventToPlaceConfirmOpen);
    return () => setCreateFlowEventToPlaceConfirmOpen(false);
  }, [eventToPlaceConfirmOpen]);

  useEffect(() => {
    setCreateFlowMetadataRemoveConfirmOpen(metadataRemoveConfirm != null);
    return () => setCreateFlowMetadataRemoveConfirmOpen(false);
  }, [metadataRemoveConfirm]);

  useEffect(() => {
    const onDismiss = () => setPlaceToEventConfirmOpen(false);
    window.addEventListener(
      CREATE_FLOW_PLACE_TO_EVENT_CONFIRM_DISMISS_EVENT,
      onDismiss,
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_PLACE_TO_EVENT_CONFIRM_DISMISS_EVENT,
        onDismiss,
      );
  }, []);

  useEffect(() => {
    const onDismiss = () => setEventToPlaceConfirmOpen(false);
    window.addEventListener(
      CREATE_FLOW_EVENT_TO_PLACE_CONFIRM_DISMISS_EVENT,
      onDismiss,
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_EVENT_TO_PLACE_CONFIRM_DISMISS_EVENT,
        onDismiss,
      );
  }, []);

  useEffect(() => {
    const onDismiss = () => setMetadataRemoveConfirm(null);
    window.addEventListener(
      CREATE_FLOW_METADATA_REMOVE_CONFIRM_DISMISS_EVENT,
      onDismiss,
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_METADATA_REMOVE_CONFIRM_DISMISS_EVENT,
        onDismiss,
      );
  }, []);

  const bottomToolbarHistoryProps = useMemo(
    () => ({
      canUndo: canStructuralUndo && !hasPendingUploads,
      canRedo: canStructuralRedo && !hasPendingUploads,
      onUndo: handleComposerUndo,
      onRedo: handleComposerRedo,
    }),
    [
      canStructuralRedo,
      canStructuralUndo,
      handleComposerRedo,
      handleComposerUndo,
      hasPendingUploads,
    ],
  );

  const finalizePublishUgcClearFingerprint = useMemo(
    () =>
      JSON.stringify({
        caption,
        tags,
        acts: sanitizedActivities.map((a) => ({
          title: a.title,
          activityType: a.activityType,
          customActivity: a.customActivity,
          locationDesc: a.locationDesc,
          location: a.location,
          locationNotes: a.locationNotes,
          locationUrl: a.locationUrl,
          tags: a.tags,
          additionalInfo: a.additionalInfo,
          sectionBody: a.sectionBody,
        })),
      }),
    [caption, tags, sanitizedActivities],
  );

  useEffect(() => {
    setPublishModalUgcInline(false);
  }, [finalizePublishUgcClearFingerprint]);

  const dbVisibility = visibility === "friends" ? "friends" : "public";

  const hasSchedule = useMemo(
    () =>
      hasValidSavedStructuredSchedule({
        selectedDatesLength: selectedDates.length,
        recurrenceDaysLength: recurrenceDays.length,
        isRecurring,
      }),
    [selectedDates.length, recurrenceDays.length, isRecurring],
  );

  /**
   * D1: show/edit structured schedule whenever present in edit mode, even if
   * locked published type is still Post (`experience`). Do not mutate postType.
   */
  const showEditedStructuredSchedule =
    hasSchedule && (postType === "hangout" || isEditMode);

  /** Frozen published schedule baseline for D1 Save guard (survives working-copy autosave). */
  const publishedEditInitialHasStructured = useMemo(() => {
    if (!isEditMode || !editData) return false;
    if (typeof editData.publishedScheduleHasStructured === "boolean") {
      return editData.publishedScheduleHasStructured;
    }
    const selected = Array.isArray(editData.selected_dates)
      ? editData.selected_dates
      : [];
    const days = Array.isArray(editData.recurrence_days)
      ? editData.recurrence_days
      : [];
    return hasValidSavedStructuredSchedule({
      selectedDatesLength: selected.length,
      recurrenceDaysLength: days.length,
      isRecurring: !!editData.is_recurring,
    });
  }, [editData, isEditMode]);

  const handleScheduleCommit = useCallback(
    (next: {
      selectedDates: typeof selectedDates;
      recurrenceDays: typeof recurrenceDays;
      isRecurring: boolean;
      pendingStartTime: typeof pendingStartTime;
    }) => {
      if (
        shouldRequestEventToPlaceOnFinalScheduleRemoval({
          isEditMode,
          createPostType,
          selectedDatesLength: next.selectedDates.length,
          recurrenceDaysLength: next.recurrenceDays.length,
          isRecurring: next.isRecurring,
        })
      ) {
        // Preserve saved Event schedule until conversion is confirmed.
        requestEventToPlaceConfirm();
        return;
      }

      setSelectedDates(next.selectedDates);
      setRecurrenceDays(next.recurrenceDays);
      setIsRecurring(next.isRecurring);
      setPendingStartTime(next.pendingStartTime);
      setScheduleSheetOpen(false);

      if (
        shouldConvertExperienceToHangoutOnScheduleCommit({
          isEditMode,
          createPostType,
          selectedDatesLength: next.selectedDates.length,
          recurrenceDaysLength: next.recurrenceDays.length,
          isRecurring: next.isRecurring,
        })
      ) {
        applyPlaceToEventConversion();
      }
    },
    [applyPlaceToEventConversion, createPostType, isEditMode, requestEventToPlaceConfirm],
  );

  const handleRequestRemoveDate = useCallback(() => {
    if (
      shouldRouteDateChipRemoveToEventToPlace({
        isEditMode,
        createPostType,
      })
    ) {
      requestEventToPlaceConfirm();
      return;
    }
    setMetadataRemoveConfirm("date");
  }, [createPostType, isEditMode, requestEventToPlaceConfirm]);

  const missingHashtags = tags.length === 0;
  const slot0Location = draftActivitiesState[0]?.location ?? "";
  const slot0LocationUrl = draftActivitiesState[0]?.locationUrl ?? "";
  const hasV4Location = hasV4VisibleLocation(slot0Location, slot0LocationUrl);

  const dateCanvasSummary = showEditedStructuredSchedule
    ? formatScheduleSheetSummaryLine({
        selectedDates,
        recurrenceDayCodes: recurrenceDays,
        startTime:
          pendingStartTime ?? extractExplicitStartTime(selectedDates),
      })
    : null;

  /** Matches CreateFinalizeStructuredMetaBlocks render conditions (Date/Location pills only). */
  const hasVisibleDateOrLocation = useMemo(() => {
    const showsDate = showEditedStructuredSchedule && !!dateCanvasSummary;
    const locationName = slot0Location.trim();
    const locationLabel =
      locationName ||
      (hasV4VisibleLocation("", slot0LocationUrl) ? "View location" : "");
    const showsLocation = hasV4Location && !!locationLabel;
    return showsDate || showsLocation;
  }, [
    showEditedStructuredSchedule,
    dateCanvasSummary,
    hasV4Location,
    slot0Location,
    slot0LocationUrl,
  ]);

  const captionMetaActionsProps = useMemo(
    () => ({
      skipSectionBlurRef,
      onBeforeDetailOpen: handleBeforeDetailOpen,
      hasSchedule,
      hasLocation: hasV4Location,
      onDateClick: requestOpenDateSheet,
      dateSheetOpen: scheduleSheetOpen,
      onLocationClick: openLocationEditor,
      locationSheetOpen,
      highlightDatePill: highlightedPublishWarningKeys.has("dates"),
      highlightLocationPill: highlightedPublishWarningKeys.has("location"),
      ratingEnabled,
      onRatingsClick: () => openSettingsSheet({ highlightRatings: true }),
    }),
    [
      handleBeforeDetailOpen,
      hasSchedule,
      hasV4Location,
      highlightedPublishWarningKeys,
      locationSheetOpen,
      openLocationEditor,
      openSettingsSheet,
      ratingEnabled,
      requestOpenDateSheet,
      scheduleSheetOpen,
    ],
  );

  /** Zero former writing-toolbar chrome so canvas/footer do not reserve a ghost gap. */
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--create-finalize-writing-toolbar-height", "0px");
    return () => {
      root.style.setProperty("--create-finalize-writing-toolbar-height", "0px");
    };
  }, []);

  const finalizePublishWarnings = useMemo(
    () => getFinalizePublishWarnings(missingHashtags),
    [missingHashtags],
  );

  const applyPublishWarningHighlightsFromModalBack = useCallback(() => {
    if (finalizePublishWarnings.length === 0) return;
    const keys = new Set(
      finalizePublishWarnings.map((w) => w.key),
    ) as Set<FinalizePublishWarningKey>;
    setHighlightedPublishWarningKeys(keys);
    if (keys.has("hashtags")) {
      closeSettingsSheet();
      setTagsSheetOpen(true);
    }
    if (publishWarningHighlightTimerRef.current) {
      clearTimeout(publishWarningHighlightTimerRef.current);
    }
    publishWarningHighlightTimerRef.current = setTimeout(() => {
      setHighlightedPublishWarningKeys(new Set());
      publishWarningHighlightTimerRef.current = null;
    }, CREATE_FLOW_ADVISORY_HIGHLIGHT_MS);
  }, [closeSettingsSheet, finalizePublishWarnings]);

  const handlePublishModalClose = useCallback(() => {
    if (publishing) return;
    publishedTypeConversionIntentRef.current = null;
    setPublishModalUgcInline(false);
    setPublishModalOpen(false);
    applyPublishWarningHighlightsFromModalBack();
  }, [publishing, applyPublishWarningHighlightsFromModalBack]);

  useEffect(() => {
    return () => {
      if (publishWarningHighlightTimerRef.current) {
        clearTimeout(publishWarningHighlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHighlightedPublishWarningKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      if (!missingHashtags) next.delete("hashtags");
      // Date/location soft warnings removed — clear any stale highlights.
      next.delete("dates");
      next.delete("location");
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [missingHashtags]);

  const publishModalConfirmLabel = useMemo((): ReactNode => {
    if (finalizePublishWarnings.length === 0 && !publishModalUgcInline) {
      return publishActionLabel;
    }
    const lead = isEditMode ? "Republish" : "Publish";
    // Single wrapper: ConfirmDialog buttons are flex; bare text+strong
    // siblings collapse the space between "Publish" and "anyway".
    return (
      <span>
        {lead}{" "}
        <strong className="font-bold">anyway</strong>
      </span>
    );
  }, [
    finalizePublishWarnings.length,
    publishModalUgcInline,
    isEditMode,
    publishActionLabel,
  ]);

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
    [finalizePublishWarnings, isEditMode],
  );

  const commitSlot0Location = useCallback(
    (next: { location: string; locationUrl: string }) => {
      const lim = CREATE_FLOW_LIMITS.activities;
      setDraftActivitiesState((prev) => {
        const base = prev.length > 0 ? [...prev] : [{ ...DRAFT_ACTIVITY_SEED }];
        const first = { ...base[0] };
        first.location = clampString(next.location, lim.placeNameMaxChars);
        first.locationUrl = clampString(
          next.locationUrl,
          lim.googleMapsLinkMaxChars,
        );
        base[0] = first;
        return base;
      });
      setLocationSheetOpen(false);
    },
    [setDraftActivitiesState],
  );

  const keyInfoValues = useMemo(
    () => extractV4KeyInfoValues(draftActivitiesState[0]?.additionalInfo),
    [draftActivitiesState],
  );

  const setKeyInfoValues = useCallback(
    (values: string[]) => {
      const prev = activitiesRef.current;
      const before = extractV4KeyInfoValues(prev[0]?.additionalInfo);
      const unchanged =
        before.length === values.length &&
        before.every((value, index) => value === values[index]);
      if (unchanged) return;

      recordDiscreteBefore();

      setDraftActivitiesState((current) => {
        const base =
          current.length > 0 ? [...current] : [{ ...DRAFT_ACTIVITY_SEED }];
        const first = { ...base[0] };
        first.additionalInfo = mergeV4KeyInfoIntoAdditionalInfo(
          first.additionalInfo,
          values,
        );
        base[0] = first;
        return base;
      });
    },
    [recordDiscreteBefore, setDraftActivitiesState],
  );

  const {
    openPicker: openPostMediaPicker,
    fileInput: postMediaFileInput,
    mediaAcquisitionSheet: postMediaAcquisitionSheet,
  } = useCreatePostMediaPicker({
      totalImagesPost: effectiveCreateImageCount,
      onBeforeOpen: () => {
        closeSettingsSheet();
        dismissSectionComposeForMeta();
      },
    });

  const headerCtaLabel = createFlowPrimaryCtaLabel({
    isEditMode,
    type: postType,
  });
  const headerCtaBusyLabel = useMemo(() => {
    if (publishPhase === "preparing_video") {
      return "Preparing video…";
    }
    if (
      publishPhase === "uploading_media" ||
      publishPhase === "uploading_video"
    ) {
      const pctSource =
        typeof publishMediaUploadProgress === "number"
          ? publishMediaUploadProgress
          : publishVideoUploadProgress;
      const pct =
        typeof pctSource === "number" ? ` · ${Math.round(pctSource)}%` : "";
      return pct ? `Uploading media${pct}` : "Uploading media…";
    }
    if (publishPhase === "processing_video") {
      return "Processing video…";
    }
    if (publishPhase === "creating_post") {
      return "Publishing…";
    }
    return createFlowPrimaryCtaBusyLabel(isEditMode);
  }, [
    isEditMode,
    publishPhase,
    publishMediaUploadProgress,
    publishVideoUploadProgress,
  ]);

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

  const headerCtaAvatar = useMemo(() => {
    const isAdminEdit = isEditMode && editData?.isAdminEdit === true;
    if (isAdminEdit) {
      const authorUserId =
        typeof editData?.authorUserId === "string"
          ? editData.authorUserId
          : null;
      const fromPost = readInitialPostAuthor(editData);
      const fromCache = authorUserId ? getCachedAvatar(authorUserId) : null;
      const url = (fromCache || fromPost?.avatar_url?.trim() || "").trim();
      if (!url) return null;
      return {
        url,
        name: fromPost?.display_name || undefined,
        userId: authorUserId,
      };
    }

    const uid =
      authUserId ||
      viewerAuthUserId ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("my_user_id")
        : null);
    let url: string | null = null;
    try {
      url = localStorage.getItem("my_avatar_url");
    } catch {
      url = null;
    }
    if (currentUserProfile.avatar_url) {
      url = currentUserProfile.avatar_url;
    }
    if (uid) {
      const cached = getCachedAvatar(uid);
      if (cached) url = cached;
    }
    const name =
      currentUserProfile.display_name ||
      currentUserProfile.username ||
      (() => {
        try {
          return (
            localStorage.getItem("my_display_name") ||
            localStorage.getItem("my_username") ||
            undefined
          );
        } catch {
          return undefined;
        }
      })();
    return {
      url,
      name,
      userId: uid,
    };
  }, [
    authUserId,
    currentUserProfile.avatar_url,
    currentUserProfile.display_name,
    currentUserProfile.username,
    editData,
    isEditMode,
    viewerAuthUserId,
  ]);

  const previewImageUploadingCount = useMemo(
    () => jobs.filter((j) => j.status === "uploading").length,
    [jobs],
  );

  const previewVideoAddingCount = useMemo(
    () => (localVideoIngestPending ? 1 : 0),
    [localVideoIngestPending],
  );

  const previewVideoPreparingCount = useMemo(
    () => (videoPreparing && !localVideoIngestPending ? 1 : 0),
    [videoPreparing, localVideoIngestPending],
  );

  const composeFinalizeHasActiveVideo =
    hasActivePostVideo(videoJob) || localVideoIngestPending || videoPreparing;

  const composeFinalizeHeroContainerStyle = useMemo(
    () =>
      resolveFinalizeComposeHeroFrame({
        hasActiveVideo: composeFinalizeHasActiveVideo,
        videoWidth: videoJob?.videoWidth,
        videoHeight: videoJob?.videoHeight,
      }),
    [
      composeFinalizeHasActiveVideo,
      videoJob?.videoWidth,
      videoJob?.videoHeight,
    ],
  );

  const finalizeMediaDock = (
    <CreateFinalizeHeroImageDock
      activities={draftActivitiesState}
      setActivities={setDraftActivitiesState}
      totalImagesPost={effectiveCreateImageCount}
      onAddMedia={openPostMediaPicker}
      selectedPreviewIndex={finalizeHeroSlideIndex}
      onSelectPreviewIndex={setFinalizeHeroSlideIndex}
      recordDiscreteBefore={recordDiscreteBefore}
    />
  );

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
          parsed.selected_dates = selectedIso;
          parsed.is_recurring = isRecurring;
          parsed.recurrence_days = recurrenceDays;
          parsed.pendingStartTime =
            selectedIso.length > 0 ? null : pendingStartTime;
          parsed.ratingEnabled = ratingEnabled;
          localStorage.setItem("editPostData", JSON.stringify(parsed));
        }
      } else {
        ensureDraftPublishPostId({ fresh: false });
        const raw = localStorage.getItem("draftMeta");
        const prev = raw ? (JSON.parse(raw) as DraftMeta) : {};
        localStorage.setItem(
          "draftMeta",
          JSON.stringify({
            ...prev,
            caption,
            tags,
            visibility,
            rsvpCapacity,
            rsvpEnabled: false,
            ratingEnabled,
            selectedDates: selectedIso,
            isRecurring,
            recurrenceDays,
            pendingStartTime: selectedIso.length > 0 ? null : pendingStartTime,
            createPostType,
          }),
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
    ratingEnabled,
    selectedDates,
    isRecurring,
    recurrenceDays,
    pendingStartTime,
    isEditMode,
    createPostType,
  ]);

  useEffect(() => {
    if (caption.trim().length > 0) {
      removeNotice(CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID);
      clearCaptionRequiredVisual();
    }
  }, [caption, removeNotice, clearCaptionRequiredVisual]);

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

  /** Scroll the caption block into view; optionally focus (desktop). */
  const scrollCaptionIntoView = (opts?: { focus?: boolean }) => {
    const focus = opts?.focus !== false;
    const block = document.getElementById("create-finalize-caption-anchor");
    block?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!focus) return;
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
   * CreateFinalizeComposerShell's scroll-to-top on mount (avoids fighting it).
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
    activities: sanitizedActivities.map((a: DraftActivity, i: number) => {
      const legacyAdditionalInfo = stripV4KeyInfoFromAdditionalInfo(
        a.additionalInfo,
      );
      return {
        title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
        images: Array.isArray(a.images) ? (a.images as string[]) : [],
        order_idx: i,
        location_name: i === 0 ? null : a.location ?? null,
        location_desc: i === 0 ? null : a.locationDesc ?? null,
        location_url: i === 0 ? null : a.locationUrl || null,
        location_notes: i === 0 ? null : a.locationNotes || null,
        additional_info: legacyAdditionalInfo.length
          ? legacyAdditionalInfo
          : null,
        tags: a.tags || null,
      };
    }),
    visibility: dbVisibility,
    is_anonymous: false,
    anonymous_name: null,
    anonymous_avatar: null,
    rsvp_capacity: isEditMode ? initialDraft.historicalRsvpCapacity : null,
    selected_dates: selectedDates.length
      ? selectedDates.map((d) => d.toISOString())
      : null,
    is_recurring: isRecurring || null,
    recurrence_days: recurrenceDays.length ? recurrenceDays : null,
    rating_enabled: ratingEnabled,
  };

  /** Opens confirm modal, or runs validation / upload gate first. */
  const requestPublish = () => {
    if (hasPendingUploads) {
      toast.error("Media is still uploading. Please wait before continuing.");
      return;
    }
    if (isPublishBlockedByMedia) {
      toast.error("Fix or remove the video before publishing.");
      return;
    }
    if (!caption.trim()) {
      // Presentation only: inline placeholder warning — no notice banner / canvas ring.
      removeNotice(CREATE_FLOW_CAPTION_REQUIRED_NOTICE_ID);
      activateCaptionRequiredVisual();
      scrollCaptionIntoView({ focus: false });
      return;
    }
    if (isEditMode) {
      const decision = resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: postType,
        initialHasStructuredSchedule: publishedEditInitialHasStructured,
        currentHasStructuredSchedule: hasSchedule,
      });
      if (decision.action === "request_conversion") {
        publishedTypeConversionIntentRef.current = null;
        setPublishedTypeConversionKind(decision.kind);
        return;
      }
    }
    setPublishModalUgcInline(false);
    setPublishModalOpen(true);
  };

  const requestPublishRef = useRef(requestPublish);
  requestPublishRef.current = requestPublish;

  /** Leave-dialog Republish → same pipeline as header CTA (edit only). */
  useEffect(() => {
    if (!isEditMode) return;
    const onRequestPublish = () => {
      if (publishing || publishInFlightRef.current) return;
      if (publishModalOpen || publishedTypeConversionKind != null) return;
      requestPublishRef.current();
    };
    window.addEventListener(
      CREATE_FLOW_REQUEST_PUBLISH_EVENT,
      onRequestPublish,
    );
    return () => {
      window.removeEventListener(
        CREATE_FLOW_REQUEST_PUBLISH_EVENT,
        onRequestPublish,
      );
    };
  }, [isEditMode, publishModalOpen, publishedTypeConversionKind, publishing]);

  const handlePublishedTypeConversionCancel = () => {
    publishedTypeConversionIntentRef.current = null;
    setPublishedTypeConversionKind(null);
  };

  const handlePublishedTypeConversionConfirm = () => {
    const kind = publishedTypeConversionKind;
    if (!kind) return;
    publishedTypeConversionIntentRef.current = kind;
    setPublishedTypeConversionKind(null);
    if (kind === "experience_to_hangout") {
      setRatingEnabled(false);
    } else {
      setRsvpEnabled(false);
    }
    setPublishModalUgcInline(false);
    setPublishModalOpen(true);
  };

  const handleFinalizePublish = async () => {
    if (publishing || publishInFlightRef.current) return;
    publishInFlightRef.current = true;
    setPublishModalUgcInline(false);
    setPublishing(true);
    setPublishPhase("idle");
    setPublishMediaUploadProgress(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        dispatch(setAuthModal(true));
        toast.error("Please sign in to continue");
        return;
      }

      if (isEditMode && !editData?.postId) {
        toast.error("Missing post to update.");
        return;
      }

      if (isEditMode) {
        const decision = resolvePublishedEditScheduleSaveDecision({
          originalPublishedType: postType,
          initialHasStructuredSchedule: publishedEditInitialHasStructured,
          currentHasStructuredSchedule: hasSchedule,
        });
        if (decision.action === "request_conversion") {
          const intent = publishedTypeConversionIntentRef.current;
          if (intent !== decision.kind) {
            setPublishModalOpen(false);
            publishedTypeConversionIntentRef.current = null;
            setPublishedTypeConversionKind(decision.kind);
            return;
          }
        }
      }

      let uploadReturnedMediaId: string | null = null;
      let publishActivities = sanitizedActivities;
      let publishMediaOrder =
        mediaOrder.length > 0 ? mediaOrder : undefined;
      let editVideoEdit: import("../lib/ownerPostMediaEditContract").VideoEditPayload | null =
        null;
      // Owner + report-reviewer Edit share the same media lifecycle; only the
      // republish RPC differs (owner_republish_post vs admin_republish_post).
      const isPublishedEditMedia = isEditMode;
      const bootstrapPublishedVideo = isPublishedEditMedia
        ? (editData?.publishedVideo as
            | PublishedVideoReference
            | null
            | undefined)
        : null;
      const editVideoOp = isPublishedEditMedia
        ? deriveOwnerEditVideoOp({
            videoJob,
            bootstrapPublishedVideo,
          })
        : ("NONE" as const);

      if (isPublishedEditMedia) {
        const publishPostId = ensureDraftPublishPostId({
          fresh: false,
          ownerUserId: session.user.id,
        });
        if (!publishPostId) {
          toast.error(GENERIC_PUBLISH_FAILED_MESSAGE);
          return;
        }

        const retainedPublishedLocalId = resolvePublishedMediaIdForEditSave(
          videoJob,
        )
          ? videoJob?.localId?.trim() || ""
          : "";
        const activeLocalDraftId =
          readDraftVideoMeta()?.localId?.trim() ||
          (hasActivePostVideo(videoJob) && !retainedPublishedLocalId
            ? videoJob?.localId?.trim() || ""
            : "") ||
          "";
        const activeVideoLocalId =
          activeLocalDraftId || retainedPublishedLocalId || "";
        const publishOrderReconcile = reconcileActiveVideoIntoPublishMediaOrder({
          mediaOrder,
          activeVideoLocalId: activeVideoLocalId || null,
        });
        // Published Edit always commits media_order (including [] after full clear).
        publishMediaOrder = publishOrderReconcile.order;

        if (editVideoOp === "ADD" || editVideoOp === "REPLACE") {
          if (!needsPublishTimeVideoUpload(videoJob)) {
            toast.error("Local video is missing. Choose a video and try again.");
            return;
          }
          const uploadResult = await uploadVideoForPublish({
            onPhase: (phase) => {
              if (phase === "preparing_video") {
                setPublishPhase("preparing_video");
              } else if (phase === "uploading_video") {
                setPublishPhase("uploading_media");
              } else if (phase === "processing_video") {
                setPublishPhase("processing_video");
              }
            },
          });
          if (!uploadResult.ok) {
            toast.error(
              uploadResult.error || "Video upload failed. Please try again.",
            );
            return;
          }
          uploadReturnedMediaId = uploadResult.mediaId;
        }

        const stagedOrRetainedId =
          editVideoOp === "ADD" || editVideoOp === "REPLACE"
            ? uploadReturnedMediaId
            : editVideoOp === "UNCHANGED"
              ? resolvePublishedMediaIdForEditSave(videoJob) ||
                bootstrapPublishedVideo?.mediaId ||
                null
              : null;

        const videoEditBuilt = buildOwnerEditVideoEditPayload({
          op: editVideoOp,
          stagedMediaId: stagedOrRetainedId,
          expectedAttachedMediaId: bootstrapPublishedVideo?.mediaId ?? null,
        });
        if (!videoEditBuilt.ok) {
          toast.error(videoEditBuilt.error || GENERIC_PUBLISH_FAILED_MESSAGE);
          return;
        }
        editVideoEdit = videoEditBuilt.payload;
      }

      if (!isEditMode) {
        const publishPostId = ensureDraftPublishPostId({
          fresh: false,
          ownerUserId: session.user.id,
        });
        if (!publishPostId) {
          toast.error(GENERIC_PUBLISH_FAILED_MESSAGE);
          return;
        }

        await reconcileDraftImages({ publishPostId });

        const activeVideoLocalId =
          readDraftVideoMeta()?.localId?.trim() ||
          (hasActivePostVideo(videoJob)
            ? videoJob?.localId?.trim() || ""
            : "") ||
          "";
        const activeVideoPresent = Boolean(activeVideoLocalId);
        const publishOrderReconcile = reconcileActiveVideoIntoPublishMediaOrder({
          mediaOrder,
          activeVideoLocalId: activeVideoPresent ? activeVideoLocalId : null,
        });
        if (import.meta.env.DEV) {
          console.log("[echotoo published media] publish-order", {
            draftKinds: publishOrderReconcile.draftKinds,
            activeVideoPresent,
            reconciledVideo: publishOrderReconcile.reconciledVideo,
            finalDraftKinds: publishOrderReconcile.finalDraftKinds,
          });
        }

        const snapshot = snapshotCreatePublishMedia({
          publishPostId,
          mediaOrder: publishOrderReconcile.order,
          activityImages: Array.isArray(sanitizedActivities[0]?.images)
            ? sanitizedActivities[0].images.map(String)
            : [],
        });
        const surviving = selectSurvivingDraftImagesForPublish(snapshot);
        const needsVideoUpload = needsPublishTimeVideoUpload(videoJob);
        const videoBytes = needsVideoUpload
          ? Math.max(
              0,
              readDraftVideoMeta()?.size ??
                videoJob?.localFile?.size ??
                0,
            )
          : 0;
        // Poster is tiny; estimate ~48KB until onPosterResolved reports real bytes.
        const posterEstimateBytes =
          needsVideoUpload &&
          !(readDraftVideoMeta()?.remotePosterStoragePath?.trim())
            ? 48_000
            : 0;

        let progressState = createCombinedMediaProgressState({
          images: surviving,
          videoBytes,
          posterBytes: posterEstimateBytes,
        });
        const bumpProgress = (
          patch: Parameters<typeof applyCombinedMediaProgress>[1],
        ) => {
          const applied = applyCombinedMediaProgress(progressState, patch);
          progressState = applied.state;
          setPublishMediaUploadProgress(applied.percent);
        };

        publishImageAbortRef.current?.abort();
        const imageAbort = new AbortController();
        publishImageAbortRef.current = imageAbort;

        let localIdToRemotePath: Record<string, string> = {};

        if (surviving.length > 0 || needsVideoUpload) {
          setPublishPhase("uploading_media");
          setPublishMediaUploadProgress(progressState.highWaterPercent);
        }

        // Sequence: images (max 2) → video TUS (proven Android path unchanged).
        if (surviving.length > 0) {
          const imageResult = await uploadSurvivingDraftImagesForPublish({
            snapshot,
            userId: session.user.id,
            signal: imageAbort.signal,
            onImageCompleted: ({ completedImageBytes }) => {
              bumpProgress({ imageCompletedBytes: completedImageBytes });
            },
          });
          if (!imageResult.ok) {
            toast.error(
              imageResult.cancelled
                ? "Upload cancelled."
                : imageResult.error || GENERIC_PUBLISH_FAILED_MESSAGE,
            );
            return;
          }
          localIdToRemotePath = imageResult.localIdToRemotePath;
          bumpProgress({
            imageCompletedBytes: progressState.imageTotalBytes,
          });
        }

        if (imageAbort.signal.aborted) {
          toast.error("Upload cancelled.");
          return;
        }

        if (needsVideoUpload) {
          const uploadResult = await uploadVideoForPublish({
            onPhase: (phase) => {
              if (phase === "preparing_video") {
                setPublishPhase("preparing_video");
              } else if (phase === "uploading_video") {
                setPublishPhase("uploading_media");
              } else if (phase === "processing_video") {
                setPublishPhase("processing_video");
              }
            },
            onPosterResolved: ({ bytes, reusedRemote }) => {
              const total = reusedRemote ? 0 : Math.max(0, bytes);
              bumpProgress({
                posterTotalBytes: total,
                posterCompletedBytes: total,
              });
            },
            onProgress: (percent) => {
              bumpProgress({ videoPercent: percent });
            },
          });
          if (!uploadResult.ok) {
            toast.error(uploadResult.error || "Video upload failed. Please try again.");
            return;
          }
          uploadReturnedMediaId = uploadResult.mediaId;
          bumpProgress({ videoPercent: 100 });
        }

        try {
          publishActivities = sanitizedActivities.map((a) => ({
            ...a,
            images: mapActivityImagesToRemotePaths(
              Array.isArray(a.images) ? a.images.map(String) : [],
              localIdToRemotePath,
            ),
          }));
          publishMediaOrder =
            snapshot.mediaOrder.length > 0
              ? mapMediaOrderImagesToRemotePaths(
                  snapshot.mediaOrder,
                  localIdToRemotePath,
                )
              : undefined;
          assertPublishImagePayloadHasNoLocalLeak(
            publishActivities.map((a) =>
              Array.isArray(a.images) ? a.images.map(String) : [],
            ),
            publishMediaOrder ?? [],
          );
        } catch {
          toast.error(GENERIC_PUBLISH_FAILED_MESSAGE);
          return;
        }
      }

      setPublishPhase("creating_post");

      const captionSafe = clampCaption(caption);
      const ownerConversionKind = isEditMode
        ? publishedTypeConversionIntentRef.current
        : null;
      const confirmedOwnerTypeConversion = ownerConversionKind
        ? publishedOwnerConversionTargetType(ownerConversionKind)
        : null;
      const publishPostType = confirmedOwnerTypeConversion
        ? confirmedOwnerTypeConversion
        : postType === "hangout"
          ? "hangout"
          : "experience";
      const ratingEnabledForPublish =
        ownerConversionKind === "experience_to_hangout"
          ? false
          : ratingEnabled;
      /** New Place only: omit legacy/stale Event schedule from payload (local state kept). */
      const stripEventScheduleForNewPlace =
        !isEditMode && publishPostType === "experience";

      const draftMetaForSeed = !isEditMode ? readDraftVideoMeta() : null;
      const bunnyVideoIdForSeed =
        draftMetaForSeed?.remoteVideoId?.trim() ||
        (videoJob?.videoId &&
        videoJob.videoId !== "draft-local" &&
        videoJob.videoId !== "pending"
          ? videoJob.videoId.trim()
          : "") ||
        "";
      const posterUrlForSeed =
        draftMetaForSeed?.remotePosterUrl?.trim() || null;

      const publishedVideoMediaId = isPublishedEditMedia
        ? editVideoOp === "ADD" || editVideoOp === "REPLACE"
          ? uploadReturnedMediaId
          : editVideoOp === "UNCHANGED"
            ? resolvePublishedMediaIdForEditSave(videoJob) ||
              bootstrapPublishedVideo?.mediaId ||
              null
            : null
        : resolvePublishedVideoMediaId({
              uploadResultMediaId: uploadReturnedMediaId,
              draftRemoteMediaId: readDraftVideoMeta()?.remoteMediaId ?? null,
              videoJobMediaId: videoJob?.mediaId ?? null,
            });

      const requireVideoInMediaOrder = isPublishedEditMedia
        ? editVideoOp === "ADD" ||
          editVideoOp === "REPLACE" ||
          editVideoOp === "UNCHANGED"
        : !isEditMode &&
          (hasActivePostVideo(videoJob) ||
            Boolean(draftMetaForSeed?.localId?.trim()) ||
            needsPublishTimeVideoUpload(videoJob));

      if (
        requireVideoInMediaOrder &&
        !(publishMediaOrder ?? []).some((item) => item.kind === "video")
      ) {
        if (import.meta.env.DEV) {
          console.error(
            "[echotoo published media] invariant: active video but final draft order has no video",
            {
              draftKinds: (publishMediaOrder ?? []).map((i) => i.kind),
            },
          );
        }
        toast.error(GENERIC_PUBLISH_FAILED_MESSAGE);
        return;
      }

      let publishedMediaSeed:
        | {
            mediaOrder: unknown;
            postMedia: unknown;
            imageUrls?: string[];
          }
        | null = null;
      if (!isEditMode && publishMediaOrder?.length) {
        const orderHasVideo = publishMediaOrder.some(
          (item) => item.kind === "video",
        );
        const canSeedVideo =
          orderHasVideo &&
          isCanonicalPublishedVideoMediaId(publishedVideoMediaId) &&
          Boolean(bunnyVideoIdForSeed);
        const canSeedImageOnly = !orderHasVideo;

        if (canSeedVideo || canSeedImageOnly) {
          try {
            const publishedOrder = mapDraftMediaOrderToPublished(
              publishMediaOrder,
              canSeedVideo ? publishedVideoMediaId : null,
            );
            publishedMediaSeed = {
              mediaOrder: publishedOrder,
              postMedia: canSeedVideo
                ? [
                    {
                      id: publishedVideoMediaId.trim(),
                      post_id:
                        ensureDraftPublishPostId({ fresh: false }) || null,
                      sort_order: 0,
                      kind: "video",
                      bunny_video_id: bunnyVideoIdForSeed,
                      video_status: "processing",
                      poster_url: posterUrlForSeed,
                      duration_sec:
                        typeof draftMetaForSeed?.duration === "number"
                          ? draftMetaForSeed.duration
                          : videoJob?.videoDuration ?? null,
                      width:
                        (typeof draftMetaForSeed?.width === "number" &&
                        draftMetaForSeed.width > 0
                          ? draftMetaForSeed.width
                          : null) ??
                        (typeof draftMetaForSeed?.preparedWidth === "number" &&
                        draftMetaForSeed.preparedWidth > 0
                          ? draftMetaForSeed.preparedWidth
                          : null) ??
                        videoJob?.videoWidth ??
                        null,
                      height:
                        (typeof draftMetaForSeed?.height === "number" &&
                        draftMetaForSeed.height > 0
                          ? draftMetaForSeed.height
                          : null) ??
                        (typeof draftMetaForSeed?.preparedHeight === "number" &&
                        draftMetaForSeed.preparedHeight > 0
                          ? draftMetaForSeed.preparedHeight
                          : null) ??
                        videoJob?.videoHeight ??
                        null,
                    },
                  ]
                : [],
              imageUrls: publishedOrder
                .filter(
                  (item): item is { kind: "image"; url: string } =>
                    item.kind === "image",
                )
                .map((item) => item.url),
            };
          } catch {
            publishedMediaSeed = null;
          }
        }
      }

      const { post } = await executeCreateFlowPublish({
        postType: publishPostType,
        caption: captionSafe,
        tags,
        visibility: dbVisibility === "friends" ? "friends" : "public",
        rsvpCapacity: isEditMode
          ? initialDraft.historicalRsvpCapacity
          : null,
        selectedDatesIso: stripEventScheduleForNewPlace
          ? []
          : selectedDates.map((d) => d.toISOString()),
        isRecurring: stripEventScheduleForNewPlace ? false : isRecurring,
        recurrenceDays: stripEventScheduleForNewPlace ? [] : recurrenceDays,
        activities: publishActivities,
        isEditMode,
        editPostId: isEditMode ? editData.postId : undefined,
        isAdminEdit: isEditMode && editData?.isAdminEdit === true,
        authorUserId: editData?.authorUserId,
        originalPostType: isEditMode
          ? (editData.type as "experience" | "hangout" | undefined)
          : undefined,
        confirmedOwnerTypeConversion: isEditMode
          ? confirmedOwnerTypeConversion
          : null,
        isAnonymous: isEditMode ? editData?.is_anonymous ?? false : undefined,
        anonymousName: isEditMode
          ? editData?.anonymous_name ?? null
          : undefined,
        anonymousAvatar: isEditMode
          ? editData?.anonymous_avatar ?? null
          : undefined,
        ratingEnabled: ratingEnabledForPublish,
        atomicPublish: !isEditMode,
        mediaOrder: isPublishedEditMedia
          ? publishMediaOrder ?? []
          : publishMediaOrder,
        publishedVideoMediaId,
        requireVideoInMediaOrder,
        publishedMediaSeed,
        videoEdit: isPublishedEditMedia ? editVideoEdit : null,
        commitOwnerMediaInRepublish: isPublishedEditMedia,
      });

      if (isEditMode && editData?.postId) {
        resetStructuralHistory();
        publishedTypeConversionIntentRef.current = null;
        let returnPath = editData.returnPath || "/u/me";
        const liveType = normalizeCreatePostType(
          typeof post.type === "string" ? post.type : publishPostType,
        );
        const id = editData.postId;
        if (
          returnPath === `/experience/${id}` ||
          returnPath === `/hangout/${id}`
        ) {
          returnPath = liveType === "hangout" ? `/hangout/${id}` : `/experience/${id}`;
        }
        let returnState = editData.returnState;
        if (
          returnState?.initialPost &&
          typeof returnState.initialPost === "object" &&
          returnState.initialPost !== null
        ) {
          returnState = {
            ...returnState,
            initialPost: {
              ...(returnState.initialPost as Record<string, unknown>),
              type: liveType,
            },
          };
        }
        // Local-only cleanup after attach — never Bunny-delete the committed media.
        await cleanupDraftVideoAfterPublish();
        discardOwnerPublishedEditLocalState();
        setPublishModalUgcInline(false);
        setPublishModalOpen(false);
        navigateAfterEditPublish(nav, { returnPath, returnState });
        return;
      }

      resetStructuralHistory();
      if (!isEditMode) {
        const publishPostId = ensureDraftPublishPostId({ fresh: false });
        await cleanupDraftImagesAfterSuccessfulPublish(publishPostId);
        await cleanupDraftVideoAfterPublish();
      }
      setNewPostId(post.id);
      setPublishModalUgcInline(false);
      setPublishModalOpen(false);
      setShowPostedModal(true);
    } catch (e) {
      console.error("[CreateFinalizePage] publish failed", e);
      logPublishFailureOutcome({
        stage: "post_create",
        errorCode: isUgcTextPolicyError(e)
          ? "ugc_policy"
          : isPublishedVideoMediaIdRequiredError(e)
            ? "video_media_id_required"
            : isPublishedVideoOrderRequiredError(e)
              ? "video_order_required"
              : "unexpected",
        recoverable: true,
      });
      if (isUgcTextPolicyError(e)) {
        setPublishModalUgcInline(true);
      } else if (
        isPublishedVideoMediaIdRequiredError(e) ||
        isPublishedVideoOrderRequiredError(e)
      ) {
        toast.error(GENERIC_PUBLISH_FAILED_MESSAGE);
      } else {
        const msg = e instanceof Error ? e.message : "";
        toast.error(msg.trim() ? msg : GENERIC_PUBLISH_FAILED_MESSAGE);
      }
    } finally {
      publishInFlightRef.current = false;
      publishImageAbortRef.current = null;
      setPublishing(false);
      setPublishPhase("idle");
      setPublishMediaUploadProgress(null);
    }
  };

  const handlePublishModalCancel = useCallback(() => {
    if (
      publishing &&
      (publishPhase === "preparing_video" ||
        publishPhase === "uploading_media" ||
        publishPhase === "uploading_video" ||
        publishPhase === "processing_video")
    ) {
      publishImageAbortRef.current?.abort();
      void cancelPublishVideoUpload().then((ok) => {
        // Always stop scheduling further work; in-flight Storage may still settle.
        setPublishModalOpen(false);
        setPublishing(false);
        setPublishPhase("idle");
        setPublishMediaUploadProgress(null);
        publishInFlightRef.current = false;
        if (!ok) {
          /* video cancel may be a no-op if not in video phase */
        }
      });
      return;
    }
    handlePublishModalClose();
  }, [cancelPublishVideoUpload, handlePublishModalClose, publishPhase, publishing]);

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
    if (!userId) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return nav(Paths.profile);
    }
    navigateToOwnProfileAfterPublish(nav, { postId: newPostId });
  };

  const [isExiting, setIsExiting] = useState(false);

  /**
   * Visual dismiss runs only when leave is approved (empty: sync in listener;
   * dirty: after Save draft / Discard). Cancel leaves `isExiting` false.
   * flushSync paints the hidden shell before navigate starts remount work.
   */
  const handleLeaveCreateFlow = useCallback(() => {
    dispatchCreateFlowLeaveRequest(() => {
      flushSync(() => {
        setIsExiting(true);
      });
      nav(Paths.home);
    });
  }, [nav]);

  /** Empty composer only — hide bottom exit once leave would confirm. */
  const [showEmptyComposerExit, setShowEmptyComposerExit] = useState(
    () => !shouldConfirmCreateFlowLeave(),
  );
  useEffect(() => {
    const sync = () => {
      setShowEmptyComposerExit(!shouldConfirmCreateFlowLeave());
    };
    sync();
    window.addEventListener(CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT, sync);
    window.addEventListener(CREATE_FLOW_POST_IMAGE_MERGED_EVENT, sync);
    return () => {
      window.removeEventListener(CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT, sync);
      window.removeEventListener(CREATE_FLOW_POST_IMAGE_MERGED_EVENT, sync);
    };
  }, []);

  const emptyComposerExitButton = showEmptyComposerExit ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleLeaveCreateFlow();
      }}
      aria-label="Leave create flow"
      className={[
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        "bg-[var(--create-chooser-cta-selected-surface)]",
        "text-[var(--create-chooser-cta-selected-label)]",
        "border border-[var(--bottom-tab-border)]",
        "shadow-[0_2px_10px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]",
        "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.28)]",
        "transition hover:brightness-110 active:scale-[0.96]",
      ].join(" ")}
    >
      <PiXBold className="h-5 w-5 shrink-0" aria-hidden />
    </button>
  ) : null;

  return (
    <CreateFinalizeMediaChromeProvider>
    <CreateFinalizeComposerShell exiting={isExiting}>
      <CreateFlowTopBar
        variant="v4Composer"
        layout="anchor"
        emphasizeWhiteBorder
        leftAction={{
          icon: "close",
          label: "Leave create flow",
          onClick: handleLeaveCreateFlow,
        }}
        mediaAction={{
          icon: "images",
          label: "Media",
          onClick: openPostMediaPicker,
          disabled: hasPendingUploads || publishing,
        }}
        primaryCta={{
          label: headerCtaLabel,
          busyLabel: headerCtaBusyLabel,
          onClick: requestPublish,
          disabled: hasPendingUploads || isPublishBlockedByMedia || publishing,
          loading: publishing,
          postType: postType === "hangout" ? "hangout" : "experience",
          avatar: headerCtaAvatar,
        }}
      />
      {postMediaFileInput}
      {postMediaAcquisitionSheet}
      <CreateFlowKeyboardShell>
        <CreateFinalizeScheduleSheet
          open={scheduleSheetOpen}
          onClose={() => setScheduleSheetOpen(false)}
          selectedDates={selectedDates}
          recurrenceDays={recurrenceDays}
          pendingStartTime={pendingStartTime}
          onCommit={handleScheduleCommit}
        />
        <CreateFinalizeLocationSheet
          open={locationSheetOpen}
          onClose={() => setLocationSheetOpen(false)}
          location={slot0Location}
          locationUrl={slot0LocationUrl}
          onCommit={commitSlot0Location}
        />
        <CreateFinalizeTagsSheet
          open={tagsSheetOpen}
          onClose={() => setTagsSheetOpen(false)}
          tags={tags}
          advisoryHighlight={highlightedPublishWarningKeys.has("hashtags")}
          onCommit={(next) => {
            setTags(next);
            setTagsSheetOpen(false);
          }}
        />
        <CreateFinalizeSettingsSheet
          open={settingsSheetOpen}
          onClose={closeSettingsSheet}
          showPostType={!isEditMode}
          postType={createPostType}
          onPostTypeChange={handleSettingsPostTypeChange}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          ratingEnabled={ratingEnabled}
          onRatingToggle={() => setRatingEnabled((v) => !v)}
          highlightRatings={settingsHighlightRatings}
        />
        <CreateFinalizeKeyInfoRoot
          values={keyInfoValues}
          onValuesChange={setKeyInfoValues}
          registerCloseEditor={(close) => {
            closeKeyInfoEditorRef.current = close;
          }}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <div
              data-create-finalize-editing-canvas
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                paddingTop:
                  "var(--create-flow-top-bar-total, calc(var(--safe-area-top-layout) + 52px))",
                paddingBottom:
                  "calc(14px + var(--create-finalize-toolbar-height, 44px))",
              }}
            >
              <div className={FINALIZE_COMPOSER_CANVAS_COLUMN_CLASS}>
              <PostDetailBody
                post={previewPost}
                isPreview={true}
                composeFinalizeShell
                composeFinalizeHasVisibleDateOrLocation={hasVisibleDateOrLocation}
                composeFinalizeHideAuthorPreview
                composeFinalizeCaption={{
                  value: caption,
                  onChange: handleCaptionChange,
                  onBeforeInput: handleCaptionBeforeInput,
                  maxLength: CREATE_FLOW_CAPTION_MAX,
                  highlight: false,
                  requiredWarning: captionRequiredVisual,
                  requiredWarningPulse: captionRequiredPulse,
                  captionFocused,
                  focusPulse: captionFocusPulse,
                  entryPulse: captionEntryPulse,
                  surroundingDeemphasize: !fullProminence,
                  onCaptionFocusChange: handleCaptionFocusChange,
                  captionTextareaRef,
                }}
                composeFinalizeStripPreviewMeta
                composeFinalizeShowActivityTimeline={hasLegacyActivityTimeline}
                composeFinalizeBelowCaption={
                  <>
                    <CreateFinalizeCaptionMetaActions
                      {...captionMetaActionsProps}
                    />
                    <div
                      className={`flex w-full min-w-0 flex-col overflow-visible ${finalizeMetaStackGapClass}`}
                    >
                      <CreateFinalizeKeyInfoNotesArea />
                      <CreateFinalizeStructuredMetaBlocks
                        showDate={showEditedStructuredSchedule}
                        dateSummary={dateCanvasSummary}
                        onDateClick={requestOpenDateSheet}
                        onDateLongPress={handleRequestRemoveDate}
                        onDateRemove={handleRequestRemoveDate}
                        showLocation={hasV4Location}
                        locationName={slot0Location}
                        locationUrl={slot0LocationUrl}
                        onLocationClick={openLocationEditor}
                        onLocationLongPress={() =>
                          setMetadataRemoveConfirm("location")
                        }
                        onLocationRemove={() =>
                          setMetadataRemoveConfirm("location")
                        }
                      />
                      <CreateFinalizeCanvasTagsRow
                        tags={tags}
                        onClick={openTagsSheet}
                      />
                    </div>
                    <CreateFinalizeAddSectionTrigger
                      sectionCount={v4SectionCount}
                      onAddSection={toggleSectionCompose}
                      skipSectionBlurRef={skipSectionBlurRef}
                      sectionActive={sectionComposeClientId != null}
                    />
                    <CreateFinalizeSectionsEditors
                      activities={draftActivitiesState}
                      setActivities={setDraftActivitiesState}
                      activeWritingBlock={activeWritingBlock}
                      onSectionFocus={handleSectionFocus}
                      onSectionBlur={handleSectionBlur}
                      sectionComposeClientId={sectionComposeClientId}
                      autoFocusSectionClientId={autoFocusSectionClientId}
                      onAutoFocusSectionHandled={() =>
                        setAutoFocusSectionClientId(null)
                      }
                      skipBlurRemoveRef={skipSectionBlurRef}
                      captionTextareaRef={captionTextareaRef}
                      onSectionRemoved={handleSectionRemoved}
                      recordDiscreteBefore={recordDiscreteBefore}
                      onSectionBodyChange={handleSectionBodyChange}
                      onSectionBeforeInput={handleSectionBeforeInput}
                    />
                  </>
                }
                composeFinalizeHeroBottomOverlayCta={finalizeMediaDock}
                composeFinalizeHasActiveVideo={composeFinalizeHasActiveVideo}
                composeFinalizeHeroContainerStyle={
                  composeFinalizeHeroContainerStyle
                }
                composeFinalizeHeroMedia={
                  hasCreateMedia ? (
                    <CreateFinalizeHeroMedia
                      activities={draftActivitiesState}
                      heroMediaIndex={finalizeHeroSlideIndex}
                      onHeroMediaIndexChange={setFinalizeHeroSlideIndex}
                    />
                  ) : undefined
                }
                composeFinalizeHeroPagination={
                  (() => {
                    const slideCount =
                      mediaOrder.length > 0
                        ? mediaOrder.length
                        : effectiveCreateImageCount +
                          (composeFinalizeHasActiveVideo ? 1 : 0);
                    return slideCount > 1 ? (
                      <CreateFinalizeHeroPaginationDots
                        count={slideCount}
                        activeIndex={finalizeHeroSlideIndex}
                      />
                    ) : undefined;
                  })()
                }
                composeFinalizeHeroSlideIndex={finalizeHeroSlideIndex}
                composeFinalizeOnHeroSlideIndexChange={
                  setFinalizeHeroSlideIndex
                }
                previewHeroOverlay={
                  shouldShowFinalizeHeroUploadOverlayPill({
                    imageUploadingCount: previewImageUploadingCount,
                    videoAddingCount: previewVideoAddingCount,
                    videoPreparingCount: previewVideoPreparingCount,
                  }) ? (
                    <PreviewUploadOverlayPill
                      imageUploadingCount={previewImageUploadingCount}
                      videoAddingCount={previewVideoAddingCount}
                      videoPreparingCount={previewVideoPreparingCount}
                    />
                  ) : undefined
                }
              />
              </div>
            </div>
            <div
              className="relative flex w-full shrink-0 flex-col gap-2 bg-transparent"
              style={{
                paddingBottom: FINALIZE_COMPOSER_FOOTER_PAD_CSS,
                marginTop:
                  "calc(-1 * var(--create-finalize-toolbar-height, 44px))",
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[37]"
                style={{
                  top: "calc(-1 * 16px)",
                  background: `linear-gradient(
                    to top,
                    var(--bg) 0%,
                    var(--bg) 10%,
                    color-mix(in oklab, var(--bg) 82%, transparent) 24%,
                    color-mix(in oklab, var(--bg) 58%, transparent) 40%,
                    color-mix(in oklab, var(--bg) 34%, transparent) 54%,
                    color-mix(in oklab, var(--bg) 14%, transparent) 64%,
                    transparent 70%,
                    transparent 100%
                  )`,
                }}
              />
              <CreateFinalizeMetadataRow
                {...bottomToolbarHistoryProps}
                hasTags={tags.length > 0}
                onTagsClick={openTagsSheet}
                tagsSheetOpen={tagsSheetOpen}
                onSettingsClick={() => {
                  openSettingsSheet();
                }}
                settingsSheetOpen={settingsSheetOpen}
                highlightTagsPill={highlightedPublishWarningKeys.has(
                  "hashtags",
                )}
                trailingAction={emptyComposerExitButton}
              />
            </div>
          </div>
        </CreateFinalizeKeyInfoRoot>

        <ConfirmDialog
          open={metadataRemoveConfirm != null}
          onClose={handleMetadataRemoveConfirmClose}
          onConfirm={handleMetadataRemoveConfirm}
          title={
            metadataRemoveConfirm === "date"
              ? "Remove date?"
              : "Remove location?"
          }
          message={
            metadataRemoveConfirm === "date"
              ? "Are you sure you want to remove this date?"
              : "Are you sure you want to remove this location?"
          }
          cancelLabel="Cancel"
          secondaryLabel="Edit"
          onSecondary={handleMetadataRemoveEdit}
          secondaryVariant="default"
          confirmLabel="Remove"
          confirmVariant="danger"
        />

        <ConfirmDialog
          open={placeToEventConfirmOpen}
          onClose={handlePlaceToEventConfirmClose}
          onConfirm={handlePlaceToEventConfirm}
          title="Change Post to Event?"
          message="Dates are for Events. Adding a date will change this Post to an Event."
          cancelLabel="Keep as Post"
          confirmLabel="Change to Event"
          confirmVariant="primary"
        />

        <ConfirmDialog
          open={eventToPlaceConfirmOpen}
          onClose={handleEventToPlaceConfirmClose}
          onConfirm={handleEventToPlaceConfirm}
          title="Change Event to Post?"
          message={
            <p className="m-0 font-medium text-red-700/85 app-dark:text-red-300/90">
              {eventToPlaceConfirmMessage}
            </p>
          }
          cancelLabel="Cancel"
          confirmLabel="Change to Post"
          confirmVariant="primary"
        />

        <ConfirmDialog
          open={publishedTypeConversionKind != null}
          onClose={handlePublishedTypeConversionCancel}
          onConfirm={handlePublishedTypeConversionConfirm}
          title={
            publishedTypeConversionKind === "experience_to_hangout"
              ? "Change Post to Event?"
              : "Change Event to Post?"
          }
          message={
            publishedTypeConversionKind === "experience_to_hangout"
              ? "Saving this event date will change this published Post to an Event. Ratings will be turned off, but existing rating history will be kept."
              : "Removing the event date will change this published Event to a Post. RSVP history will be kept, but Event RSVP capacity will be removed."
          }
          cancelLabel="Cancel"
          confirmLabel={
            publishedTypeConversionKind === "experience_to_hangout"
              ? "Change to Event"
              : "Change to Post"
          }
          confirmVariant="primary"
        />

        <ConfirmDialog
          open={publishModalOpen}
          onClose={handlePublishModalCancel}
          onConfirm={() => void handleFinalizePublish()}
          title={isEditMode ? "Republish this post?" : "Publish this post?"}
          message={finalizePublishModalMessage}
          inlineAlert={
            publishModalUgcInline
              ? FINALIZE_PUBLISH_UGC_INLINE_ALERT_COPY
              : publishPhase === "preparing_video" ||
                  publishPhase === "uploading_media" ||
                  publishPhase === "uploading_video" ||
                  publishPhase === "processing_video" ||
                  publishPhase === "creating_post"
                ? headerCtaBusyLabel
                : null
          }
          inlineAlertVariant={
            publishModalUgcInline
              ? "danger"
              : publishPhase === "preparing_video" ||
                  publishPhase === "uploading_media" ||
                  publishPhase === "uploading_video" ||
                  publishPhase === "processing_video" ||
                  publishPhase === "creating_post"
                ? "progress"
                : "danger"
          }
          inlineAlertProgress={
            !publishModalUgcInline &&
            (publishPhase === "uploading_media" ||
              publishPhase === "uploading_video") &&
            typeof (publishMediaUploadProgress ??
              publishVideoUploadProgress) === "number"
              ? (publishMediaUploadProgress ?? publishVideoUploadProgress)
              : null
          }
          confirmLabel={publishModalConfirmLabel}
          cancelLabel={
            publishing &&
            (publishPhase === "preparing_video" ||
              publishPhase === "uploading_media" ||
              publishPhase === "uploading_video" ||
              publishPhase === "processing_video")
              ? "Cancel upload"
              : "Back"
          }
          confirmVariant="primary"
          isLoading={publishing}
          pillButtons
        />

        <PostedSuccessModal
          open={showPostedModal}
          onDismiss={() => void goToProfileAfterPost()}
          onShareClick={async () => {
            try {
              if (!newPostId) return;
              const postUrl = `${getPublicShareBaseUrl()}${postDetailPath(
                postType === "hangout" ? "hangout" : "experience",
                newPostId,
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
    </CreateFinalizeComposerShell>
    </CreateFinalizeMediaChromeProvider>
  );
}
