import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PiArrowLeft, PiX } from "react-icons/pi";
import OwlGamesMenu from "./OwlGamesMenu";
import NightWatchGame from "../games/NightWatchGame";
import WhackAnOwlGame from "../games/WhackAnOwlGame";
import OwlFlapGame from "../games/OwlFlapGame";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import type { GameId } from "../../lib/gameHighScores";

export type OwlMessageModalProps = {
  open: boolean;
  onClose: () => void;
};

type OwlModalView = "games" | GameId;

/** Matches `.owl-message-modal-panel--exit` duration */
const EXIT_MS = 320;

/**
 * Full-screen owl games overlay. Opened from the bottom-tab peek owl.
 * Close is deferred so the exit animation can finish.
 */
export default function OwlMessageModal({
  open,
  onClose,
}: OwlMessageModalProps) {
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [view, setView] = useState<OwlModalView>("games");
  const [isOwlFlapPlaying, setIsOwlFlapPlaying] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useOverlayBackgroundScrollLock(open);

  useEffect(() => {
    if (!open) {
      setExiting(false);
      setView("games");
      setIsOwlFlapPlaying(false);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (exiting) return;
    if (reduceMotion) {
      onClose();
      return;
    }
    setExiting(true);
    const id = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, EXIT_MS);
    closeTimerRef.current = id;
  }, [exiting, onClose, reduceMotion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  const overlayAnim = exiting
    ? "owl-message-modal-panel--exit"
    : "owl-message-modal-panel";
  const isGame = view !== "games";

  const chromeCircleClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--glass-active-shadow)] transition-transform active:scale-90";
  const chromeLabelClass =
    "text-[11px] font-medium leading-none text-[var(--text)]/80";

  return createPortal(
    <div
      className={`fixed inset-0 z-[500] flex min-h-0 flex-col ${overlayAnim}`}
      role="dialog"
      aria-modal
      aria-label="Owl games"
      style={{
        backgroundColor: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingTop: "max(1.25rem, var(--safe-area-top-layout))",
        }}
      >
        {isGame ? (
          <div className="min-h-0 flex-1">
            {view === "nightWatch" && <NightWatchGame />}
            {view === "whackAnOwl" && <WhackAnOwlGame />}
            {view === "owlFlap" && (
              <OwlFlapGame onPhaseChange={setIsOwlFlapPlaying} />
            )}
          </div>
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center px-6"
            style={{
              paddingTop: "0.5rem",
              paddingBottom:
                "max(0.5rem, calc(0.5rem + var(--safe-area-bottom-layout)))",
            }}
          >
            <div className="shrink-0 pb-4 text-center">
              <p className="text-sm font-semibold text-[var(--text)]">
                Mini-games
              </p>
              <p className="mt-1 text-[12px] text-[var(--text)]/60">
                Pick one to play
              </p>
            </div>
            <OwlGamesMenu onSelect={setView} />
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="mt-5 flex flex-col items-center gap-1.5"
            >
              <span className={chromeCircleClass}>
                <PiX className="h-5 w-5" aria-hidden />
              </span>
              <span className={chromeLabelClass}>Close</span>
            </button>
          </div>
        )}
      </div>

      {isGame && !(view === "owlFlap" && isOwlFlapPlaying) && (
        <div
          className="z-20 flex shrink-0 items-center justify-center gap-5 px-8 pt-1"
          style={{
            paddingBottom:
              "max(1.25rem, calc(0.75rem + var(--safe-area-bottom-layout)))",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsOwlFlapPlaying(false);
              setView("games");
            }}
            aria-label="Back to games"
            className="flex flex-col items-center gap-1.5"
          >
            <span className={chromeCircleClass}>
              <PiArrowLeft size={18} aria-hidden />
            </span>
            <span className={chromeLabelClass}>Back</span>
          </button>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex flex-col items-center gap-1.5"
          >
            <span className={chromeCircleClass}>
              <PiX className="h-5 w-5" aria-hidden />
            </span>
            <span className={chromeLabelClass}>Close</span>
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
