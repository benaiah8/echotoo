/**
 * Request-context full-page profile: Mine-style portal + embedded OtherProfilePage.
 * Back-only by default; optional Accept footer ONLY for incoming-request opens.
 * Does not replace MineCandidateProfileOverlay.
 */
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PiArrowLeft } from "react-icons/pi";
import OtherProfilePage from "../../pages/OtherProfilePage";
import { useInviteOverlaySyntheticHistory } from "../../hooks/useInviteOverlaySyntheticHistory";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { glassActionSheetPillClass } from "../../lib/glassActionSheetStyles";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** Above requesters drawers (z-[130]); below media lightboxes. */
const REQUESTER_PROFILE_OVERLAY_Z = 140;

const REQUESTER_PROFILE_HISTORY_MARKER = "requesterProfileOverlay";

/** Room under scroll for the floating Back|Accept pill + safe area. */
const REQUESTER_PROFILE_SCROLL_BOTTOM_PAD =
  "calc(4.75rem + var(--safe-area-bottom-layout, 0px))";

export type RequesterProfileAcceptAction = {
  label: string;
  busy: boolean;
  onAccept: () => void;
};

export default function RequesterProfileOverlay({
  openKey,
  onClose,
  acceptAction = null,
}: {
  /** Username or UUID for OtherProfilePage / getProfileByIdOrUsername. */
  openKey: string | null;
  onClose: () => void;
  /** When set, footer is Back | Accept (request context only). */
  acceptAction?: RequesterProfileAcceptAction | null;
}) {
  const open = Boolean(openKey);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  useOverlayBackgroundScrollLock(open);

  useInviteOverlaySyntheticHistory({
    engage: open,
    marker: REQUESTER_PROFILE_HISTORY_MARKER,
    onDismiss: handleClose,
  });

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      try {
        overlayRootRef.current?.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }, 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [open, openKey]);

  if (!open || !openKey || typeof document === "undefined") {
    return null;
  }

  const showAccept = Boolean(acceptAction);
  const acceptBusy = acceptAction?.busy === true;

  return createPortal(
    <div
      ref={overlayRootRef}
      className="fixed inset-0 flex flex-col bg-[var(--bg)] text-[var(--text)] outline-none"
      style={{ zIndex: REQUESTER_PROFILE_OVERLAY_Z }}
      role="dialog"
      aria-modal="true"
      aria-label={peopleUiCopy.deckOpenProfile}
      tabIndex={-1}
      data-requester-profile-overlay="true"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: REQUESTER_PROFILE_SCROLL_BOTTOM_PAD }}
      >
        <OtherProfilePage
          username={openKey}
          embedded
          onEmbeddedClose={handleClose}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4"
        style={{
          paddingBottom: "calc(10px + var(--safe-area-bottom-layout, 0px))",
        }}
        data-requester-profile-footer={showAccept ? "back-accept" : "back"}
      >
        <div
          className={[
            "pointer-events-auto inline-flex items-center gap-1 p-1",
            glassActionSheetPillClass,
          ].join(" ")}
          data-requester-profile-action-pill
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={acceptBusy}
            aria-label={peopleUiCopy.shellBack}
            className={[
              "inline-flex h-10 min-w-[5.75rem] items-center justify-center gap-1.5 rounded-full px-3.5",
              "text-[13px] font-semibold text-[var(--text)]",
              "bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)]",
              "touch-manipulation active:scale-[0.97]",
              "disabled:pointer-events-none disabled:opacity-40",
            ].join(" ")}
          >
            <PiArrowLeft className="h-[17px] w-[17px] shrink-0" aria-hidden />
            <span>{peopleUiCopy.shellBack}</span>
          </button>
          {showAccept && acceptAction ? (
            <button
              type="button"
              onClick={() => {
                if (acceptBusy) return;
                acceptAction.onAccept();
              }}
              disabled={acceptBusy}
              aria-busy={acceptBusy}
              aria-label={acceptAction.label}
              className={[
                "inline-flex h-10 min-w-[5.75rem] items-center justify-center rounded-full px-3.5",
                "border border-[var(--brand-glass-border)] bg-[var(--brand)]",
                "text-[13px] font-semibold text-[var(--brand-ink)]",
                "touch-manipulation active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-40",
              ].join(" ")}
            >
              {acceptBusy ? "…" : acceptAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
