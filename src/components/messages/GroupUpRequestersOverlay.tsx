/**
 * Group Up requesters overlay — host Accept/Decline for one conversation.
 * Mark-seen uses the opening-captured (latest_request_at, latest_request_id) only.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { PiX } from "react-icons/pi";
import {
  acceptGroupUpRequest,
  declineGroupUpRequest,
  markGroupUpRequestsSeen,
} from "../../api/services/groupUp";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  getGroupUpRequestersOverlayState,
  closeGroupUpRequestersOverlay,
  subscribeGroupUpRequestersOverlay,
} from "../../lib/groupUpRequestersOverlayStore";
import { patchGroupUpRequestGroupsMarkSeen } from "../../lib/groupUpRequestGroupsCache";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import { resolveGroupUpRequesterProfileOpenKey } from "../../lib/people/resolveRequesterProfileOpenKey";
import type { GroupUpRequester } from "../../lib/people/types";
import { getTabFromPath } from "../../router/PersistentTabContainer.new";
import { supabase } from "../../lib/supabaseClient";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { useGroupUpRequesters } from "../../hooks/useGroupUpRequesters";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  echoGroupRequestSwipeInstall,
  echoGroupRequestSwipeLayoutSnapshot,
  echoGroupRequestSwipeRecord,
} from "../../lib/groupUpRequestersSwipeDebug";
import BottomDrawer from "../ui/BottomDrawer";
import GroupUpRequesterDrawerTile from "./GroupUpRequesterDrawerTile";
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
 * Tile: py-1.5 (12) + avatar 56 + name mt-1.5 (6) + 11px snug line (16) +
 * pill mt-1 (4) + h-11 (44) = 138. Grid gap-y-6 = 24. Scroller pt-4 + pb-3 = 28.
 */
const REQUESTER_TILE_HEIGHT_PX = 138;
const REQUESTER_GRID_ROW_GAP_PX = 24;
const REQUESTER_LIST_PAD_Y_PX = 28;
const REQUESTER_GRID_MAX_VISIBLE_ROWS = 4;
const REQUESTER_LIST_FOUR_ROW_MAX_PX =
  REQUESTER_LIST_PAD_Y_PX +
  REQUESTER_GRID_MAX_VISIBLE_ROWS * REQUESTER_TILE_HEIGHT_PX +
  (REQUESTER_GRID_MAX_VISIBLE_ROWS - 1) * REQUESTER_GRID_ROW_GAP_PX;

function useOverlayOpening() {
  return useSyncExternalStore(
    subscribeGroupUpRequestersOverlay,
    () => getGroupUpRequestersOverlayState().opening,
    () => null
  );
}

export default function GroupUpRequestersOverlay() {
  const opening = useOverlayOpening();
  const held = Boolean(opening);
  const location = useLocation();
  const tab = getTabFromPath(location.pathname);
  const sheetVisible = held && tab === "messages";
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  const markedKeyRef = useRef<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollTopRef = useRef(0);
  const [profilePreview, setProfilePreview] = useState<{
    openKey: string;
    requestId: string;
    requestedAt: string;
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
  } = useGroupUpRequesters({
    conversationId: opening?.conversationId ?? null,
    enabled: held,
  });

  // Mark seen through captured opening cursor after first successful load.
  useEffect(() => {
    if (!held || !opening || !hasLoaded || error) return;
    const key = `${opening.conversationId}:${opening.capturedLatestRequestAt}:${opening.capturedLatestRequestId}`;
    if (markedKeyRef.current === key) return;
    markedKeyRef.current = key;

    const conversationId = opening.conversationId;
    const throughAt = opening.capturedLatestRequestAt;
    const throughId = opening.capturedLatestRequestId;

    void (async () => {
      try {
        await markGroupUpRequestsSeen({
          conversationId,
          throughRequestAt: throughAt,
          throughRequestId: throughId,
        });
        // Always patch after successful RPC — even if this effect cleaned up
        // (React Strict Mode). Skipping left cache new_count stuck until TTL.
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (uid) {
          patchGroupUpRequestGroupsMarkSeen(uid, conversationId, {
            at: throughAt,
            id: throughId,
          });
        }
      } catch {
        if (markedKeyRef.current === key) {
          markedKeyRef.current = null;
        }
      }
    })();
  }, [held, opening, hasLoaded, error]);

  useEffect(() => {
    if (held) return;
    markedKeyRef.current = null;
    setBusyId(null);
    busyIdRef.current = null;
    setProfilePreview(null);
  }, [held]);

  useEffect(() => {
    if (!held) return;
    if (tab === "messages") return;
    setProfilePreview(null);
    closeGroupUpRequestersOverlay();
  }, [held, tab]);

  useEffect(() => {
    if (!sheetVisible) return;
    const el = listScrollRef.current;
    if (el) el.scrollTop = listScrollTopRef.current;
  }, [sheetVisible]);

  useEffect(() => echoGroupRequestSwipeInstall(), []);

  useEffect(() => {
    echoGroupRequestSwipeRecord("lifecycle", {
      sheetVisible,
      tab,
      hookActive: sheetVisible,
    });
  }, [sheetVisible, tab]);

  const handleSwipeCommit = () => {
    echoGroupRequestSwipeRecord("onSwipeCommit", { source: "content-hook" });
    setProfilePreview(null);
    closeGroupUpRequestersOverlay();
    echoGroupRequestSwipeRecord("storeAfterCommit", {
      openingCleared: getGroupUpRequestersOverlayState().opening == null,
      sheetShouldHide: true,
    });
  };

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: sheetVisible && !profilePreview,
      engageSwipe: sheetVisible && !profilePreview,
      // Post Detail's 45vw/180px cap is viewport-left. This inset drawer is a
      // centered max-w-lg panel, so that strip often misses the glass entirely.
      startZoneMaxXVw: 1,
      startZoneMaxPx: 10000,
      leftInsetPx: 0,
      excludeSelector: REQUESTERS_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      allowButtonTargets: false,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: handleSwipeCommit,
      resetToken: opening?.conversationId ?? null,
      onDebugEvent: import.meta.env.DEV
        ? echoGroupRequestSwipeRecord
        : undefined,
    });

  useEffect(() => {
    echoGroupRequestSwipeRecord("motion", {
      hasStyle: Boolean(contentSwipeMotionStyle),
      transform: contentSwipeMotionStyle?.transform ?? null,
    });
  }, [contentSwipeMotionStyle]);

  const overlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(contentSwipeMotionStyle ?? {}),
  };

  const onOverlayPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    echoGroupRequestSwipeRecord("overlay-pointerdown", {
      pointerType: e.pointerType,
      clientX: Math.round(e.clientX),
      clientY: Math.round(e.clientY),
      targetTag: e.target instanceof Element ? e.target.tagName : null,
      currentTag: e.currentTarget.tagName,
      hookActive: sheetVisible,
      panel: echoGroupRequestSwipeLayoutSnapshot(e.currentTarget),
    });
    panelSwipeProps.onPointerDownCapture(e);
  };

  if (!opening) return null;

  const title =
    opening.groupTitle?.trim() || peopleUiCopy.groupUp;
  const description = opening.description?.trim() || null;
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

  const handleProfile = (request: GroupUpRequester) => {
    const openKey = resolveGroupUpRequesterProfileOpenKey(request);
    if (!openKey) return;
    setProfilePreview({
      openKey,
      requestId: request.request_id,
      requestedAt: request.requested_at,
    });
  };

  const handleAccept = async (requestId: string, requestedAt: string) => {
    if (!requestId || busyIdRef.current) return;
    busyIdRef.current = requestId;
    setBusyId(requestId);
    try {
      const result = await acceptGroupUpRequest(requestId, {
        conversationId: opening.conversationId,
        requestedAt,
      });
      if (result.accepted === true) {
        removeRequest(requestId);
        setProfilePreview((prev) =>
          prev?.requestId === requestId ? null : prev
        );
        toast.success(peopleUiCopy.groupUpIncomingAcceptSuccess);
        return;
      }
      if (result.reason === "group_unavailable") {
        removeRequest(requestId);
        setProfilePreview((prev) =>
          prev?.requestId === requestId ? null : prev
        );
        toast(peopleUiCopy.groupUpIncomingUnavailable);
        return;
      }
      toast.error(peopleUiCopy.groupUpIncomingAcceptError);
    } catch {
      toast.error(peopleUiCopy.groupUpIncomingAcceptError);
    } finally {
      busyIdRef.current = null;
      setBusyId(null);
    }
  };

  const handleDecline = async (requestId: string, requestedAt: string) => {
    if (!requestId || busyIdRef.current) return;
    busyIdRef.current = requestId;
    setBusyId(requestId);
    try {
      const result = await declineGroupUpRequest(requestId, {
        conversationId: opening.conversationId,
        requestedAt,
      });
      if (result.declined === true) {
        removeRequest(requestId);
        toast.success(peopleUiCopy.groupUpIncomingDeclineSuccess);
        return;
      }
      toast.error(peopleUiCopy.groupUpIncomingDeclineError);
    } catch {
      toast.error(peopleUiCopy.groupUpIncomingDeclineError);
    } finally {
      busyIdRef.current = null;
      setBusyId(null);
    }
  };

  return (
    <>
      <BottomDrawer
        open={sheetVisible}
        onClose={() => {
          setProfilePreview(null);
          closeGroupUpRequestersOverlay();
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
              {description ? (
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/55">
                  {description}
                </p>
              ) : null}
              {occursLabel ? (
                <p className="mt-0.5 min-w-0">
                  <span
                    data-group-occurs-label
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
                closeGroupUpRequestersOverlay();
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
                {peopleUiCopy.groupUpRequestersLoadError}
              </p>
            ) : requests.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text)]/50">
                {peopleUiCopy.groupUpRequestersEmpty}
              </p>
            ) : (
              <div
                className="grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3"
                role="list"
              >
                {requests.map((row) => (
                  <div key={row.request_id} role="listitem" className="min-w-0">
                    <GroupUpRequesterDrawerTile
                      request={row}
                      busy={busyId === row.request_id}
                      onProfile={handleProfile}
                      onAccept={(requestId, requestedAt) =>
                        void handleAccept(requestId, requestedAt)
                      }
                      onDecline={(requestId, requestedAt) =>
                        void handleDecline(requestId, requestedAt)
                      }
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
                label: peopleUiCopy.groupUpIncomingAccept,
                busy: busyId === profilePreview.requestId,
                onAccept: () =>
                  void handleAccept(
                    profilePreview.requestId,
                    profilePreview.requestedAt
                  ),
              }
            : null
        }
      />
    </>
  );
}
