/**
 * People-owned portal: real OtherProfilePage above Mine deck (B3).
 * Stays on /people; synthetic history closes without leaving the tab.
 * Footer: Back only, or Back | Connect (Mine-origin) — same paired pill as
 * RequesterProfileOverlay (Requests). Dismiss: footer Back, browser/Android
 * Back, Escape — no X, no swipe.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { matchPath, useLocation } from "react-router-dom";
import { PiArrowLeft } from "react-icons/pi";
import OtherProfilePage from "../../pages/OtherProfilePage";
import { useInviteOverlaySyntheticHistory } from "../../hooks/useInviteOverlaySyntheticHistory";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import {
  MINE_CANDIDATE_PROFILE_HISTORY_MARKER,
  notifyMineCandidateProfileClosed,
  notifyMineCandidateProfileOpened,
} from "../../lib/people/mineCandidateProfileOverlayBackGuard";
import type { PeopleEmbeddedProfileOpen } from "../../lib/people/groupHostProfileOpenContext";
import { glassActionSheetPillClass } from "../../lib/glassActionSheetStyles";
import { Paths } from "../../router/Paths";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** Below PostDetailModal (120) and media lightboxes (10050); above People chrome. */
const MINE_PROFILE_OVERLAY_Z = 90;

/** Room under scroll content for the floating Back|Connect pill + safe area. */
const MINE_PROFILE_SCROLL_BOTTOM_PAD =
  "calc(4.75rem + var(--safe-area-bottom-layout, 0px))";

/** Shared with RequesterProfileOverlay Back / secondary action faces. */
const FOOTER_SECONDARY_BTN_CLASS = [
  "inline-flex h-10 min-w-[5.75rem] items-center justify-center gap-1.5 rounded-full px-3.5",
  "text-[13px] font-semibold text-[var(--text)]",
  "bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)]",
  "touch-manipulation active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

/** Brand yellow Connect — paired with Back in the frosted footer pill. */
const FOOTER_CONNECT_BTN_CLASS = [
  "inline-flex h-10 min-w-[5.75rem] items-center justify-center rounded-full px-3.5",
  "border border-[var(--brand-glass-border)] bg-[var(--brand)]",
  "text-[13px] font-semibold text-[var(--brand-ink)]",
  "touch-manipulation active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

function isRouteChildOverlayAboveMine(pathname: string): boolean {
  return Boolean(
    matchPath({ path: Paths.experienceDetail, end: true }, pathname) ||
      matchPath({ path: Paths.hangoutDetail, end: true }, pathname),
  );
}

export default function MineCandidateProfileOverlay({
  open,
  connectBusy = false,
  connectDisabled = false,
  onConnect,
  onClose,
}: {
  /** Mine/Discover PairUp context, or Groups host (Back-only). */
  open: PeopleEmbeddedProfileOpen | null;
  connectBusy?: boolean;
  connectDisabled?: boolean;
  onConnect?: () => void;
  onClose: () => void;
}) {
  const openKey = open?.openKey ?? null;
  const isOpen = Boolean(openKey);
  const location = useLocation();
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  /**
   * Capacitor backButton notifies every subscriber. While Post Detail (route overlay)
   * is above Mine, ignore history/Android/Escape dismiss here so the child owns Back.
   */
  const routeChildOverlayOpen = useMemo(
    () => isRouteChildOverlayAboveMine(location.pathname),
    [location.pathname],
  );

  const handleHistoryDismiss = useCallback(() => {
    if (isRouteChildOverlayAboveMine(window.location.pathname)) return;
    onCloseRef.current();
  }, []);

  useOverlayBackgroundScrollLock(isOpen);

  useInviteOverlaySyntheticHistory({
    engage: isOpen,
    marker: MINE_CANDIDATE_PROFILE_HISTORY_MARKER,
    onDismiss: handleHistoryDismiss,
  });

  useEffect(() => {
    if (!isOpen) return;
    notifyMineCandidateProfileOpened();
    const t = window.setTimeout(() => {
      try {
        overlayRootRef.current?.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
      notifyMineCandidateProfileClosed();
    };
  }, [isOpen, openKey]);

  if (!isOpen || !open || !openKey || typeof document === "undefined") {
    return null;
  }

  const showConnect = Boolean(
    onConnect && open.opportunityId && open.scope === "my_plans",
  );
  const connectMuted = connectBusy || connectDisabled;

  return createPortal(
    <div
      ref={overlayRootRef}
      className="fixed inset-0 flex flex-col bg-[var(--bg)] text-[var(--text)] outline-none"
      style={{ zIndex: MINE_PROFILE_OVERLAY_Z }}
      role="dialog"
      aria-modal="true"
      aria-label={peopleUiCopy.deckOpenProfile}
      tabIndex={-1}
      data-people-mine-profile-overlay="true"
      data-people-mine-profile-opportunity={open.opportunityId}
      data-people-embedded-profile-scope={open.scope}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: MINE_PROFILE_SCROLL_BOTTOM_PAD }}
      >
        <OtherProfilePage
          username={openKey}
          embedded
          onEmbeddedClose={handleClose}
        />
      </div>

      {!routeChildOverlayOpen ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4"
          style={{
            paddingBottom:
              "calc(10px + var(--safe-area-bottom-layout, 0px))",
          }}
          data-people-mine-profile-footer={
            showConnect ? "back-connect" : "back"
          }
        >
          <div
            className={[
              "pointer-events-auto inline-flex items-center gap-1 p-1",
              glassActionSheetPillClass,
            ].join(" ")}
            data-people-mine-profile-action-pill
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={connectBusy}
              aria-label={peopleUiCopy.shellBack}
              className={FOOTER_SECONDARY_BTN_CLASS}
            >
              <PiArrowLeft
                className="h-[17px] w-[17px] shrink-0"
                aria-hidden
              />
              <span>{peopleUiCopy.shellBack}</span>
            </button>
            {showConnect && onConnect ? (
              <button
                type="button"
                onClick={() => {
                  if (connectMuted) return;
                  onConnect();
                }}
                disabled={connectMuted}
                aria-busy={connectBusy}
                aria-label={peopleUiCopy.deckConnectLabel}
                className={FOOTER_CONNECT_BTN_CLASS}
                data-people-mine-profile-connect-hit="true"
              >
                {connectBusy ? "…" : peopleUiCopy.deckConnectLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
