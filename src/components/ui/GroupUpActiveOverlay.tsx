/**
 * Shared Group overlay: create composer + manage sheet + cancel confirm.
 * CREATE / MANAGE share frosted Group Create visual language.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  PiCalendarBlank,
  PiChatCircle,
  PiClock,
  PiStarFill,
  PiUsersThree,
} from "react-icons/pi";
import type { RootState } from "../../app/store";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import {
  cancelGroupUp,
  createGroupUp,
  getMyGroupUpForConversation,
  getMyGroupUpsForSources,
  GROUP_UP_DESCRIPTION_MAX,
  GROUP_UP_TITLE_MAX,
  updateGroupUpSchedule,
} from "../../api/services/groupUp";
import {
  OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS,
  useOverlayContentSwipeDismiss,
} from "../../hooks/useOverlayContentSwipeDismiss";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import {
  isGroupCreateDraftDirty,
  resolveComposeCreateBackAction,
  resolveComposeCreateDismissRequest,
} from "../../lib/composeCreateDraftGuard";
import {
  GROUP_UP_CREATE_PHOTO_PROMPT_DESCRIPTION,
  GROUP_UP_CREATE_PHOTO_PROMPT_TITLE,
} from "../../lib/pairUpPhotoPromptCopy";
import {
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  shouldSuppressUnderlyingBackForPhotoPrompt,
  subscribePairUpPhotoPrompt,
} from "../../lib/pairUpPhotoPromptStore";
import { isPeoplePhotoPromptBypassed } from "../../lib/peoplePhotoPromptSession";
import { resolvePhotoPromptOffer } from "../../lib/peoplePhotoPromptPolicy";
import {
  CREATE_FLOW_DEFAULT_START_TIME,
  formatCreateFlowStartTimeCompact,
  type CreateFlowStartTime,
} from "../../lib/createFlowStartTime";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  deriveGroupUpScheduleFromOccursAt,
  deriveGroupUpSchedulePrefill,
} from "../../lib/groupUpSchedulePrefill";
import {
  closeGroupUpCancelConfirm,
  closeGroupUpOverlay,
  closeGroupUpOverlayTop,
  getGroupUpActiveOverlayState,
  isGroupUpActiveOverlayStackOpen,
  openGroupUpCancelConfirm,
  subscribeGroupUpActiveOverlay,
} from "../../lib/groupUpActiveOverlayStore";
import {
  getGroupUpDiscoverableCount,
  subscribeGroupUpCount,
} from "../../lib/groupUpCountStore";
import {
  getGroupUpOwnOpportunity,
  getGroupUpOwnStatus,
  isRealGroupUpOpportunityId,
  requestGroupUpOwnState,
  setOptimisticGroupUpOwnState,
  subscribeGroupUpOwnState,
} from "../../lib/groupUpOwnStore";
import { buildSocialCreateSchedule } from "../../lib/openPlanSchedule";
import {
  formatPlaceDuoExactDayLabel,
  formatPlaceDuoRelativeDayLabel,
  formatPlaceDuoScheduleSummary,
} from "../../lib/placeDuoRelativeDate";
import {
  computeSeeOtherGroupsCount,
  mergeGroupManageIdentityFromConversation,
  resolveGroupManageIdentityFromCache,
  resolveGroupManageUtilityActions,
  type GroupManageIdentity,
} from "../../lib/resolveGroupManageIdentity";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";
import { openSourceGroupsOverlay } from "../../lib/sourceGroupsOverlayStore";
import { socialUiCopy } from "../../lib/social/socialUiCopy";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import { buildGroupManageOpenGroupNavigation } from "../../lib/messages/dismissConversationNav";
import { isMessagesConversationPath } from "../../router/Paths";
import FutureDateTimePanel, {
  type FutureDatePickerSurface,
  type FutureDateTimeSegment,
} from "../date/FutureDateTimePanel";
import BottomDrawer, {
  BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
} from "./BottomDrawer";
import ConfirmDialog from "./ConfirmDialog";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";

const GROUP_ACTION_H = "h-9";

const DESC_LINE_PX = 26;
const DESC_MIN_LINES = 3;
const DESC_MAX_LINES = 6;
const DESC_MIN_H = DESC_LINE_PX * DESC_MIN_LINES;
const DESC_MAX_H = DESC_LINE_PX * DESC_MAX_LINES;

const groupActionBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  GROUP_ACTION_H,
  "px-1.5 text-xs font-semibold leading-none tracking-tight",
  "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
].join(" ");

const groupActionTrayClass = [
  "flex w-full items-center gap-1 overflow-visible rounded-full p-1.5",
  "max-[360px]:gap-0.5 max-[360px]:p-1",
  "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
  "backdrop-blur-md",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
].join(" ");

/** Same exclusions as requester / Pair Up / Source Groups drawers. */
const GROUP_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

const GROUP_UP_CREATE_CONTENT_SWIPE_EXCLUDE_SELECTOR =
  GROUP_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR;
const GROUP_UP_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR =
  GROUP_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR;

function focusWithoutScroll(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function blurActiveInput(): void {
  const el = document.activeElement;
  if (
    el instanceof HTMLElement &&
    (el.tagName === "TEXTAREA" || el.tagName === "INPUT")
  ) {
    el.blur();
  }
}

type GroupUpCreatePayload = {
  sourcePostId: string;
  title: string;
  description: string;
  occursAt: string | null;
  occursTimeExplicit: boolean;
};

type EventScheduleChip = {
  primary: string;
  secondary: string;
  hasExplicitTime: boolean;
};

export default function GroupUpActiveOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const overlay = useSyncExternalStore(
    subscribeGroupUpActiveOverlay,
    getGroupUpActiveOverlayState
  );
  const opportunity = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    overlay.postId ? getGroupUpOwnOpportunity(overlay.postId) : null
  );
  const ownStatus = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    overlay.postId ? getGroupUpOwnStatus(overlay.postId) : "idle"
  );
  const discoverableCount = useSyncExternalStore(subscribeGroupUpCount, () =>
    overlay.postId ? getGroupUpDiscoverableCount(overlay.postId) : null
  );

  const postId = overlay.postId;
  const mode = overlay.mode;
  const sheetOpen = Boolean(postId && mode);
  const createOpen = mode === "create";
  const manageOpen = mode === "manage";
  const ownsActive = ownStatus === "active";
  const isEventSource = overlay.sourceSchedule?.postType === "hangout";
  const isPlaceSource = createOpen && !isEventSource;

  const realOpportunity =
    opportunity && isRealGroupUpOpportunityId(opportunity.id)
      ? opportunity
      : null;
  const knownOpportunityId = isRealGroupUpOpportunityId(
    overlay.knownOpportunityId
  )
    ? overlay.knownOpportunityId
    : null;
  const cancelOpportunityId = realOpportunity?.id ?? knownOpportunityId;
  const manageIdentityReady = Boolean(cancelOpportunityId);
  const [manageHydrateBusy, setManageHydrateBusy] = useState(false);
  const [manageHydrateFailed, setManageHydrateFailed] = useState(false);

  const [manageIdentity, setManageIdentity] = useState<GroupManageIdentity>({
    title: null,
    description: null,
    sourceType: null,
    sourceCaption: null,
  });
  const manageSourceType =
    overlay.sourceSchedule?.postType ?? manageIdentity.sourceType;
  /** Place-only schedule editing; Event (and unresolved type) stay read-only. */
  const isPlaceManage = manageOpen && manageSourceType === "experience";

  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createResolving, setCreateResolving] = useState(false);
  const [titleEmphasize, setTitleEmphasize] = useState(false);
  const [descriptionEmphasize, setDescriptionEmphasize] = useState(false);
  const [titlePlaceholderPulse, setTitlePlaceholderPulse] = useState(false);
  const [descPlaceholderPulse, setDescPlaceholderPulse] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleEmphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descEmphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBackdropCloseUntilRef = useRef(0);
  const noteGestureCleanupRef = useRef<(() => void) | null>(null);
  /** Clean-swipe exit: keep hook `active` + stable resetToken until BD unmounts. */
  const [createSwipeExitHold, setCreateSwipeExitHold] = useState(false);
  const createSwipeExitGenerationRef = useRef(0);
  const createSwipeExitCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const createSwipeExitLingerTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const createSwipeExitResetTokenRef = useRef<string | null>(null);
  /** Manage clean-swipe exit: keep hook `active` until BD unmounts. */
  const [manageSwipeExitHold, setManageSwipeExitHold] = useState(false);
  const manageSwipeExitGenerationRef = useRef(0);
  const manageSwipeExitCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const manageSwipeExitLingerTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const manageSwipeExitResetTokenRef = useRef<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const { ensureAuthed } = useAuthActionGate();
  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null
  );
  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen
  );

  /** Event create + manage picker: multi-date PlanScheduleFields shape. */
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [startTime, setStartTime] = useState<CreateFlowStartTime | null>(null);
  const [sourceTimeExplicit, setSourceTimeExplicit] = useState(false);
  /** Place create: FutureDateTimePanel state. */
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<CreateFlowStartTime | null>(
    null
  );
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [panelSegment, setPanelSegment] =
    useState<FutureDateTimeSegment>("date");
  const [dateSurface, setDateSurface] =
    useState<FutureDatePickerSurface>("calendar");
  const [datePulse, setDatePulse] = useState(false);
  const [calendarResetToken, setCalendarResetToken] = useState(0);
  const createPrefillAppliedRef = useRef(false);
  const managePrefillAppliedRef = useRef(false);

  const syncDescriptionHeight = useCallback(() => {
    const el = descriptionInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const contentH = el.scrollHeight;
    const next = Math.min(DESC_MAX_H, Math.max(DESC_MIN_H, contentH));
    el.style.height = `${next}px`;
    el.style.overflowY = contentH > DESC_MAX_H ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (!createOpen || !postId) return;
    setTitleDraft("");
    setDescriptionDraft("");
    setTitleEmphasize(false);
    setDescriptionEmphasize(false);
    setCreateBusy(false);
    setDiscardConfirmOpen(false);
    setSelectedDates([]);
    setStartTime(null);
    setSourceTimeExplicit(false);
    setSelectedDate(null);
    setSelectedTime(null);
    setShowDatePanel(false);
    setPanelSegment("date");
    setDateSurface("calendar");
    setDatePulse(false);
    setCalendarResetToken((n) => n + 1);
    createPrefillAppliedRef.current = false;

    // Sequential required cue: name first, then description (no simultaneous pulse).
    setTitlePlaceholderPulse(false);
    setDescPlaceholderPulse(false);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    if (descPulseTimerRef.current) clearTimeout(descPulseTimerRef.current);
    setTitlePlaceholderPulse(true);
    pulseTimerRef.current = setTimeout(() => {
      setTitlePlaceholderPulse(false);
      pulseTimerRef.current = null;
      setDescPlaceholderPulse(true);
      descPulseTimerRef.current = setTimeout(() => {
        setDescPlaceholderPulse(false);
        descPulseTimerRef.current = null;
      }, 720);
    }, 350);

    return () => {
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
      if (descPulseTimerRef.current) {
        clearTimeout(descPulseTimerRef.current);
        descPulseTimerRef.current = null;
      }
      if (titleEmphTimerRef.current) {
        clearTimeout(titleEmphTimerRef.current);
        titleEmphTimerRef.current = null;
      }
      if (descEmphTimerRef.current) {
        clearTimeout(descEmphTimerRef.current);
        descEmphTimerRef.current = null;
      }
      if (datePulseTimerRef.current) {
        clearTimeout(datePulseTimerRef.current);
        datePulseTimerRef.current = null;
      }
      if (openPanelTimerRef.current) {
        clearTimeout(openPanelTimerRef.current);
        openPanelTimerRef.current = null;
      }
      noteGestureCleanupRef.current?.();
      noteGestureCleanupRef.current = null;
    };
  }, [createOpen, postId]);

  useEffect(() => {
    if (!createOpen || !postId || createPrefillAppliedRef.current) return;
    createPrefillAppliedRef.current = true;

    const sourceSchedule = overlay.sourceSchedule;
    if (!sourceSchedule || sourceSchedule.postType !== "hangout") return;

    const prefill = deriveGroupUpSchedulePrefill(sourceSchedule);
    if (prefill.selectedDates.length === 0) return;

    // Event create: keep null startTime when sourceTimeExplicit=false (no 19:00 default).
    setSelectedDates(prefill.selectedDates);
    setStartTime(prefill.startTime);
    setSourceTimeExplicit(prefill.sourceTimeExplicit);
  }, [createOpen, postId, overlay.sourceSchedule]);

  useEffect(() => {
    if (!manageOpen) {
      managePrefillAppliedRef.current = false;
      return;
    }
    if (managePrefillAppliedRef.current) return;
    managePrefillAppliedRef.current = true;

    const prefill = deriveGroupUpScheduleFromOccursAt(
      opportunity?.occurs_at ?? null,
      opportunity?.occurs_time_explicit !== false
    );
    if (prefill.selectedDates.length > 0) {
      setSelectedDates(prefill.selectedDates);
      setStartTime(prefill.startTime);
      setSourceTimeExplicit(prefill.sourceTimeExplicit);
      setSelectedDate(prefill.selectedDates[0] ?? null);
      setSelectedTime(
        prefill.sourceTimeExplicit ? prefill.startTime : null
      );
    } else {
      setSelectedDates([]);
      setStartTime(CREATE_FLOW_DEFAULT_START_TIME);
      setSourceTimeExplicit(false);
      setSelectedDate(null);
      setSelectedTime(null);
    }
    setCalendarResetToken((n) => n + 1);
  }, [
    manageOpen,
    opportunity?.occurs_at,
    opportunity?.occurs_time_explicit,
    opportunity?.id,
  ]);

  useEffect(() => {
    if (!manageOpen || !postId) {
      setManageIdentity({
        title: null,
        description: null,
        sourceType: null,
        sourceCaption: null,
      });
      return;
    }

    const cached = resolveGroupManageIdentityFromCache({
      sourcePostId: postId,
      opportunityId: opportunity?.id ?? null,
      opportunityDescription: opportunity?.description ?? null,
      overlayCaption: overlay.sourceCaption,
      overlayPostType: overlay.sourceSchedule?.postType ?? null,
    });
    setManageIdentity(cached);

    const conversationId = opportunity?.conversation_id;
    if (
      !conversationId ||
      (cached.title && cached.sourceType)
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const state = await getMyGroupUpForConversation(conversationId);
        if (cancelled) return;
        setManageIdentity((prev) =>
          mergeGroupManageIdentityFromConversation({
            base: prev,
            conversationTitle: state.conversationTitle,
            conversationDescription: state.conversationDescription,
            sourceContext: state.sourceContext,
          })
        );
      } catch {
        /* keep cache-resolved identity */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    manageOpen,
    postId,
    opportunity?.id,
    opportunity?.conversation_id,
    opportunity?.description,
    overlay.sourceCaption,
    overlay.sourceSchedule?.postType,
  ]);

  /** Resolve a real opportunity before Cancel is enabled (Profile may open with id hint only). */
  useEffect(() => {
    if (!manageOpen || !postId) {
      setManageHydrateBusy(false);
      setManageHydrateFailed(false);
      return;
    }
    if (realOpportunity) {
      setManageHydrateBusy(false);
      setManageHydrateFailed(false);
      return;
    }

    let cancelled = false;
    setManageHydrateBusy(true);
    setManageHydrateFailed(false);
    requestGroupUpOwnState(postId);
    void (async () => {
      try {
        await getMyGroupUpsForSources([postId], { bypassCache: true });
        if (cancelled) return;
        setManageHydrateBusy(false);
        const next = getGroupUpOwnOpportunity(postId);
        if (!next || !isRealGroupUpOpportunityId(next.id)) {
          setManageHydrateFailed(true);
        }
      } catch {
        if (cancelled) return;
        setManageHydrateBusy(false);
        setManageHydrateFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manageOpen, postId, realOpportunity]);

  useLayoutEffect(() => {
    if (!createOpen) return;
    syncDescriptionHeight();
  }, [createOpen, descriptionDraft, syncDescriptionHeight]);

  const createSchedule = useMemo(() => {
    if (!createOpen) return null;
    if (isEventSource) {
      const day = selectedDates[0] ?? null;
      const time = sourceTimeExplicit ? startTime : null;
      return buildSocialCreateSchedule(day, time);
    }
    return buildSocialCreateSchedule(selectedDate, selectedTime);
  }, [
    createOpen,
    isEventSource,
    selectedDates,
    sourceTimeExplicit,
    startTime,
    selectedDate,
    selectedTime,
  ]);

  const manageSchedule = useMemo(() => {
    if (!manageOpen || !isPlaceManage) return null;
    return buildSocialCreateSchedule(selectedDate, selectedTime);
  }, [manageOpen, isPlaceManage, selectedDate, selectedTime]);

  const isPastSchedule = createOpen
    ? createSchedule != null && createSchedule.occursAt.getTime() <= Date.now()
    : manageSchedule != null && manageSchedule.occursAt.getTime() <= Date.now();

  const trimmedTitle = titleDraft.trim();
  const trimmedDescription = descriptionDraft.trim();
  const titleValid = trimmedTitle.length > 0;
  const descriptionValid = trimmedDescription.length > 0;
  const createInteractionLocked =
    createBusy || createResolving || photoPromptOpen;

  const createDraftDirty = isGroupCreateDraftDirty({
    titleDraft,
    descriptionDraft,
    selectedDate: isPlaceSource ? selectedDate : null,
    selectedTime: isPlaceSource ? selectedTime : null,
  });

  const eventScheduleChip = useMemo((): EventScheduleChip | null => {
    if (!createOpen || !isEventSource) return null;
    const day = selectedDates[0];
    if (!day || Number.isNaN(day.getTime())) return null;
    const primary = formatPlaceDuoRelativeDayLabel(day);
    const exact = formatPlaceDuoExactDayLabel(day);
    if (sourceTimeExplicit && startTime) {
      return {
        primary,
        secondary: `${exact} · ${formatCreateFlowStartTimeCompact(startTime)}`,
        hasExplicitTime: true,
      };
    }
    return {
      primary,
      secondary: exact,
      hasExplicitTime: false,
    };
  }, [
    createOpen,
    isEventSource,
    selectedDates,
    sourceTimeExplicit,
    startTime,
  ]);

  const placeComposeSummary =
    isPlaceSource && selectedDate
      ? formatPlaceDuoScheduleSummary(selectedDate, selectedTime)
      : null;

  const manageScheduleChip = useMemo((): EventScheduleChip | null => {
    if (!manageOpen) return null;
    if (isPlaceManage && selectedDate) {
      return formatPlaceDuoScheduleSummary(selectedDate, selectedTime);
    }
    if (!opportunity?.occurs_at) return null;
    const prefill = deriveGroupUpScheduleFromOccursAt(
      opportunity.occurs_at,
      opportunity.occurs_time_explicit !== false
    );
    const day = prefill.selectedDates[0];
    if (!day) return null;
    return formatPlaceDuoScheduleSummary(day, prefill.startTime);
  }, [
    manageOpen,
    isPlaceManage,
    selectedDate,
    selectedTime,
    opportunity?.occurs_at,
    opportunity?.occurs_time_explicit,
  ]);

  const pulseTitleRequired = useCallback(() => {
    setTitleEmphasize(true);
    if (titleEmphTimerRef.current) clearTimeout(titleEmphTimerRef.current);
    titleEmphTimerRef.current = setTimeout(() => {
      setTitleEmphasize(false);
      titleEmphTimerRef.current = null;
    }, 900);
    const el = titleInputRef.current;
    if (el) focusWithoutScroll(el);
  }, []);

  const pulseDescriptionRequired = useCallback(() => {
    setDescriptionEmphasize(true);
    if (descEmphTimerRef.current) clearTimeout(descEmphTimerRef.current);
    descEmphTimerRef.current = setTimeout(() => {
      setDescriptionEmphasize(false);
      descEmphTimerRef.current = null;
    }, 900);
    const el = descriptionInputRef.current;
    if (el) focusWithoutScroll(el);
  }, []);

  const openSchedulePanel = useCallback(
    (segment: FutureDateTimeSegment = "date") => {
      blurActiveInput();
      if (openPanelTimerRef.current) clearTimeout(openPanelTimerRef.current);
      openPanelTimerRef.current = setTimeout(() => {
        setPanelSegment(segment);
        if (segment === "date") setDateSurface("calendar");
        setShowDatePanel(true);
        openPanelTimerRef.current = null;
      }, 160);
    },
    []
  );

  const pulseDateTime = useCallback(() => {
    setDatePulse(true);
    if (datePulseTimerRef.current) clearTimeout(datePulseTimerRef.current);
    datePulseTimerRef.current = setTimeout(() => {
      setDatePulse(false);
      datePulseTimerRef.current = null;
    }, 900);
    openSchedulePanel("date");
  }, [openSchedulePanel]);

  const requestCreateClose = useCallback(() => {
    const plan = resolveComposeCreateDismissRequest({
      createOpen,
      discardConfirmOpen,
      dirty: createDraftDirty,
      busy: createInteractionLocked,
    });
    switch (plan.kind) {
      case "noop-busy":
      case "noop-confirm-open":
        return;
      case "open-discard-confirm":
        setDiscardConfirmOpen(true);
        return;
      case "close-overlay":
        setDiscardConfirmOpen(false);
        closeGroupUpOverlay();
        return;
      default:
        return;
    }
  }, [
    createDraftDirty,
    createInteractionLocked,
    createOpen,
    discardConfirmOpen,
  ]);
  const requestCreateCloseRef = useRef(requestCreateClose);
  requestCreateCloseRef.current = requestCreateClose;

  const clearCreateSwipeExitTimers = useCallback(() => {
    if (createSwipeExitCloseTimerRef.current) {
      clearTimeout(createSwipeExitCloseTimerRef.current);
      createSwipeExitCloseTimerRef.current = null;
    }
    if (createSwipeExitLingerTimerRef.current) {
      clearTimeout(createSwipeExitLingerTimerRef.current);
      createSwipeExitLingerTimerRef.current = null;
    }
  }, []);

  const abortCreateSwipeExitHold = useCallback(() => {
    createSwipeExitGenerationRef.current += 1;
    clearCreateSwipeExitTimers();
    createSwipeExitResetTokenRef.current = null;
    setCreateSwipeExitHold(false);
  }, [clearCreateSwipeExitTimers]);

  // Reopen / remount create: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!createOpen) return;
    abortCreateSwipeExitHold();
  }, [createOpen, abortCreateSwipeExitHold]);

  useEffect(() => {
    return () => {
      createSwipeExitGenerationRef.current += 1;
      clearCreateSwipeExitTimers();
    };
  }, [clearCreateSwipeExitTimers]);

  const createSheetVisible = sheetOpen && createOpen;
  /**
   * Block create swipe while locked, discard confirm open, date panel open,
   * or a clean-swipe exit is already in progress.
   */
  const createSwipeBlocked =
    !createSheetVisible ||
    createInteractionLocked ||
    discardConfirmOpen ||
    showDatePanel ||
    createSwipeExitHold;

  const handleCreateSwipeCommit = useCallback(() => {
    // Same dismiss planner as backdrop / Cancel — never closeGroupUpOverlay() directly.
    const plan = resolveComposeCreateDismissRequest({
      createOpen,
      discardConfirmOpen,
      dirty: createDraftDirty,
      busy: createInteractionLocked,
    });
    switch (plan.kind) {
      case "noop-busy":
      case "noop-confirm-open":
        return;
      case "open-discard-confirm":
        // Dirty: open confirm immediately; resetToken snaps drawer back under it.
        requestCreateCloseRef.current();
        return;
      case "close-overlay": {
        // Clean: keep hook active through exit translate + BD delayed unmount.
        if (createSwipeExitHold) return;
        const generation = createSwipeExitGenerationRef.current + 1;
        createSwipeExitGenerationRef.current = generation;
        createSwipeExitResetTokenRef.current = `${postId ?? "none"}:edit`;
        setCreateSwipeExitHold(true);
        clearCreateSwipeExitTimers();
        createSwipeExitCloseTimerRef.current = setTimeout(() => {
          createSwipeExitCloseTimerRef.current = null;
          if (createSwipeExitGenerationRef.current !== generation) return;
          requestCreateCloseRef.current();
          createSwipeExitLingerTimerRef.current = setTimeout(() => {
            createSwipeExitLingerTimerRef.current = null;
            if (createSwipeExitGenerationRef.current !== generation) return;
            createSwipeExitResetTokenRef.current = null;
            setCreateSwipeExitHold(false);
          }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
        }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
        return;
      }
      default:
        return;
    }
  }, [
    clearCreateSwipeExitTimers,
    createDraftDirty,
    createInteractionLocked,
    createOpen,
    createSwipeExitHold,
    discardConfirmOpen,
    postId,
  ]);

  const createSwipeHookActive = createSheetVisible || createSwipeExitHold;
  const createSwipeResetToken = createSwipeExitHold
    ? createSwipeExitResetTokenRef.current
    : createSheetVisible
      ? `${postId ?? "none"}:${discardConfirmOpen ? "discard" : "edit"}`
      : null;

  const {
    panelSwipeProps: createPanelSwipeProps,
    contentSwipeMotionStyle: createContentSwipeMotionStyle,
  } = useOverlayContentSwipeDismiss({
    active: createSwipeHookActive,
    engageSwipe: createSheetVisible && !createSwipeBlocked,
    gestureDisabled: createSwipeBlocked,
    startZoneMaxXVw: 1,
    startZoneMaxPx: 10000,
    leftInsetPx: 0,
    excludeSelector: GROUP_UP_CREATE_CONTENT_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: false,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: handleCreateSwipeCommit,
    // Flip when discard opens so exit translate snaps back under the confirm.
    // Frozen while clean-swipe exit hold is active so store clear does not reset.
    resetToken: createSwipeResetToken,
  });

  const createOverlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(createContentSwipeMotionStyle ?? {}),
  };

  const onCreateOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>
  ) => {
    createPanelSwipeProps.onPointerDownCapture(e);
  };

  const clearManageSwipeExitTimers = useCallback(() => {
    if (manageSwipeExitCloseTimerRef.current) {
      clearTimeout(manageSwipeExitCloseTimerRef.current);
      manageSwipeExitCloseTimerRef.current = null;
    }
    if (manageSwipeExitLingerTimerRef.current) {
      clearTimeout(manageSwipeExitLingerTimerRef.current);
      manageSwipeExitLingerTimerRef.current = null;
    }
  }, []);

  const abortManageSwipeExitHold = useCallback(() => {
    manageSwipeExitGenerationRef.current += 1;
    clearManageSwipeExitTimers();
    manageSwipeExitResetTokenRef.current = null;
    setManageSwipeExitHold(false);
  }, [clearManageSwipeExitTimers]);

  // Reopen / remount manage: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!manageOpen) return;
    abortManageSwipeExitHold();
  }, [manageOpen, abortManageSwipeExitHold]);

  useEffect(() => {
    return () => {
      manageSwipeExitGenerationRef.current += 1;
      clearManageSwipeExitTimers();
    };
  }, [clearManageSwipeExitTimers]);

  /**
   * Same path as manage BottomDrawer backdrop / Close:
   * date panel open → collapse first; otherwise close overlay (never cancel group).
   */
  const requestManageClose = useCallback(() => {
    if (showDatePanel) {
      setShowDatePanel(false);
      return;
    }
    if (cancelBusy || scheduleBusy) return;
    closeGroupUpOverlay();
  }, [cancelBusy, scheduleBusy, showDatePanel]);
  const requestManageCloseRef = useRef(requestManageClose);
  requestManageCloseRef.current = requestManageClose;

  const manageSheetVisible = sheetOpen && manageOpen;
  const cancelConfirmOpen = Boolean(overlay.cancelConfirmOpen && manageOpen);
  const manageSwipeBlocked =
    !manageSheetVisible ||
    cancelBusy ||
    scheduleBusy ||
    cancelConfirmOpen ||
    showDatePanel ||
    photoPromptOpen ||
    manageSwipeExitHold;

  const handleManageSwipeCommit = useCallback(() => {
    // Same as manage Close / backdrop final close — never cancel or mutate group.
    if (
      cancelBusy ||
      scheduleBusy ||
      overlay.cancelConfirmOpen ||
      showDatePanel ||
      photoPromptOpen
    ) {
      return;
    }
    if (manageSwipeExitHold) return;
    const generation = manageSwipeExitGenerationRef.current + 1;
    manageSwipeExitGenerationRef.current = generation;
    manageSwipeExitResetTokenRef.current = postId ?? "none";
    setManageSwipeExitHold(true);
    clearManageSwipeExitTimers();
    manageSwipeExitCloseTimerRef.current = setTimeout(() => {
      manageSwipeExitCloseTimerRef.current = null;
      if (manageSwipeExitGenerationRef.current !== generation) return;
      // Swipe is blocked while date panel is open, so this always closes.
      requestManageCloseRef.current();
      manageSwipeExitLingerTimerRef.current = setTimeout(() => {
        manageSwipeExitLingerTimerRef.current = null;
        if (manageSwipeExitGenerationRef.current !== generation) return;
        manageSwipeExitResetTokenRef.current = null;
        setManageSwipeExitHold(false);
      }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
    }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
  }, [
    cancelBusy,
    clearManageSwipeExitTimers,
    manageSwipeExitHold,
    overlay.cancelConfirmOpen,
    photoPromptOpen,
    postId,
    scheduleBusy,
    showDatePanel,
  ]);

  const manageSwipeHookActive = manageSheetVisible || manageSwipeExitHold;
  const manageSwipeResetToken = manageSwipeExitHold
    ? manageSwipeExitResetTokenRef.current
    : manageSheetVisible
      ? postId
      : null;

  const {
    panelSwipeProps: managePanelSwipeProps,
    contentSwipeMotionStyle: manageContentSwipeMotionStyle,
  } = useOverlayContentSwipeDismiss({
    active: manageSwipeHookActive,
    engageSwipe: manageSheetVisible && !manageSwipeBlocked,
    gestureDisabled: manageSwipeBlocked,
    startZoneMaxXVw: 1,
    startZoneMaxPx: 10000,
    leftInsetPx: 0,
    excludeSelector: GROUP_UP_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: false,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: handleManageSwipeCommit,
    resetToken: manageSwipeResetToken,
  });

  const manageOverlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(manageContentSwipeMotionStyle ?? {}),
  };

  const onManageOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>
  ) => {
    managePanelSwipeProps.onPointerDownCapture(e);
  };

  const applyCreateBackPlan = useCallback(() => {
    if (shouldSuppressUnderlyingBackForPhotoPrompt()) return;

    // Routed conversation sits above Manage — DirectMessagePage owns Back.
    if (isMessagesConversationPath(location.pathname)) return;

    if (manageOpen) {
      if (cancelBusy) return;
      closeGroupUpOverlayTop();
      return;
    }
    if (!createOpen) {
      closeGroupUpOverlayTop();
      return;
    }

    const keyboardEditableFocused = blurActiveEditableFirst();
    const plan = resolveComposeCreateBackAction({
      createOpen: true,
      discardConfirmOpen,
      dirty: createDraftDirty,
      keyboardEditableFocused,
      busy: createInteractionLocked,
    });

    switch (plan.kind) {
      case "noop-busy":
      case "blur-keyboard":
        return;
      case "dismiss-discard-confirm":
        setDiscardConfirmOpen(false);
        return;
      case "open-discard-confirm":
        setDiscardConfirmOpen(true);
        return;
      case "close-overlay":
        setDiscardConfirmOpen(false);
        closeGroupUpOverlay();
        return;
      default:
        return;
    }
  }, [
    cancelBusy,
    createDraftDirty,
    createInteractionLocked,
    createOpen,
    discardConfirmOpen,
    location.pathname,
    manageOpen,
  ]);

  const stackOpen = isGroupUpActiveOverlayStackOpen(overlay);

  useEffect(() => {
    if (!stackOpen) return;
    return subscribeAndroidHardwareBack(() => {
      applyCreateBackPlan();
    });
  }, [stackOpen, applyCreateBackPlan]);

  const proceedCreate = useCallback(async (payload: GroupUpCreatePayload) => {
    setCreateBusy(true);
    try {
      await createGroupUp({
        sourcePostId: payload.sourcePostId,
        title: payload.title,
        description: payload.description,
        occursAt: payload.occursAt,
        occursTimeExplicit: payload.occursTimeExplicit,
      });
      toast.success(peopleUiCopy.groupUpCreateSuccess);
      closeGroupUpOverlay();
    } catch {
      toast.error(peopleUiCopy.groupUpCreateError);
    } finally {
      setCreateBusy(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!postId || createResolving || photoPromptOpen || createBusy) return;

    if (trimmedTitle.length === 0) {
      pulseTitleRequired();
      return;
    }
    if (trimmedDescription.length === 0) {
      pulseDescriptionRequired();
      return;
    }
    if (
      trimmedTitle.length > GROUP_UP_TITLE_MAX ||
      trimmedDescription.length > GROUP_UP_DESCRIPTION_MAX
    ) {
      return;
    }

    if (isPlaceSource) {
      if (!selectedDate || !createSchedule || isPastSchedule) {
        pulseDateTime();
        return;
      }
    } else if (isPastSchedule) {
      toast.error(peopleUiCopy.groupUpPastError);
      return;
    }

    const payload: GroupUpCreatePayload = {
      sourcePostId: postId,
      title: trimmedTitle,
      description: trimmedDescription,
      occursAt: createSchedule?.occursAt.toISOString() ?? null,
      occursTimeExplicit: createSchedule?.occursTimeExplicit ?? true,
    };

    if (!ensureAuthed()) return;

    const userId = authUserId;
    if (!userId) return;

    if (isPeoplePhotoPromptBypassed()) {
      await proceedCreate(payload);
      return;
    }

    setCreateResolving(true);
    try {
      const profile = resolvePhotoPromptOffer(userId, "group_up_create", false);
      if (!profile) {
        await proceedCreate(payload);
        return;
      }

      const opened = openPairUpPhotoPrompt({
        intentKey: `group-up-create:${postId}`,
        profileId: profile.profileId,
        userId: profile.userId,
        photos: profile.photos,
        title: GROUP_UP_CREATE_PHOTO_PROMPT_TITLE,
        description: GROUP_UP_CREATE_PHOTO_PROMPT_DESCRIPTION,
        onContinue: () => {
          void proceedCreate(payload);
        },
      });
      if (!opened) {
        /* Another participation intent already owns the singleton prompt. */
        return;
      }
    } finally {
      setCreateResolving(false);
    }
  };

  const handleDiscardCreate = () => {
    setDiscardConfirmOpen(false);
    void handleCreate();
  };

  const handleDiscardExit = () => {
    setDiscardConfirmOpen(false);
    closeGroupUpOverlay();
  };

  const handleManageScheduleDone = async () => {
    const opp = opportunity;
    if (!manageOpen || !isPlaceManage) {
      setShowDatePanel(false);
      return;
    }
    if (!opp?.id || scheduleBusy) return;
    if (!selectedDate) {
      pulseDateTime();
      return;
    }
    const schedule = buildSocialCreateSchedule(selectedDate, selectedTime);
    if (!schedule || schedule.occursAt.getTime() <= Date.now()) {
      toast.error(peopleUiCopy.groupUpPastError);
      return;
    }

    const nextIso = schedule.occursAt.toISOString();
    const nextExplicit = schedule.occursTimeExplicit;
    const prevIso = opportunity?.occurs_at ?? null;
    const prevExplicit = opportunity?.occurs_time_explicit !== false;
    if (
      prevIso === nextIso &&
      (prevIso == null || prevExplicit === nextExplicit)
    ) {
      setShowDatePanel(false);
      return;
    }

    setScheduleBusy(true);
    try {
      await updateGroupUpSchedule({
        opportunityId: opp.id,
        occursAt: nextIso,
        occursTimeExplicit: nextExplicit,
      });
      setSelectedDates([selectedDate]);
      setStartTime(selectedTime);
      setSourceTimeExplicit(nextExplicit);
      setShowDatePanel(false);
      toast.success(peopleUiCopy.groupUpScheduleUpdateSuccess);
    } catch {
      toast.error(peopleUiCopy.groupUpScheduleUpdateError);
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleCancelConfirm = async () => {
    const cancelId = cancelOpportunityId;
    if (!cancelId || !isRealGroupUpOpportunityId(cancelId)) {
      toast.error(peopleUiCopy.groupUpCancelError);
      return;
    }

    const sourcePostId = realOpportunity?.source_post_id ?? postId ?? "";
    if (!sourcePostId) {
      toast.error(peopleUiCopy.groupUpCancelError);
      return;
    }

    setCancelBusy(true);
    const revert = setOptimisticGroupUpOwnState(sourcePostId, null);
    try {
      await cancelGroupUp(cancelId);
      toast.success(peopleUiCopy.groupUpCancelSuccess);
      closeGroupUpOverlay();
    } catch {
      revert?.();
      toast.error(peopleUiCopy.groupUpCancelError);
    } finally {
      setCancelBusy(false);
    }
  };

  /**
   * Field tap while Place schedule panel is open: defer collapse so the same
   * gesture cannot retarget onto the backdrop and close the drawer.
   */
  const collapsePlacePanelThenFocus = (
    e: ReactPointerEvent<HTMLElement>,
    el: HTMLElement
  ) => {
    if (!isPlaceSource || !showDatePanel) return false;
    e.preventDefault();
    noteGestureCleanupRef.current?.();
    ignoreBackdropCloseUntilRef.current = Date.now() + 450;

    const finish = () => {
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      noteGestureCleanupRef.current = null;
      setShowDatePanel(false);
      requestAnimationFrame(() => {
        focusWithoutScroll(el);
      });
    };

    noteGestureCleanupRef.current = () => {
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    return true;
  };

  const handleTitlePointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (createInteractionLocked) return;
    const el = e.currentTarget;
    if (collapsePlacePanelThenFocus(e, el)) return;
  };

  const handleDescriptionPointerDown = (
    e: ReactPointerEvent<HTMLTextAreaElement>
  ) => {
    if (createInteractionLocked) return;
    const el = e.currentTarget;
    if (collapsePlacePanelThenFocus(e, el)) return;
    if (document.activeElement === el) return;
    e.preventDefault();
    focusWithoutScroll(el);
  };

  const sourceCaption = overlay.sourceCaption?.trim() || null;
  const dateTimeActive = showDatePanel;
  const needsDate = isPlaceSource && selectedDate == null;

  const createPrimaryExtrusion = [
    "pointer-events-none absolute inset-0 z-0 rounded-full",
    "translate-x-[-2.5px] translate-y-[2.5px]",
    "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
    "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
  ].join(" ");

  const createPrimaryFace = [
    "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
    "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
    "bg-[var(--brand)] text-[var(--brand-ink)]",
    "px-1.5 text-xs font-semibold leading-none tracking-tight",
    "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
    "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
    "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
    "motion-safe:group-active/social:duration-75",
  ].join(" ");

  const dateTimeExtrusionClass = dateTimeActive
    ? [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[var(--green-text)]",
        "app-dark:bg-[color-mix(in_oklab,var(--green-text)_88%,#0a0a0a)]",
      ].join(" ")
    : [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
        "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
      ].join(" ");

  const dateTimeFaceClass = [
    "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
    "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
    "bg-[var(--text)] text-[var(--bg)]",
    "px-1.5 text-xs font-semibold leading-none tracking-tight",
    "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
    "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
    "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
    "motion-safe:group-active/social:duration-75",
  ].join(" ");

  const scheduleChip = (chip: {
    primary: string;
    secondary: string;
    hasExplicitTime: boolean;
  }) => (
    <div
      className={[
        "inline-flex max-w-full min-h-[40px] w-fit items-center gap-1.5",
        "rounded-full",
        "border border-[color-mix(in_oklab,var(--border)_36%,transparent)]",
        "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
        "py-1 pl-1 pr-5",
        "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
        "app-dark:border-[color-mix(in_oklab,white_10%,transparent)]",
        "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
        "app-dark:shadow-[0_1px_3px_rgba(0,0,0,0.28)]",
      ].join(" ")}
      aria-live="polite"
    >
      <span
        className={[
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          "border border-[color-mix(in_oklab,var(--brand)_48%,transparent)]",
          "bg-[color-mix(in_oklab,var(--brand)_82%,var(--bg))]",
          "text-[var(--brand-ink)]",
          "app-dark:bg-[color-mix(in_oklab,var(--brand)_88%,#1a1a1a)]",
          "app-dark:border-[color-mix(in_oklab,var(--brand)_58%,transparent)]",
        ].join(" ")}
        aria-hidden
      >
        {chip.hasExplicitTime ? (
          <PiClock className="h-3.5 w-3.5" />
        ) : (
          <PiCalendarBlank className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 max-w-[min(100%,14.5rem)] leading-tight sm:max-w-[16.5rem]">
        <span className="block truncate text-xs font-semibold tracking-tight text-[var(--text)]">
          {chip.primary}
        </span>
        <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--text)]/68">
          {chip.secondary}
        </span>
      </span>
    </div>
  );

  const seeGroupsCount = computeSeeOtherGroupsCount(
    discoverableCount,
    ownsActive || manageOpen
  );
  const manageUtility = resolveGroupManageUtilityActions(seeGroupsCount);

  const openSeeOtherGroups = () => {
    if (!postId) return;
    openSourceGroupsOverlay(
      postId,
      overlay.sourceCaption ?? manageIdentity.sourceCaption,
      overlay.sourceSchedule
    );
  };

  /** Create-only: See groups chip above the composer box. */
  const seeGroupsControl =
    createOpen && postId && seeGroupsCount > 0 ? (
      <button
        type="button"
        onClick={openSeeOtherGroups}
        className={[
          "mx-auto mb-2 flex h-9 w-fit max-w-full items-center gap-2 rounded-full px-3",
          "border border-[var(--border)]/55",
          "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
          "backdrop-blur-md",
          "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
          "text-[12px] font-semibold text-[var(--text)]/75",
          "motion-safe:active:scale-[0.98]",
        ].join(" ")}
        data-group-see-groups
      >
        <PiUsersThree className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">{socialUiCopy.groupSeeGroups}</span>
        <span
          className={[
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            "bg-[var(--text)] text-[var(--bg)]",
            "text-[11px] font-bold tabular-nums leading-none",
            seeGroupsCount > 9 ? "min-w-5 w-auto px-1.5" : "",
          ].join(" ")}
          aria-hidden
        >
          {seeGroupsCount}
        </span>
      </button>
    ) : null;

  /** Manage: See other groups (pill) + Cancel group (red text only). */
  const manageUtilityRow = manageOpen ? (
    <div
      className="mx-auto mb-2 flex w-fit max-w-full items-center justify-center gap-3"
      data-group-manage-utility
    >
      {manageUtility.showSeeOtherGroups ? (
        <button
          type="button"
          onClick={openSeeOtherGroups}
          className={[
            "inline-flex h-9 max-w-[min(100%,12rem)] items-center gap-1.5 rounded-full px-3",
            "border border-[var(--border)]/55",
            "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
            "backdrop-blur-md",
            "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
            "text-[12px] font-semibold text-[var(--text)]/75",
            "motion-safe:active:opacity-80",
          ].join(" ")}
          data-group-see-groups
        >
          <PiUsersThree className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 truncate">
            {socialUiCopy.groupSeeOtherGroups}
          </span>
          <span
            className={[
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              "bg-[var(--text)] text-[var(--bg)]",
              "text-[11px] font-bold tabular-nums leading-none",
              seeGroupsCount > 9 ? "min-w-5 w-auto px-1.5" : "",
            ].join(" ")}
            aria-hidden
          >
            {seeGroupsCount}
          </span>
        </button>
      ) : null}
      {manageUtility.showCancelGroup ? (
        <button
          type="button"
          onClick={() => {
            if (!manageIdentityReady) {
              if (manageHydrateBusy) return;
              if (manageHydrateFailed && postId) {
                setManageHydrateBusy(true);
                setManageHydrateFailed(false);
                void getMyGroupUpsForSources([postId], { bypassCache: true })
                  .then(() => {
                    const next = getGroupUpOwnOpportunity(postId);
                    if (next && isRealGroupUpOpportunityId(next.id)) {
                      openGroupUpCancelConfirm();
                    } else {
                      setManageHydrateFailed(true);
                      toast.error(peopleUiCopy.groupUpCancelError);
                    }
                  })
                  .catch(() => {
                    setManageHydrateFailed(true);
                    toast.error(peopleUiCopy.groupUpCancelError);
                  })
                  .finally(() => setManageHydrateBusy(false));
                return;
              }
              toast.error(peopleUiCopy.groupUpCancelError);
              return;
            }
            openGroupUpCancelConfirm();
          }}
          disabled={(!manageIdentityReady && manageHydrateBusy) || cancelBusy}
          aria-busy={(!manageIdentityReady && manageHydrateBusy) || cancelBusy}
          className={[
            "inline-flex min-h-9 items-center px-2 py-2",
            "bg-transparent text-[12px] font-semibold",
            "text-red-600 dark:text-red-400",
            "motion-safe:active:opacity-70",
            (!manageIdentityReady && manageHydrateBusy) || cancelBusy
              ? "opacity-50"
              : "",
          ].join(" ")}
          data-group-cancel
        >
          {!manageIdentityReady && manageHydrateBusy
            ? "…"
            : peopleUiCopy.groupUpCancelCta}
        </button>
      ) : null}
    </div>
  ) : null;

  const createPanel = (
    <div
      data-group-up-create-swipe-panel
      className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative flex flex-col gap-2 px-3 pb-3 pt-3 sm:px-4">
        {isPlaceSource && showDatePanel ? (
          <div className="flex w-full min-w-0 flex-col gap-2 py-1">
            <FutureDateTimePanel
              selectedDate={selectedDate}
              onSelectedDateChange={setSelectedDate}
              selectedTime={selectedTime}
              onSelectedTimeChange={setSelectedTime}
              active={createOpen && showDatePanel}
              calendarResetToken={calendarResetToken}
              segment={panelSegment}
              onSegmentChange={setPanelSegment}
              dateSurface={dateSurface}
              onDateSurfaceChange={setDateSurface}
              onDone={() => setShowDatePanel(false)}
            />
          </div>
        ) : null}

        {sourceCaption ? (
          <p className="truncate px-1 text-[12px] font-medium text-[var(--text)]/45">
            {sourceCaption}
          </p>
        ) : null}

        <div className="relative flex flex-col">
          <div className="relative flex min-w-0 items-center gap-1 px-1">
            <input
              id="group-up-name"
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              maxLength={GROUP_UP_TITLE_MAX}
              onChange={(e) => {
                setTitleDraft(e.target.value);
                if (titleEmphasize) setTitleEmphasize(false);
              }}
              onPointerDown={handleTitlePointerDown}
              placeholder={peopleUiCopy.groupUpNamePlaceholder}
              disabled={createInteractionLocked}
              autoFocus={false}
              aria-required
              aria-invalid={titleEmphasize && !titleValid}
              className={[
                "min-w-0 flex-1 border-0 bg-transparent",
                "py-1 text-base font-semibold leading-snug text-[var(--text)]",
                "outline-none ring-0 placeholder:font-semibold",
                "placeholder:text-[var(--text)]/42",
                "focus:outline-none focus:ring-0",
                titleEmphasize || titlePlaceholderPulse
                  ? "duo-note-canvas--placeholder-pulse"
                  : "",
              ].join(" ")}
            />
            {!titleValid ? (
              <span
                className={[
                  "shrink-0 text-sm font-semibold leading-none",
                  titleEmphasize || titlePlaceholderPulse
                    ? "text-[color-mix(in_oklab,var(--brand)_88%,#f5c542)]"
                    : "text-[var(--text)]/35",
                  titleEmphasize || titlePlaceholderPulse
                    ? "duo-note-guide--pulse"
                    : "",
                ].join(" ")}
                aria-hidden
              >
                *
              </span>
            ) : null}
          </div>

          <div
            className="mx-1 my-1.5 h-px bg-[color-mix(in_oklab,var(--border)_55%,transparent)] app-dark:bg-[color-mix(in_oklab,white_12%,transparent)]"
            aria-hidden
          />

          <div className="relative px-1">
            <div className="relative">
              <textarea
                id="group-up-description"
                ref={descriptionInputRef}
                value={descriptionDraft}
                maxLength={GROUP_UP_DESCRIPTION_MAX}
                onChange={(e) => {
                  setDescriptionDraft(e.target.value);
                  if (descriptionEmphasize) setDescriptionEmphasize(false);
                }}
                onPointerDown={handleDescriptionPointerDown}
                placeholder={peopleUiCopy.groupUpDescriptionPlaceholder}
                disabled={createInteractionLocked}
                rows={DESC_MIN_LINES}
                autoFocus={false}
                aria-required
                aria-invalid={descriptionEmphasize && !descriptionValid}
                data-duo-note-canvas
                className={[
                  "duo-note-canvas relative z-0 w-full resize-none border-0 bg-transparent",
                  "pr-5 py-1 text-base leading-relaxed text-[var(--text)]",
                  "outline-none ring-0 placeholder:text-[var(--text)]/42",
                  "focus:outline-none focus:ring-0",
                  "overscroll-contain touch-pan-y",
                  descriptionEmphasize || descPlaceholderPulse
                    ? "duo-note-canvas--placeholder-pulse"
                    : "",
                ].join(" ")}
                style={{
                  minHeight: DESC_MIN_H,
                  maxHeight: DESC_MAX_H,
                  overflowY: "hidden",
                }}
              />
              {!descriptionValid ? (
                <span
                  className={[
                    "pointer-events-none absolute right-0 top-1.5",
                    "text-sm font-semibold leading-none",
                    descriptionEmphasize || descPlaceholderPulse
                      ? "text-[color-mix(in_oklab,var(--brand)_88%,#f5c542)]"
                      : "text-[var(--text)]/35",
                    descriptionEmphasize || descPlaceholderPulse
                      ? "duo-note-guide--pulse"
                      : "",
                  ].join(" ")}
                  aria-hidden
                >
                  *
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {eventScheduleChip ? scheduleChip(eventScheduleChip) : null}
        {placeComposeSummary ? scheduleChip(placeComposeSummary) : null}

        <div className={groupActionTrayClass}>
          <button
            type="button"
            className={[
              groupActionBase,
              "border-[var(--border)]/50",
              "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
              "text-[var(--text)]",
              "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
            ].join(" ")}
            disabled={createInteractionLocked || createSwipeExitHold}
            onClick={() => {
              if (createSwipeExitHold) return;
              requestCreateClose();
            }}
          >
            {peopleUiCopy.noteSheetCancel}
          </button>

          {isPlaceSource ? (
            <button
              type="button"
              disabled={createInteractionLocked}
              aria-pressed={showDatePanel}
              aria-label={peopleUiCopy.openPlanDateTime}
              onClick={() => {
                if (showDatePanel) {
                  setShowDatePanel(false);
                  return;
                }
                openSchedulePanel("date");
              }}
              className={[
                "group/social relative min-w-0 flex-1 overflow-visible",
                GROUP_ACTION_H,
                datePulse
                  ? "social-pill-attention-active social-pill-attention-press"
                  : "",
              ].join(" ")}
            >
              <span className={dateTimeExtrusionClass} aria-hidden />
              <span
                data-social-ripple
                className="pointer-events-none absolute inset-0 z-[1] rounded-full bg-[color-mix(in_oklab,var(--bg)_16%,transparent)]"
                aria-hidden
              />
              <span data-social-face className={dateTimeFaceClass}>
                <span className="truncate">{peopleUiCopy.openPlanDateTime}</span>
              </span>
              {needsDate ? (
                <span
                  className={[
                    "pointer-events-none absolute left-1/2 top-0 z-[3]",
                    "-translate-x-1/2 -translate-y-1/2",
                    "flex h-3.5 w-3.5 items-center justify-center",
                    "text-[color-mix(in_oklab,var(--brand)_92%,#f5c542)]",
                    "drop-shadow-[0_0_2px_color-mix(in_oklab,var(--brand)_45%,transparent)]",
                  ].join(" ")}
                  aria-hidden
                >
                  <PiStarFill className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          ) : null}

          <button
            type="button"
            disabled={createInteractionLocked}
            aria-label={peopleUiCopy.groupUpCreateCta}
            onClick={() => void handleCreate()}
            className={[
              "group/social relative min-w-0 flex-1 overflow-visible",
              GROUP_ACTION_H,
              "disabled:opacity-50",
            ].join(" ")}
          >
            <span className={createPrimaryExtrusion} aria-hidden />
            <span data-social-face className={createPrimaryFace}>
              <span className="truncate">
                {createBusy || createResolving
                  ? "…"
                  : peopleUiCopy.groupUpCreateCta}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  const manageTitle =
    manageIdentity.title?.trim() || peopleUiCopy.groupUpFallbackTitle;
  const manageDescription =
    manageIdentity.description?.trim() ||
    opportunity?.description?.trim() ||
    null;
  const manageCaption =
    manageIdentity.sourceCaption?.trim() ||
    overlay.sourceCaption?.trim() ||
    null;
  const manageNeedsDate = isPlaceManage && selectedDate == null;
  const manageDateTimeActive = manageOpen && showDatePanel;

  const manageDateTimeExtrusionClass = manageDateTimeActive
    ? [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[var(--green-text)]",
        "app-dark:bg-[color-mix(in_oklab,var(--green-text)_88%,#0a0a0a)]",
      ].join(" ")
    : [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
        "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
      ].join(" ");

  const manageDateTimeFaceClass = [
    "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
    "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
    "bg-[var(--text)] text-[var(--bg)]",
    "px-1.5 text-xs font-semibold leading-none tracking-tight",
    "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
    "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
    "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
    "motion-safe:group-active/social:duration-75",
  ].join(" ");

  const managePanel = (
    <div
      data-group-up-manage-swipe-panel
      className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
      onPointerDown={(e) => e.stopPropagation()}
      data-group-manage-panel
    >
      <div className="relative flex flex-col gap-2 px-3 pb-3 pt-3 sm:px-4">
        {isPlaceManage && showDatePanel ? (
          <div className="flex w-full min-w-0 flex-col gap-2 py-1">
            <FutureDateTimePanel
              selectedDate={selectedDate}
              onSelectedDateChange={setSelectedDate}
              selectedTime={selectedTime}
              onSelectedTimeChange={setSelectedTime}
              active={manageOpen && showDatePanel}
              calendarResetToken={calendarResetToken}
              segment={panelSegment}
              onSegmentChange={setPanelSegment}
              dateSurface={dateSurface}
              onDateSurfaceChange={setDateSurface}
              onDone={() => void handleManageScheduleDone()}
            />
          </div>
        ) : (
          <>
            {manageCaption ? (
              <p className="truncate px-1 text-[12px] font-medium text-[var(--text)]/45">
                {manageCaption}
              </p>
            ) : null}

            <div className="relative flex flex-col px-1">
              <h2 className="text-base font-semibold leading-snug text-[var(--text)]">
                {manageTitle}
              </h2>
              <div
                className="my-1.5 h-px bg-[color-mix(in_oklab,var(--border)_55%,transparent)] app-dark:bg-[color-mix(in_oklab,white_12%,transparent)]"
                aria-hidden
              />
              {manageDescription ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--text)]/80">
                  {manageDescription}
                </p>
              ) : null}
            </div>

            {manageScheduleChip ? scheduleChip(manageScheduleChip) : null}
          </>
        )}

        <div className={groupActionTrayClass}>
          <button
            type="button"
            className={[
              groupActionBase,
              "border-[var(--border)]/50",
              "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
              "text-[var(--text)]",
              "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
            ].join(" ")}
            disabled={manageSwipeExitHold}
            onClick={() => {
              if (manageSwipeExitHold) return;
              closeGroupUpOverlay();
            }}
          >
            {peopleUiCopy.groupUpClose}
          </button>

          {isPlaceManage ? (
            <button
              type="button"
              disabled={scheduleBusy}
              aria-pressed={manageDateTimeActive}
              aria-label={peopleUiCopy.openPlanDateTime}
              onClick={() => {
                if (showDatePanel) {
                  void handleManageScheduleDone();
                  return;
                }
                openSchedulePanel("date");
              }}
              className={[
                "group/social relative min-w-0 flex-1 overflow-visible",
                GROUP_ACTION_H,
              ].join(" ")}
            >
              <span className={manageDateTimeExtrusionClass} aria-hidden />
              <span data-social-face className={manageDateTimeFaceClass}>
                <span className="truncate">
                  {scheduleBusy ? "…" : peopleUiCopy.openPlanDateTime}
                </span>
              </span>
              {manageNeedsDate ? (
                <span
                  className={[
                    "pointer-events-none absolute left-1/2 top-0 z-[3]",
                    "-translate-x-1/2 -translate-y-1/2",
                    "flex h-3.5 w-3.5 items-center justify-center",
                    "text-[color-mix(in_oklab,var(--brand)_92%,#f5c542)]",
                  ].join(" ")}
                  aria-hidden
                >
                  <PiStarFill className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          ) : null}

          <button
            type="button"
            disabled={!opportunity?.conversation_id}
            aria-label={peopleUiCopy.groupUpOpenGroup}
            onClick={() => {
              if (!opportunity?.conversation_id) return;
              const nav = buildGroupManageOpenGroupNavigation(
                opportunity.conversation_id,
                location
              );
              navigate(nav.path, { state: nav.state });
            }}
            className={[
              "group/social relative min-w-0 flex-1 overflow-visible",
              GROUP_ACTION_H,
              "disabled:opacity-50",
            ].join(" ")}
          >
            <span className={createPrimaryExtrusion} aria-hidden />
            <span
              data-social-face
              className={[createPrimaryFace, "gap-1"].join(" ")}
            >
              <PiChatCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{peopleUiCopy.groupUpOpenGroup}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <BottomDrawer
        open={sheetOpen && createOpen}
        onClose={() => {
          if (Date.now() < ignoreBackdropCloseUntilRef.current) return;
          if (createSwipeExitHold) return;
          if (!createInteractionLocked) requestCreateClose();
        }}
        overlayStyle={createOverlaySwipeStyle}
        onOverlayPointerDownCapture={onCreateOverlayPointerDownCapture}
        shrinkSheetToContent
        bodyScrollable={false}
        maxHeight="92vh"
        portalClassName={SOCIAL_OVERLAY_LAYER.createManage}
        transparentSheet
        liftWithKeyboard
        contentClassName="px-3 pt-1 sm:px-4"
        showCloseButton={false}
      >
        {seeGroupsControl}
        {createPanel}
      </BottomDrawer>

      <BottomDrawer
        open={sheetOpen && manageOpen}
        onClose={() => {
          if (manageSwipeExitHold) return;
          requestManageClose();
        }}
        overlayStyle={manageOverlaySwipeStyle}
        onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}
        shrinkSheetToContent
        bodyScrollable={false}
        maxHeight="92vh"
        portalClassName={SOCIAL_OVERLAY_LAYER.createManage}
        transparentSheet
        liftWithKeyboard
        contentClassName="px-3 pt-1 sm:px-4"
        showCloseButton={false}
      >
        {manageUtilityRow}
        {managePanel}
      </BottomDrawer>

      <FrostedCenterModal
        open={discardConfirmOpen && createOpen}
        onBackdropClick={
          createInteractionLocked
            ? undefined
            : () => setDiscardConfirmOpen(false)
        }
        zTier="aboveDialog"
        aria-labelledby="group-up-discard-title"
      >
        <div
          className={frostedModalPanelClassName}
          style={frostedModalPanelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            id="group-up-discard-title"
            className="mb-1 text-[15px] font-semibold text-[var(--text)]"
          >
            {peopleUiCopy.groupUpDiscardTitle}
          </div>
          <p className="mb-3 text-[13px] text-[var(--text)]/70">
            {peopleUiCopy.groupUpDiscardBody}
          </p>
          <div className="flex w-full min-w-0 items-center gap-1.5">
            <button
              type="button"
              disabled={createInteractionLocked}
              className={[
                "inline-flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center",
                "rounded-full border border-[var(--border)]",
                "bg-[var(--surface-2)] px-1.5 text-[13px] font-semibold leading-tight",
                "text-[var(--text)] transition",
                "hover:bg-[var(--surface)]/80 disabled:opacity-50",
              ].join(" ")}
              onClick={() => setDiscardConfirmOpen(false)}
            >
              {peopleUiCopy.groupUpDiscardKeep}
            </button>

            <button
              type="button"
              disabled={createInteractionLocked}
              className={[
                "inline-flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center",
                "rounded-full border px-1.5 text-[13px] font-semibold leading-tight transition",
                "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]",
                "bg-[color-mix(in_oklab,var(--surface-2)_92%,transparent)]",
                "text-red-700/80 app-dark:text-red-300/75",
                "hover:bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface-2))]",
                "disabled:opacity-50",
              ].join(" ")}
              onClick={handleDiscardExit}
            >
              {peopleUiCopy.groupUpDiscardExit}
            </button>

            <button
              type="button"
              disabled={createInteractionLocked}
              aria-label={peopleUiCopy.groupUpCreateCta}
              onClick={handleDiscardCreate}
              className={[
                "group/social relative h-9 min-h-9 min-w-0 flex-1 overflow-visible",
                "disabled:opacity-50",
              ].join(" ")}
            >
              <span className={createPrimaryExtrusion} aria-hidden />
              <span
                className={[
                  "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
                  "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
                  "bg-[var(--brand)] text-[var(--brand-ink)]",
                  "px-1.5 text-[13px] font-semibold leading-tight",
                  "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
                  "motion-safe:group-active/social:translate-x-[-2px]",
                  "motion-safe:group-active/social:translate-y-[2px]",
                  "motion-safe:group-active/social:duration-75",
                ].join(" ")}
              >
                <span className="truncate">
                  {createBusy || createResolving
                    ? "…"
                    : peopleUiCopy.groupUpCreateCta}
                </span>
              </span>
            </button>
          </div>
        </div>
      </FrostedCenterModal>

      <ConfirmDialog
        open={Boolean(overlay.cancelConfirmOpen && manageOpen)}
        onClose={() => {
          if (!cancelBusy) closeGroupUpCancelConfirm();
        }}
        title={peopleUiCopy.groupUpCancelTitle}
        message={peopleUiCopy.groupUpCancelBody}
        cancelLabel={peopleUiCopy.groupUpCancelKeep}
        confirmLabel={peopleUiCopy.groupUpCancelConfirm}
        confirmVariant="dangerSoft"
        higherZIndex
        isLoading={cancelBusy}
        onConfirm={() => void handleCancelConfirm()}
      />
    </>
  );
}
