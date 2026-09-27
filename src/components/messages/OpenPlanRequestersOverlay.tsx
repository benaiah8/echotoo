/**
 * Open Plan requesters overlay — Accept for one opportunity.
 * Swipe-to-close matches Group: portal-root capture, pan-y, shrink-with-drag.
 * Closes fully before DM navigation so Back does not reopen a stale list.
 * Profile preview uses Mine-style RequesterProfileOverlay (Back | Accept).
 */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PiX } from "react-icons/pi";
import { acceptOpenPlanRequest } from "../../api/services/openPlans";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  getOpenPlanRequestersOverlayState,
  closeOpenPlanRequestersOverlay,
  subscribeOpenPlanRequestersOverlay,
} from "../../lib/openPlanRequestersOverlayStore";
import { remainingOpenPlanAcceptPatchInputs } from "../../lib/openPlanRequestGroupsCache";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import { resolveOpenPlanRequesterProfileOpenKey } from "../../lib/people/resolveRequesterProfileOpenKey";
import type { OpenPlanRequester } from "../../lib/people/types";
import { getTabFromPath } from "../../router/PersistentTabContainer.new";
import {
  isMessagesConversationPath,
  messagesConversationPath,
} from "../../router/Paths";
import { normalizeMessagesInboxBackground } from "../../lib/messages/dismissConversationNav";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { useOpenPlanRequesters } from "../../hooks/useOpenPlanRequesters";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import BottomDrawer from "../ui/BottomDrawer";
import OpenPlanRequesterDrawerTile from "./OpenPlanRequesterDrawerTile";
import RequesterProfileOverlay from "./RequesterProfileOverlay";

const REQUESTERS_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

/**
 * Visual cap for the inner requester scroller: four complete grid rows.
 * Tile: py-1.5 (12) + avatar 56 + name mt-1.5 (6) + 12.5px snug (~18) +
 * Accept mt-1 (4) + min-h-11 hit (44) = 140. Grid gap-y-6 = 24. Scroller pt-4 + pb-3 = 28.
 */
const REQUESTER_TILE_HEIGHT_PX = 140;
const REQUESTER_GRID_ROW_GAP_PX = 24;
const REQUESTER_LIST_PAD_Y_PX = 28;
const REQUESTER_GRID_MAX_VISIBLE_ROWS = 4;
const REQUESTER_LIST_FOUR_ROW_MAX_PX =
  REQUESTER_LIST_PAD_Y_PX +
  REQUESTER_GRID_MAX_VISIBLE_ROWS * REQUESTER_TILE_HEIGHT_PX +
  (REQUESTER_GRID_MAX_VISIBLE_ROWS - 1) * REQUESTER_GRID_ROW_GAP_PX;

function useOverlayOpening() {
  return useSyncExternalStore(
    subscribeOpenPlanRequestersOverlay,
    () => getOpenPlanRequestersOverlayState().opening,
    () => null
  );
}

function overlayTitle(opening: {
  planDescription: string | null;
  sourceCaption: string | null;
}): string {
  return (
    opening.planDescription?.trim() ||
    opening.sourceCaption?.trim() ||
    peopleUiCopy.openPlanIncomingLabel
  );
}

function overlaySecondary(opening: {
  planDescription: string | null;
  sourceCaption: string | null;
}): string | null {
  if (!opening.planDescription?.trim()) return null;
  return opening.sourceCaption?.trim() || null;
}

export default function OpenPlanRequestersOverlay() {
  const opening = useOverlayOpening();
  const held = Boolean(opening);
  const location = useLocation();
  const tab = getTabFromPath(location.pathname);
  const sheetVisible =
    held && tab === "messages" && !isMessagesConversationPath(location.pathname);
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollTopRef = useRef(0);
  const [profilePreview, setProfilePreview] = useState<{
    openKey: string;
    requestId: string;
  } | null>(null);

  const {
    requests,
    loading,
    hasLoaded,
    error,
    removeRequest,
    loadMore,
    hasMore,
    isValidating,
  } = useOpenPlanRequesters({
    opportunityId: opening?.opportunityId ?? null,
    enabled: held,
  });

  useEffect(() => {
    if (held) return;
    setBusyId(null);
    busyIdRef.current = null;
    setProfilePreview(null);
  }, [held]);

  useEffect(() => {
    if (!held) return;
    if (tab === "messages" && !isMessagesConversationPath(location.pathname)) {
      return;
    }
    setProfilePreview(null);
    closeOpenPlanRequestersOverlay();
  }, [held, tab, location.pathname]);

  useEffect(() => {
    if (!sheetVisible) return;
    const el = listScrollRef.current;
    if (el) el.scrollTop = listScrollTopRef.current;
  }, [sheetVisible]);

  const handleSwipeCommit = () => {
    setProfilePreview(null);
    closeOpenPlanRequestersOverlay();
  };

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: sheetVisible && !profilePreview,
      engageSwipe: sheetVisible && !profilePreview,
      startZoneMaxXVw: 1,
      startZoneMaxPx: 10000,
      leftInsetPx: 0,
      excludeSelector: REQUESTERS_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      allowButtonTargets: false,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: handleSwipeCommit,
      resetToken: opening?.opportunityId ?? null,
    });

  const overlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(contentSwipeMotionStyle ?? {}),
  };

  const onOverlayPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    panelSwipeProps.onPointerDownCapture(e);
  };

  if (!opening) return null;

  const title = overlayTitle(opening);
  const secondary = overlaySecondary(opening);
  const occursIso = opening.occursAt?.trim() || "";
  const occursLabel = occursIso
    ? formatSocialOccursSchedule(
        occursIso,
        opening.occursTimeExplicit !== false
      ).trim() || null
    : null;
  const pendingCount = Math.max(
    0,
    Math.floor(Math.max(opening.pendingCount, requests.length))
  );
  const pendingBadge = pendingCount > 99 ? "99+" : String(pendingCount);

  const handleAccept = async (requestId: string) => {
    if (!requestId || busyIdRef.current) return;
    busyIdRef.current = requestId;
    setBusyId(requestId);
    try {
      const acceptedWasLatest = requests[0]?.request_id === requestId;
      const remaining = requests.filter((row) => row.request_id !== requestId);
      const nextCount = Math.max(0, pendingCount - 1);
      const patch = remainingOpenPlanAcceptPatchInputs(remaining, nextCount);

      const result = await acceptOpenPlanRequest(requestId, {
        opportunityId: opening.opportunityId,
        remainingPreviews: patch.remainingPreviews,
        remainingLatest: patch.remainingLatest,
        acceptedWasLatest,
      });
      const conversationId = result.conversation_id?.trim() || "";

      if (result.accepted === true && conversationId) {
        removeRequest(requestId);
        setProfilePreview(null);
        closeOpenPlanRequestersOverlay();
        navigate(messagesConversationPath(conversationId), {
          state: {
            backgroundLocation: normalizeMessagesInboxBackground(location),
          },
        });
        return;
      }

      if (result.accepted === true) {
        toast.error(peopleUiCopy.openPlanIncomingAcceptMissingDm);
        removeRequest(requestId);
        setProfilePreview(null);
        closeOpenPlanRequestersOverlay();
        return;
      }

      if (result.reason === "plan_unavailable") {
        toast(peopleUiCopy.openPlanIncomingUnavailable);
        setProfilePreview(null);
        closeOpenPlanRequestersOverlay();
        return;
      }

      toast.error(peopleUiCopy.openPlanIncomingAcceptError);
    } catch {
      toast.error(peopleUiCopy.openPlanIncomingAcceptError);
    } finally {
      busyIdRef.current = null;
      setBusyId(null);
    }
  };

  const handleProfile = (request: OpenPlanRequester) => {
    const openKey = resolveOpenPlanRequesterProfileOpenKey(request);
    if (!openKey) return;
    setProfilePreview({ openKey, requestId: request.request_id });
  };

  return (
    <>
      <BottomDrawer
        open={sheetVisible}
        onClose={() => {
          setProfilePreview(null);
          closeOpenPlanRequestersOverlay();
        }}
        portalClassName="z-[130]"
        overlayStyle={overlaySwipeStyle}
        onOverlayPointerDownCapture={onOverlayPointerDownCapture}
        shrinkSheetToContent
        bodyScrollable={false}
        maxHeight="88vh"
        transparentSheet
        showCloseButton={false}
        contentClassName="px-3 pt-1 sm:px-4"
      >
        <div
          data-requesters-swipe-panel
          className={`${glassPeoplePanelClass} mx-auto flex max-h-[min(82vh,720px)] w-full max-w-lg flex-col`}
        >
          <div className="flex shrink-0 items-start gap-2 px-3 pt-3 pb-1.5">
            <span
              data-pending-count-badge
              className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold tabular-nums leading-none text-[var(--brand-ink)]"
            >
              {pendingBadge}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
                {title}
              </p>
              {secondary ? (
                <p className="mt-0.5 truncate text-[12.5px] leading-snug text-[var(--text)]/55">
                  {secondary}
                </p>
              ) : null}
              {occursLabel ? (
                <p className="mt-0.5 min-w-0">
                  <span
                    data-open-plan-occurs-label
                    className="inline-block max-w-full truncate rounded-sm bg-[var(--green-bg)] px-1 py-px text-[12.5px] leading-snug text-[var(--green-text)]"
                  >
                    {occursLabel}
                  </span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setProfilePreview(null);
                closeOpenPlanRequestersOverlay();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/70"
              aria-label="Close"
            >
              <PiX className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div
            ref={listScrollRef}
            onScroll={(e) => {
              listScrollTopRef.current = e.currentTarget.scrollTop;
            }}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-4"
            style={{
              maxHeight: `min(${REQUESTER_LIST_FOUR_ROW_MAX_PX}px, calc(82vh - 7.5rem))`,
            }}
          >
            {loading && !hasLoaded ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text)]/50">
                …
              </p>
            ) : error && requests.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text)]/50">
                {peopleUiCopy.openPlanRequestersLoadError}
              </p>
            ) : requests.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text)]/50">
                {peopleUiCopy.openPlanRequestersEmpty}
              </p>
            ) : (
              <div
                className="grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3"
                role="list"
              >
                {requests.map((row) => (
                  <div key={row.request_id} role="listitem" className="min-w-0">
                    <OpenPlanRequesterDrawerTile
                      request={row}
                      busy={busyId === row.request_id}
                      onAccept={(id) => void handleAccept(id)}
                      onProfile={handleProfile}
                    />
                  </div>
                ))}
              </div>
            )}
            {hasMore ? (
              <button
                type="button"
                disabled={isValidating}
                onClick={() => void loadMore()}
                className="mx-auto my-3 block min-h-10 px-4 text-[13px] font-semibold text-[var(--text)]/55"
              >
                {isValidating ? "…" : "Load more"}
              </button>
            ) : null}
          </div>
        </div>
      </BottomDrawer>

      <RequesterProfileOverlay
        openKey={profilePreview?.openKey ?? null}
        onClose={() => setProfilePreview(null)}
        acceptAction={
          profilePreview
            ? {
                label: peopleUiCopy.openPlanIncomingAccept,
                busy: busyId === profilePreview.requestId,
                onAccept: () => void handleAccept(profilePreview.requestId),
              }
            : null
        }
      />
    </>
  );
}
