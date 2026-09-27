/**
 * Group Settings — Profile Settings visual language + functional actions.
 * Edit details uses a nested BottomDrawer; other actions are parent-owned.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  PiBell,
  PiBellSlash,
  PiCaretLeft,
  PiPencilSimple,
  PiSignOut,
  PiTrash,
  PiUserMinus,
  PiUserPlus,
  PiUsers,
  PiX,
} from "react-icons/pi";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { getPostByIdOptimized } from "../../api/queries/getPostById";
import BottomDrawer from "../ui/BottomDrawer";
import PlanScheduleFields from "../ui/PlanScheduleFields";
import PlanSourceContextBar from "./PlanSourceContextBar";
import {
  CREATE_FLOW_DEFAULT_START_TIME,
  stampStartTimeOnDates,
  type CreateFlowStartTime,
} from "../../lib/createFlowStartTime";
import {
  deriveGroupUpScheduleFromOccursAt,
  deriveGroupUpSchedulePrefill,
} from "../../lib/groupUpSchedulePrefill";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  renewGroupUp,
  getMyGroupUpForConversation,
  GROUP_UP_DESCRIPTION_MAX,
} from "../../api/services/groupUp";
import {
  glassActionSheetBackdropClass,
  glassActionSheetIconWrapClass,
  glassActionSheetPillClass,
  glassActionSheetRoundedBlockClass,
  glassActionSheetRowClass,
  glassActionSheetSectionLabelClass,
  glassPeoplePanelClass,
} from "../../lib/glassActionSheetStyles";
import { getErrorMessage } from "../../lib/errorHandling";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import type { GroupUpSourceContext } from "../../lib/people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const EDGE_MAX_WIDTH_VW = 0.32;
const EDGE_MAX_WIDTH_PX = 128;
const GROUP_TITLE_MAX = 80;
const GROUP_DESCRIPTION_MAX = 200;

/** Soft destructive — matches Profile Settings “Log out”. */
const leaveGroupRowClass = [
  glassActionSheetRowClass,
  "border-rose-400/28 text-[color-mix(in_oklab,#e11d48_55%,var(--text))] hover:bg-[color-mix(in_oklab,#fb7185_10%,transparent)] app-dark:border-rose-400/25 app-dark:text-rose-300/95",
].join(" ");

const leaveGroupIconWrapClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-400/35 bg-[color-mix(in_oklab,#fb7185_10%,transparent)]";

const glassInputStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--glass-bg) 75%, var(--bg))",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--glass-active-border, var(--border))",
};

const primaryCtaClass =
  "flex w-full items-center justify-center rounded-full bg-amber-400/90 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-opacity disabled:pointer-events-none disabled:opacity-45";

type Props = {
  open: boolean;
  onClose: () => void;
  conversationId?: string | null;
  title: string;
  description: string | null;
  /** Active group-admin (conversation_members.role), not app admin. */
  isGroupAdmin: boolean;
  notificationsMuted: boolean;
  muteBusy?: boolean;
  onToggleMute: () => void;
  onOpenPeople: () => void;
  onAddPeople: () => void;
  onManagePeople: () => void;
  onLeaveGroup: () => void;
  /** Active admin only: soft-dissolve group for everyone. */
  onDeleteGroup?: () => void;
  onSaveDetails: (
    title: string,
    description: string | null
  ) => Promise<{ error: unknown } | void>;
};

export default function GroupSettingsSheet({
  open,
  onClose,
  conversationId,
  title,
  description,
  isGroupAdmin,
  notificationsMuted,
  muteBusy = false,
  onToggleMute,
  onOpenPeople,
  onAddPeople,
  onManagePeople,
  onLeaveGroup,
  onDeleteGroup,
  onSaveDetails,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const playAnimatedDismissRef = useRef<() => void>(() => {});
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDescription, setRenewDescription] = useState("");
  const [renewBusy, setRenewBusy] = useState(false);
  const [canRenewGroupUp, setCanRenewGroupUp] = useState(false);
  const [renewSourcePostId, setRenewSourcePostId] = useState<string | null>(
    null
  );
  const [renewLastOccursAt, setRenewLastOccursAt] = useState<string | null>(
    null
  );
  const [renewSelectedDates, setRenewSelectedDates] = useState<Date[]>([]);
  const [renewStartTime, setRenewStartTime] = useState<CreateFlowStartTime | null>(
    CREATE_FLOW_DEFAULT_START_TIME
  );
  const [renewCalendarResetToken, setRenewCalendarResetToken] = useState(0);
  const [sourceContext, setSourceContext] = useState<GroupUpSourceContext | null>(
    null
  );
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);

  const close = useCallback(() => {
    setEditOpen(false);
    setRenewOpen(false);
    onClose();
  }, [onClose]);

  const sheetOverlayBlocked = editOpen || renewOpen;

  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: open && !sheetOverlayBlocked,
      engageSwipe: open && !sheetOverlayBlocked,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeMaxWidthVw: EDGE_MAX_WIDTH_VW,
      edgeMaxWidthPx: EDGE_MAX_WIDTH_PX,
      edgeStripZClass: "z-[5]",
      onDismiss: close,
    });

  playAnimatedDismissRef.current = playAnimatedDismiss;

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: open && !sheetOverlayBlocked,
      engageSwipe: open && !sheetOverlayBlocked,
      gestureDisabled: false,
      startZoneMaxXVw: 0.45,
      startZoneMaxPx: 180,
      leftInsetPx: isNativeApp() ? 8 : 12,
      excludeSelector:
        'input, textarea, select, [contenteditable="true"], [data-no-overlay-swipe], a[href]',
      allowButtonTargets: true,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: playAnimatedDismiss,
    });

  useEffect(() => {
    if (!open) {
      setEditOpen(false);
      setRenewOpen(false);
      setRenewDescription("");
      setRenewBusy(false);
      setCanRenewGroupUp(false);
      setRenewSourcePostId(null);
      setRenewLastOccursAt(null);
      setRenewSelectedDates([]);
      setRenewStartTime(CREATE_FLOW_DEFAULT_START_TIME);
      setSourceContext(null);
      setSaving(false);
      saveLockRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !conversationId) {
      setCanRenewGroupUp(false);
      setSourceContext(null);
      return;
    }
    let cancelled = false;
    void getMyGroupUpForConversation(conversationId)
      .then((state) => {
        if (!cancelled) {
          setSourceContext(state.sourceContext);
          if (isGroupAdmin) {
            setCanRenewGroupUp(state.canRenew);
            setRenewSourcePostId(state.renewSourcePostId);
            setRenewLastOccursAt(state.renewLastOccursAt);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceContext(null);
          if (isGroupAdmin) setCanRenewGroupUp(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, isGroupAdmin]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (renewOpen) {
          setRenewOpen(false);
          return;
        }
        if (editOpen) {
          setEditOpen(false);
          return;
        }
        playAnimatedDismissRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editOpen, renewOpen]);

  const openEdit = useCallback(() => {
    setEditTitle(title.trim());
    setEditDescription((description ?? "").trim());
    setEditOpen(true);
  }, [title, description]);

  const openRenew = useCallback(() => {
    setRenewDescription("");
    setRenewSelectedDates([]);
    setRenewStartTime(CREATE_FLOW_DEFAULT_START_TIME);
    setRenewCalendarResetToken((n) => n + 1);
    setRenewOpen(true);

    const applyPrefill = (
      prefill: ReturnType<typeof deriveGroupUpSchedulePrefill>
    ) => {
      if (prefill.selectedDates.length === 0) return;
      setRenewSelectedDates(prefill.selectedDates);
      setRenewStartTime(prefill.startTime ?? CREATE_FLOW_DEFAULT_START_TIME);
    };

    if (renewLastOccursAt) {
      applyPrefill(deriveGroupUpScheduleFromOccursAt(renewLastOccursAt));
      return;
    }

    if (!renewSourcePostId) return;

    void getPostByIdOptimized(renewSourcePostId, null).then(({ data }) => {
      if (!data?.type) return;
      const postType =
        data.type === "hangout" || data.type === "experience"
          ? data.type
          : null;
      if (!postType) return;
      applyPrefill(
        deriveGroupUpSchedulePrefill({
          postType,
          isRecurring: data.is_recurring ?? null,
          selectedDates: data.selected_dates ?? null,
          recurrenceDays: data.recurrence_days ?? null,
        })
      );
    });
  }, [renewLastOccursAt, renewSourcePostId]);

  const trimmedRenewDescription = renewDescription.trim();
  const renewDescriptionValid =
    trimmedRenewDescription.length > 0 &&
    trimmedRenewDescription.length <= GROUP_UP_DESCRIPTION_MAX;

  const renewStampedInstant = useMemo(() => {
    if (renewSelectedDates.length === 0 || !renewStartTime) return null;
    const stamped = stampStartTimeOnDates(renewSelectedDates, renewStartTime);
    const first = stamped[0];
    if (!first || Number.isNaN(first.getTime())) return null;
    return first;
  }, [renewSelectedDates, renewStartTime]);

  const renewPastSchedule =
    renewStampedInstant != null && renewStampedInstant.getTime() <= Date.now();

  const handleRenewGroupUp = useCallback(async () => {
    if (!conversationId || renewBusy || !renewDescriptionValid) return;
    setRenewBusy(true);
    try {
      await renewGroupUp({
        conversationId,
        description: trimmedRenewDescription,
        occursAt: renewStampedInstant?.toISOString() ?? null,
        occursTimeExplicit:
          renewStampedInstant != null ? renewStartTime != null : true,
      });
      toast.success(peopleUiCopy.groupUpRenewSuccess);
      setCanRenewGroupUp(false);
      setRenewOpen(false);
    } catch {
      toast.error(peopleUiCopy.groupUpRenewError);
    } finally {
      setRenewBusy(false);
    }
  }, [
    conversationId,
    renewBusy,
    renewDescriptionValid,
    renewStampedInstant,
    renewStartTime,
    trimmedRenewDescription,
  ]);

  const trimmedEditTitle = editTitle.trim();
  const titleValid =
    trimmedEditTitle.length > 0 && trimmedEditTitle.length <= GROUP_TITLE_MAX;
  const descriptionLen = editDescription.length;
  const descriptionValid = descriptionLen <= GROUP_DESCRIPTION_MAX;

  const handleSaveDetails = useCallback(async () => {
    if (saving || saveLockRef.current) return;
    if (!titleValid || !descriptionValid) return;

    saveLockRef.current = true;
    setSaving(true);
    try {
      const nextDescription =
        editDescription.trim().length > 0 ? editDescription.trim() : null;
      const result = await onSaveDetails(trimmedEditTitle, nextDescription);
      if (result && "error" in result && result.error) {
        toast.error(
          getErrorMessage(result.error) || "Could not save group details."
        );
        return;
      }
      setEditOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not save group details.");
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }, [
    saving,
    titleValid,
    descriptionValid,
    editDescription,
    trimmedEditTitle,
    onSaveDetails,
  ]);

  if (!open) return null;

  const motionStyle = contentSwipeMotionStyle
    ? { ...overlayMotionStyle, ...contentSwipeMotionStyle }
    : overlayMotionStyle;

  const displayDescription = description?.trim() || null;

  const shell = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overscroll-none p-6 pointer-events-none"
      style={motionStyle}
      role="presentation"
    >
      <button
        type="button"
        className={glassActionSheetBackdropClass}
        aria-label="Dismiss group settings"
        onClick={() => playAnimatedDismiss()}
      />
      <div
        {...panelSwipeProps}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-settings-title"
        className="relative z-10 flex max-h-[min(85dvh,calc(100vh-48px))] w-[min(280px,calc(100vw-48px))] flex-col items-stretch gap-1.5 overflow-y-auto overscroll-contain py-0.5 pointer-events-auto"
        style={{ touchAction: "pan-y" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {sourceContext ? (
          <div className="mb-3 w-full shrink-0" data-no-overlay-swipe>
            <PlanSourceContextBar
              variant="settings"
              sourceContext={sourceContext}
              onTap={() =>
                navigateToPostDetailInApp(
                  navigate,
                  location,
                  sourceContext.post_type,
                  sourceContext.source_post_id
                )
              }
            />
          </div>
        ) : null}

        <div className="flex w-full shrink-0 items-center justify-between gap-2">
          <span
            id="group-settings-title"
            className={`${glassActionSheetPillClass} inline-flex h-9 max-w-[min(200px,calc(100vw-120px))] items-center truncate px-3 text-[12px] font-semibold tracking-tight text-[var(--text)]`}
          >
            Settings
          </span>
          <button
            type="button"
            className={`${glassActionSheetPillClass} flex h-9 w-9 shrink-0 items-center justify-center p-0 text-[var(--text)] hover:bg-[var(--glass-active-bg)]`}
            aria-label="Close"
            onClick={() => playAnimatedDismiss()}
          >
            <PiCaretLeft size={18} aria-hidden />
          </button>
        </div>

        <div
          className={`w-full ${isGroupAdmin ? "mt-4 pt-1" : "mt-3 pt-1"}`}
          data-no-overlay-swipe
        >
          {isGroupAdmin ? (
            <button
              type="button"
              className={`${glassActionSheetRoundedBlockClass} relative w-full px-3 py-2.5 pr-11 text-left transition-opacity hover:opacity-95 active:scale-[0.99]`}
              onClick={openEdit}
              aria-label="Edit group details"
            >
              <div className="min-w-0">
                <p className="break-words text-[12px] font-semibold leading-snug text-[var(--text)]">
                  {title.trim() || "Group"}
                </p>
                {displayDescription ? (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-[var(--text)]/70">
                    {displayDescription}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-700/85 app-dark:text-amber-300/90">
                    Add description
                  </p>
                )}
              </div>
              <span
                className={`${glassActionSheetIconWrapClass} absolute right-2.5 top-2.5`}
                aria-hidden
              >
                <PiPencilSimple size={14} />
              </span>
            </button>
          ) : (
            <div className="px-1 py-1.5 text-center">
              <p className="break-words text-[13px] font-semibold leading-snug text-[var(--text)]">
                {title.trim() || "Group"}
              </p>
              {displayDescription ? (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-[var(--text)]/60">
                  {displayDescription}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {isGroupAdmin ? (
          <>
            <p className={glassActionSheetSectionLabelClass}>Group</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className={glassActionSheetRowClass}
                onClick={() => {
                  onOpenPeople();
                  close();
                }}
              >
                <span>People</span>
                <span className={glassActionSheetIconWrapClass}>
                  <PiUsers size={14} aria-hidden />
                </span>
              </button>
              <button
                type="button"
                className={glassActionSheetRowClass}
                onClick={onAddPeople}
              >
                <span>Add people</span>
                <span className={glassActionSheetIconWrapClass}>
                  <PiUserPlus size={14} aria-hidden />
                </span>
              </button>
              <button
                type="button"
                className={glassActionSheetRowClass}
                onClick={() => {
                  onManagePeople();
                  close();
                }}
              >
                <span>Manage people</span>
                <span className={glassActionSheetIconWrapClass}>
                  <PiUserMinus size={14} aria-hidden />
                </span>
              </button>
              {canRenewGroupUp ? (
                <button
                  type="button"
                  className={glassActionSheetRowClass}
                  onClick={openRenew}
                >
                  <span>{peopleUiCopy.groupUpRenewCta}</span>
                  <span className={glassActionSheetIconWrapClass}>
                    <PiUsers size={14} aria-hidden />
                  </span>
                </button>
              ) : null}
            </div>

            <p className={glassActionSheetSectionLabelClass}>Notifications</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className={glassActionSheetRowClass}
                disabled={muteBusy}
                onClick={() => {
                  if (muteBusy) return;
                  onToggleMute();
                }}
              >
                <span>
                  {notificationsMuted
                    ? "Unmute notifications"
                    : "Mute notifications"}
                </span>
                <span className={glassActionSheetIconWrapClass}>
                  {notificationsMuted ? (
                    <PiBell size={14} aria-hidden />
                  ) : (
                    <PiBellSlash size={14} aria-hidden />
                  )}
                </span>
              </button>
            </div>

            <p className={glassActionSheetSectionLabelClass}>Membership</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className={leaveGroupRowClass}
                data-no-overlay-swipe
                onClick={(e) => {
                  e.stopPropagation();
                  onLeaveGroup();
                }}
              >
                <span className="font-medium">Leave group</span>
                <span className={leaveGroupIconWrapClass}>
                  <PiSignOut size={14} aria-hidden />
                </span>
              </button>
              {typeof onDeleteGroup === "function" ? (
                <button
                  type="button"
                  className={leaveGroupRowClass}
                  data-no-overlay-swipe
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGroup();
                  }}
                >
                  <span className="font-medium">Delete group</span>
                  <span className={leaveGroupIconWrapClass}>
                    <PiTrash size={14} aria-hidden />
                  </span>
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            <button
              type="button"
              className={glassActionSheetRowClass}
              onClick={() => {
                onOpenPeople();
                close();
              }}
            >
              <span>People</span>
              <span className={glassActionSheetIconWrapClass}>
                <PiUsers size={14} aria-hidden />
              </span>
            </button>
            <button
              type="button"
              className={glassActionSheetRowClass}
              disabled={muteBusy}
              onClick={() => {
                if (muteBusy) return;
                onToggleMute();
              }}
            >
              <span>
                {notificationsMuted
                  ? "Unmute notifications"
                  : "Mute notifications"}
              </span>
              <span className={glassActionSheetIconWrapClass}>
                {notificationsMuted ? (
                  <PiBell size={14} aria-hidden />
                ) : (
                  <PiBellSlash size={14} aria-hidden />
                )}
              </span>
            </button>
            <button
              type="button"
              className={leaveGroupRowClass}
              data-no-overlay-swipe
              onClick={(e) => {
                e.stopPropagation();
                onLeaveGroup();
              }}
            >
              <span className="font-medium">Leave group</span>
              <span className={leaveGroupIconWrapClass}>
                <PiSignOut size={14} aria-hidden />
              </span>
            </button>
          </div>
        )}
      </div>
      <div {...edgeStripProps} />
    </div>
  );

  const editPanel = (
    <div className={`${glassPeoplePanelClass} mx-auto max-w-lg`}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]/40 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
          Edit details
        </p>
        <button
          type="button"
          onClick={() => {
            if (!saving) setEditOpen(false);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/70"
          aria-label="Close"
          disabled={saving}
        >
          <PiX className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-4 py-3">
        <div>
          <label
            htmlFor="group-edit-title"
            className="mb-1.5 block text-xs font-medium text-[var(--text)]/60"
          >
            Group name
          </label>
          <input
            id="group-edit-title"
            type="text"
            value={editTitle}
            maxLength={GROUP_TITLE_MAX}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-full border px-4 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text)]/45 focus:ring-2 focus:ring-primary/25"
            style={glassInputStyle}
            disabled={saving}
            autoFocus
          />
          <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--text)]/40">
            {editTitle.trim().length}/{GROUP_TITLE_MAX}
          </p>
        </div>
        <div>
          <label
            htmlFor="group-edit-description"
            className="mb-1.5 block text-xs font-medium text-[var(--text)]/60"
          >
            Description
            <span className="font-normal text-[var(--text)]/40">
              {" "}
              (optional)
            </span>
          </label>
          <textarea
            id="group-edit-description"
            value={editDescription}
            maxLength={GROUP_DESCRIPTION_MAX}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Add a short description"
            rows={4}
            className="w-full resize-none rounded-2xl border px-4 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text)]/45 focus:ring-2 focus:ring-primary/25"
            style={glassInputStyle}
            disabled={saving}
          />
          <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--text)]/40">
            {descriptionLen}/{GROUP_DESCRIPTION_MAX}
          </p>
        </div>
        <button
          type="button"
          className={primaryCtaClass}
          disabled={saving || !titleValid || !descriptionValid}
          onClick={() => void handleSaveDetails()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  const renewPanel = (
    <div className={`${glassPeoplePanelClass} mx-auto max-w-lg`}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]/40 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
          {peopleUiCopy.groupUpRenewTitle}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!renewBusy) setRenewOpen(false);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/70"
          aria-label="Close"
          disabled={renewBusy}
        >
          <PiX className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-4 py-3">
        <div>
          <label
            htmlFor="group-up-renew-description"
            className="mb-1.5 block text-xs font-medium text-[var(--text)]/60"
          >
            {peopleUiCopy.groupUpDescriptionLabel}
          </label>
          <textarea
            id="group-up-renew-description"
            value={renewDescription}
            maxLength={GROUP_UP_DESCRIPTION_MAX}
            onChange={(e) => setRenewDescription(e.target.value)}
            placeholder={peopleUiCopy.groupUpDescriptionPlaceholder}
            rows={4}
            className="w-full resize-none rounded-2xl border px-4 py-2.5 text-base text-[var(--text)] outline-none placeholder:text-[var(--text)]/45 focus:ring-2 focus:ring-primary/25"
            style={glassInputStyle}
            disabled={renewBusy}
            autoFocus
          />
          <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--text)]/40">
            {trimmedRenewDescription.length}/{GROUP_UP_DESCRIPTION_MAX}
          </p>
        </div>
        <PlanScheduleFields
          selectedDates={renewSelectedDates}
          onSelectDates={setRenewSelectedDates}
          startTime={renewStartTime}
          onStartTimeChange={setRenewStartTime}
          active={renewOpen}
          calendarResetToken={renewCalendarResetToken}
          collapsible
          defaultExpanded={false}
          allowClear
          onClear={() => setRenewSelectedDates([])}
          pastError={renewPastSchedule ? peopleUiCopy.groupUpPastError : null}
          disabled={renewBusy}
          busy={renewBusy}
          dateLabel={peopleUiCopy.groupUpScheduleLabel}
        />
        <button
          type="button"
          className={primaryCtaClass}
          disabled={renewBusy || !renewDescriptionValid || renewPastSchedule}
          onClick={() => void handleRenewGroupUp()}
        >
          {renewBusy ? "…" : peopleUiCopy.groupUpRenewCta}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(shell, document.body)}
      <BottomDrawer
        open={editOpen}
        onClose={() => {
          if (!saving) setEditOpen(false);
        }}
        showCloseButton={false}
        shrinkSheetToContent
        maxHeight="88vh"
        portalClassName="z-[130]"
        disableBodyScrollLock
        transparentSheet
        contentClassName="px-4 pt-1"
      >
        {editPanel}
      </BottomDrawer>
      <BottomDrawer
        open={renewOpen}
        onClose={() => {
          if (!renewBusy) setRenewOpen(false);
        }}
        showCloseButton={false}
        shrinkSheetToContent
        maxHeight="88vh"
        portalClassName="z-[130]"
        disableBodyScrollLock
        transparentSheet
        liftWithKeyboard
        contentClassName="px-4 pt-1"
      >
        {renewPanel}
      </BottomDrawer>
    </>
  );
}
