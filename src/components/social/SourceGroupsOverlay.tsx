import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { PiArrowClockwise } from "react-icons/pi";
import BottomDrawer, {
  BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
} from "../ui/BottomDrawer";
import SourceGroupsRail, {
  SourceGroupsRailSkeleton,
} from "./SourceGroupsRail";
import {
  OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS,
  useOverlayContentSwipeDismiss,
} from "../../hooks/useOverlayContentSwipeDismiss";
import {
  closeSourceGroupsOverlay,
  getSourceGroupsOverlayState,
  isSourceGroupsOverlayOpen,
  subscribeSourceGroupsOverlay,
} from "../../lib/sourceGroupsOverlayStore";
import { GROUP_ACTIVE_MEMBER_CAP } from "../../lib/groupActiveMemberCap";
import {
  getGroupUpSourceListEntry,
  markGroupUpSourceListError,
  markGroupUpSourceListLoading,
  setGroupUpSourceListPage,
  subscribeGroupUpSourceList,
} from "../../lib/groupUpSourceListCache";
import {
  getGroupUpOwnStatus,
  subscribeGroupUpOwnState,
} from "../../lib/groupUpOwnStore";
import {
  getGroupUpActiveOverlayState,
  openGroupUpCreate,
  openGroupUpManage,
  subscribeGroupUpActiveOverlay,
} from "../../lib/groupUpActiveOverlayStore";
import { listGroupUpsForSource } from "../../api/services/groupUpSourceBrowse";
import {
  markGroupUpCountStale,
  requestGroupUpCount,
  setGroupUpCount,
} from "../../lib/groupUpCountStore";
import {
  mergeSourceGroupPagePreservingInFlight,
  shouldZeroDiscoverableCountFromRefreshPage,
} from "../../lib/sourceGroupsManualRefresh";
import { socialUiCopy } from "../../lib/social/socialUiCopy";
import type { SourceGroupRow } from "../../lib/social/sourceGroupTypes";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import { messagesConversationPath } from "../../router/Paths";
import { resolvePhotoPromptOffer } from "../../lib/peoplePhotoPromptPolicy";
import {
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  subscribePairUpPhotoPrompt,
} from "../../lib/pairUpPhotoPromptStore";
import {
  getSourceGroupRequestFlightsEpoch,
  isSourceGroupRequestBusy,
  runSourceGroupRequest,
  runSourceGroupWithdraw,
  subscribeSourceGroupRequestFlights,
} from "../../lib/sourceGroupRequestActions";
import {
  SOCIAL_OVERLAY_LAYER,
  SOCIAL_TOAST_BOTTOM_CSS_VAR,
  SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM,
} from "../../lib/socialOverlayLayers";
import type { RootState } from "../../app/store";
import useAuthActionGate from "../../hooks/useAuthActionGate";

const GROUP_ACTION_H = "h-9";

/** Same exclusions as requester / Pair Up drawers. */
const SOURCE_GROUPS_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

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

/** Edge fades on the card viewport only — CSS mask, no scroll JS loop. */
const cardScrollMaskStyle: CSSProperties = {
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
  maskImage:
    "linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
};

function occursLabelFor(row: SourceGroupRow): string | null {
  if (!row.occurs_at) return null;
  return formatSocialOccursSchedule(
    row.occurs_at,
    row.occurs_time_explicit !== false
  );
}

export default function SourceGroupsOverlay() {
  const overlay = useSyncExternalStore(
    subscribeSourceGroupsOverlay,
    getSourceGroupsOverlayState
  );
  const open = isSourceGroupsOverlayOpen(overlay);
  const sourcePostId = overlay.sourcePostId;
  const sourceCaption = overlay.sourceCaption?.trim() || null;

  const listEntry = useSyncExternalStore(subscribeGroupUpSourceList, () =>
    sourcePostId ? getGroupUpSourceListEntry(sourcePostId) : undefined
  );

  const ownStatus = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    sourcePostId ? getGroupUpOwnStatus(sourcePostId) : "idle"
  );
  const ownsActive = ownStatus === "active";

  const createUnderneath = useSyncExternalStore(
    subscribeGroupUpActiveOverlay,
    () => {
      const s = getGroupUpActiveOverlayState();
      return Boolean(
        sourcePostId && s.postId === sourcePostId && s.mode === "create"
      );
    }
  );
  const manageUnderneath = useSyncExternalStore(
    subscribeGroupUpActiveOverlay,
    () => {
      const s = getGroupUpActiveOverlayState();
      return Boolean(
        sourcePostId && s.postId === sourcePostId && s.mode === "manage"
      );
    }
  );
  const socialSheetUnderneath = createUnderneath || manageUnderneath;

  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen
  );

  const navigate = useNavigate();
  const location = useLocation();
  const { ensureAuthed } = useAuthActionGate();
  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null
  );

  const loadingMoreRef = useRef(false);
  const fetchedKeyRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Clean-swipe exit: keep hook `active` until BD unmounts. */
  const [swipeExitHold, setSwipeExitHold] = useState(false);
  const swipeExitGenerationRef = useRef(0);
  const swipeExitCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const swipeExitLingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const swipeExitResetTokenRef = useRef<string | null>(null);

  useSyncExternalStore(
    subscribeSourceGroupRequestFlights,
    getSourceGroupRequestFlightsEpoch,
    getSourceGroupRequestFlightsEpoch
  );

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.setProperty(
      SOCIAL_TOAST_BOTTOM_CSS_VAR,
      SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM
    );
    return () => {
      document.documentElement.style.removeProperty(SOCIAL_TOAST_BOTTOM_CSS_VAR);
    };
  }, [open]);

  const loadFirstPage = useCallback(async (id: string, force = false) => {
    if (!force && getGroupUpSourceListEntry(id)?.rows.length) return;
    markGroupUpSourceListLoading(id);
    try {
      const page = await listGroupUpsForSource({
        sourcePostId: id,
        limit: 20,
      });
      setGroupUpSourceListPage(id, page);
      if (shouldZeroDiscoverableCountFromRefreshPage(page)) {
        setGroupUpCount(id, 0);
      }
    } catch {
      markGroupUpSourceListError(id, socialUiCopy.sourceGroupsError);
      toast.error(socialUiCopy.sourceGroupsError);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    if (!sourcePostId || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const page = await listGroupUpsForSource({
        sourcePostId,
        limit: 20,
      });
      const prevRows =
        getGroupUpSourceListEntry(sourcePostId)?.rows ?? [];
      const merged = mergeSourceGroupPagePreservingInFlight(
        page,
        prevRows,
        isSourceGroupRequestBusy
      );
      // Replace first page (not append) — authoritative refresh.
      setGroupUpSourceListPage(sourcePostId, merged);
      if (shouldZeroDiscoverableCountFromRefreshPage(page)) {
        setGroupUpCount(sourcePostId, 0);
      } else {
        markGroupUpCountStale(sourcePostId);
        requestGroupUpCount(sourcePostId);
      }
    } catch {
      toast.error(socialUiCopy.sourceGroupsRefreshError);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [sourcePostId]);

  useEffect(() => {
    if (!open || !sourcePostId) {
      fetchedKeyRef.current = null;
      return;
    }
    if (fetchedKeyRef.current === sourcePostId) return;
    fetchedKeyRef.current = sourcePostId;
    void loadFirstPage(sourcePostId);
  }, [open, sourcePostId, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!sourcePostId || loadingMoreRef.current) return;
    const entry = getGroupUpSourceListEntry(sourcePostId);
    if (!entry?.hasMore || !entry.nextCursor) return;
    loadingMoreRef.current = true;
    try {
      const page = await listGroupUpsForSource({
        sourcePostId,
        limit: 20,
        cursor: entry.nextCursor,
      });
      setGroupUpSourceListPage(sourcePostId, page, { append: true });
    } catch {
      /* keep existing rows */
    } finally {
      loadingMoreRef.current = false;
    }
  }, [sourcePostId]);

  const handleClose = useCallback(() => {
    closeSourceGroupsOverlay();
  }, []);
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const nestedBlocking = socialSheetUnderneath || photoPromptOpen;
  const nestedBlockingRef = useRef(nestedBlocking);
  nestedBlockingRef.current = nestedBlocking;

  const clearSwipeExitTimers = useCallback(() => {
    if (swipeExitCloseTimerRef.current) {
      clearTimeout(swipeExitCloseTimerRef.current);
      swipeExitCloseTimerRef.current = null;
    }
    if (swipeExitLingerTimerRef.current) {
      clearTimeout(swipeExitLingerTimerRef.current);
      swipeExitLingerTimerRef.current = null;
    }
  }, []);

  const abortSwipeExitHold = useCallback(() => {
    swipeExitGenerationRef.current += 1;
    clearSwipeExitTimers();
    swipeExitResetTokenRef.current = null;
    setSwipeExitHold(false);
  }, [clearSwipeExitTimers]);

  // Reopen / remount: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!open) return;
    abortSwipeExitHold();
  }, [open, abortSwipeExitHold]);

  // Nested overlay opened mid-exit — abort hold so we do not close underneath it.
  useEffect(() => {
    if (!nestedBlocking || !swipeExitHold) return;
    abortSwipeExitHold();
  }, [nestedBlocking, swipeExitHold, abortSwipeExitHold]);

  useEffect(() => {
    return () => {
      swipeExitGenerationRef.current += 1;
      clearSwipeExitTimers();
    };
  }, [clearSwipeExitTimers]);

  const swipeBlocked = nestedBlocking || swipeExitHold;

  const handleSwipeCommit = useCallback(() => {
    if (nestedBlockingRef.current) return;
    if (swipeExitHold) return;
    // Keep portal exit transform alive through commit animation + BD delayed unmount.
    const generation = swipeExitGenerationRef.current + 1;
    swipeExitGenerationRef.current = generation;
    swipeExitResetTokenRef.current = sourcePostId ?? "none";
    setSwipeExitHold(true);
    clearSwipeExitTimers();
    swipeExitCloseTimerRef.current = setTimeout(() => {
      swipeExitCloseTimerRef.current = null;
      if (swipeExitGenerationRef.current !== generation) return;
      if (nestedBlockingRef.current) {
        swipeExitResetTokenRef.current = null;
        setSwipeExitHold(false);
        return;
      }
      handleCloseRef.current();
      swipeExitLingerTimerRef.current = setTimeout(() => {
        swipeExitLingerTimerRef.current = null;
        if (swipeExitGenerationRef.current !== generation) return;
        swipeExitResetTokenRef.current = null;
        setSwipeExitHold(false);
      }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
    }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
  }, [clearSwipeExitTimers, sourcePostId, swipeExitHold]);

  const swipeHookActive = open || swipeExitHold;
  const swipeResetToken = swipeExitHold
    ? swipeExitResetTokenRef.current
    : sourcePostId;

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: swipeHookActive,
      engageSwipe: open && !swipeBlocked,
      gestureDisabled: swipeBlocked,
      startZoneMaxXVw: 1,
      startZoneMaxPx: 10000,
      leftInsetPx: 0,
      excludeSelector: SOURCE_GROUPS_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      allowButtonTargets: false,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: handleSwipeCommit,
      // Frozen while exit hold is active so store clear does not reset transform.
      resetToken: swipeResetToken,
    });

  const overlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(contentSwipeMotionStyle ?? {}),
  };

  const onOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>
  ) => {
    panelSwipeProps.onPointerDownCapture(e);
  };

  const handleCreate = () => {
    if (!sourcePostId || ownsActive) return;
    const alreadyOpen = createUnderneath;
    closeSourceGroupsOverlay();
    if (!alreadyOpen) {
      openGroupUpCreate(
        sourcePostId,
        overlay.sourceCaption,
        overlay.sourceSchedule
      );
    }
  };

  const handleMyGroup = () => {
    if (!sourcePostId) return;
    const alreadyOpen = manageUnderneath;
    closeSourceGroupsOverlay();
    if (!alreadyOpen) {
      openGroupUpManage(
        sourcePostId,
        overlay.sourceCaption,
        overlay.sourceSchedule
      );
    }
  };

  const proceedRequest = useCallback(
    async (row: SourceGroupRow) => {
      if (!sourcePostId) return;
      await runSourceGroupRequest({
        sourcePostId,
        row,
        reloadSourceList: (id) => {
          void loadFirstPage(id, true);
        },
      });
    },
    [sourcePostId, loadFirstPage]
  );

  const proceedWithdraw = useCallback(
    async (row: SourceGroupRow) => {
      if (!sourcePostId) return;
      await runSourceGroupWithdraw({
        sourcePostId,
        opportunityId: row.opportunity_id,
        prevRequestId: row.request_id,
        showRemovedToast: true,
      });
    },
    [sourcePostId]
  );

  const handlePrimary = useCallback(
    async (row: SourceGroupRow) => {
      if (!ensureAuthed()) return;
      if (row.viewer_state === "owner" || row.viewer_state === "member") {
        try {
          closeSourceGroupsOverlay();
          navigate(messagesConversationPath(row.conversation_id), {
            state: { from: location.pathname },
          });
        } catch {
          toast.error(socialUiCopy.sourceGroupsOpenError);
        }
        return;
      }
      if (row.viewer_state === "pending") {
        if (photoPromptOpen) return;
        if (isSourceGroupRequestBusy(row.opportunity_id)) return;
        await proceedWithdraw(row);
        return;
      }
      if (row.viewer_state !== "none") return;
      if (row.member_count >= GROUP_ACTIVE_MEMBER_CAP) return;
      if (isSourceGroupRequestBusy(row.opportunity_id) || photoPromptOpen)
        return;

      const userId = authUserId;
      if (!userId) return;

      const profile = resolvePhotoPromptOffer(userId, "group_up_request", false);
      if (profile) {
        openPairUpPhotoPrompt({
          intentKey: `group-req:${row.opportunity_id}`,
          profileId: profile.profileId,
          userId: profile.userId,
          photos: profile.photos,
          onContinue: () => {
            void proceedRequest(row);
          },
        });
        return;
      }
      await proceedRequest(row);
    },
    [
      ensureAuthed,
      navigate,
      location.pathname,
      photoPromptOpen,
      authUserId,
      proceedRequest,
      proceedWithdraw,
    ]
  );

  const rows = listEntry?.rows ?? [];
  const loading = Boolean(listEntry?.loading && rows.length === 0);
  const error = listEntry?.error;
  const hasCards = rows.length > 0;

  return (
    <BottomDrawer
      open={open}
      onClose={() => {
        if (swipeExitHold) return;
        handleClose();
      }}
      overlayStyle={overlaySwipeStyle}
      onOverlayPointerDownCapture={onOverlayPointerDownCapture}
      maxHeight="100dvh"
      portalClassName={SOCIAL_OVERLAY_LAYER.browseOrNote}
      transparentSheet
      bodyScrollable={false}
      showCloseButton={false}
      disableBodyScrollLock={socialSheetUnderneath}
      contentClassName="p-0"
    >
      {/* Free-form column: no outer frosted panel — only cards + footer tray are card-like. */}
      <div
        className="mx-auto flex w-full max-w-lg flex-col overflow-hidden"
        style={{
          /* Match BottomDrawer transparentSheet bottom pad so column fits viewport. */
          height:
            "calc(100dvh - max(0.75rem, calc(0.5rem + var(--safe-area-bottom-layout))))",
          maxHeight:
            "calc(100dvh - max(0.75rem, calc(0.5rem + var(--safe-area-bottom-layout))))",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        data-source-groups-overlay="v3"
        data-source-groups-swipe-panel
      >
        {/* A. Fixed safe-area header — title centered; refresh absolute right */}
        <header
          className="relative shrink-0 px-4 pb-2 text-center"
          style={{
            paddingTop:
              "max(0.75rem, calc(var(--safe-area-top-layout) + 1rem))",
          }}
        >
          <div className="relative mx-auto flex min-h-9 w-full max-w-lg items-center justify-center">
            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">
              {socialUiCopy.sourceGroupsTitle}
            </h2>
            <button
              type="button"
              aria-label={socialUiCopy.sourceGroupsRefreshAria}
              disabled={!sourcePostId || refreshing}
              onClick={() => void handleManualRefresh()}
              className={[
                "absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center",
                "rounded-full text-[var(--text)]/55",
                "motion-safe:active:opacity-70",
                "disabled:opacity-40",
              ].join(" ")}
              data-source-groups-refresh
            >
              <PiArrowClockwise
                className={[
                  "h-[18px] w-[18px]",
                  refreshing ? "animate-spin" : "",
                ].join(" ")}
                aria-hidden
              />
            </button>
          </div>
          {sourceCaption ? (
            <p className="mx-auto mt-1.5 line-clamp-2 w-[78%] max-w-[22rem] text-[13px] leading-snug text-[var(--text)]/55">
              {sourceCaption}
            </p>
          ) : null}
        </header>

        {/* B. Scrollable card region + edge fades (fills space between header/footer) */}
        <div className="relative min-h-0 flex-1">
          <div
            className={[
              "absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y",
              "[-webkit-overflow-scrolling:touch]",
              "px-2",
            ].join(" ")}
            style={hasCards || loading ? cardScrollMaskStyle : undefined}
            data-source-groups-card-scroll
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) {
                void loadMore();
              }
            }}
          >
            {loading ? (
              <div aria-busy className="min-h-full">
                <SourceGroupsRailSkeleton />
              </div>
            ) : error && rows.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
                <p className="text-sm text-[var(--text)]/70">
                  {socialUiCopy.sourceGroupsError}
                </p>
                {sourcePostId ? (
                  <button
                    type="button"
                    className="rounded-full border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-semibold text-[var(--text)]/75"
                    onClick={() => void loadFirstPage(sourcePostId, true)}
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-full items-center justify-center px-4 py-5 text-center">
                <p className="text-sm text-[var(--text)]/70">
                  {socialUiCopy.sourceGroupsEmpty}
                </p>
              </div>
            ) : (
              <SourceGroupsRail
                rows={rows}
                occursLabelFor={occursLabelFor}
                busyId={null}
                onPrimary={(row) => void handlePrimary(row)}
              />
            )}
          </div>
        </div>

        {/* C. Fixed action tray — same Create drawer/panel insets + pb-3 resting pad */}
        <footer className="shrink-0 px-3 pt-2 sm:px-4">
          <div className="mx-auto w-full max-w-lg px-3 pb-3 sm:px-4">
            <div className={groupActionTrayClass}>
              <button
                type="button"
                disabled={swipeExitHold}
                onClick={() => {
                  if (swipeExitHold) return;
                  handleClose();
                }}
                className={[
                  groupActionBase,
                  "border-[var(--border)]/50",
                  "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
                  "text-[var(--text)]",
                  "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
                ].join(" ")}
              >
                Close
              </button>

              {ownsActive ? (
                <button
                  type="button"
                  onClick={handleMyGroup}
                  className={[
                    "group/social relative min-w-0 flex-1 overflow-visible",
                    GROUP_ACTION_H,
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none absolute inset-0 z-0 rounded-full",
                      "translate-x-[-2.5px] translate-y-[2.5px]",
                      "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
                      "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span
                    className={[
                      "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
                      "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
                      "bg-[var(--brand)] text-[var(--brand-ink)]",
                      "px-1.5 text-xs font-semibold leading-none tracking-tight",
                      "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
                      "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
                      "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
                    ].join(" ")}
                  >
                    {socialUiCopy.groupMyGroup}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  className={[
                    "group/social relative min-w-0 flex-1 overflow-visible",
                    GROUP_ACTION_H,
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none absolute inset-0 z-0 rounded-full",
                      "translate-x-[-2.5px] translate-y-[2.5px]",
                      "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
                      "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span
                    className={[
                      "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
                      "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
                      "bg-[var(--brand)] text-[var(--brand-ink)]",
                      "px-1.5 text-xs font-semibold leading-none tracking-tight",
                      "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
                      "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
                      "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
                    ].join(" ")}
                  >
                    {socialUiCopy.groupCreate}
                  </span>
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </BottomDrawer>
  );
}
