import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import type { OwlMessageCategory } from "../../lib/owlMessages";
import owlSvg from "../../assets/btmtabicon.svg";

export type OwlMessageModalProps = {
  open: boolean;
  onClose: () => void;
  /** Current line to show (emoji-safe). */
  message: string;
  /** Optional category for subtle typography hooks on the message block. */
  messageCategory?: OwlMessageCategory;
};

const OWL_PX = 60;
/** Matches `.owl-message-modal-panel--exit` duration */
const EXIT_MS = 320;

/**
 * Center frosted card (same shell as ConfirmDialog): message on top, owl at bottom.
 * Close is deferred so exit animations can finish (backdrop + Escape).
 */
export default function OwlMessageModal({
  open,
  onClose,
  message,
  messageCategory,
}: OwlMessageModalProps) {
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) {
      setExiting(false);
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

  const panelAnim = exiting
    ? "owl-message-modal-panel--exit"
    : "owl-message-modal-panel";
  const owlAnim = exiting
    ? "owl-message-modal-owl--exit"
    : "owl-message-modal-owl";

  const { borderColor: _panelBorder, ...panelSurfaceStyle } =
    frostedModalPanelStyle;

  const messageLines = useMemo(() => message.split(/\r?\n/), [message]);
  const multiLine = messageLines.length > 1;

  const bodyClass = [
    "owl-message-body",
    messageCategory ? `owl-message-body--cat-${messageCategory}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={requestClose}
      zTier="dialog"
      aria-label="Owl message"
      aria-modal
      role="dialog"
      containerClassName="px-6 sm:px-10"
    >
      <div
        className={`${frostedModalPanelClassName} ${panelAnim} flex max-h-[min(72vh,480px)] min-h-[180px] flex-col overflow-hidden !p-0 border border-[var(--owl-message-modal-border)] border-b-[3px] border-b-white`}
        style={{
          ...panelSurfaceStyle,
          maxWidth: "min(320px, calc(100vw - 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Single accent rule ~50% width — bolder gold gradient */}
        <div
          className="flex shrink-0 flex-col items-center px-4 pt-5 pb-0"
          aria-hidden
        >
          <div
            className="h-1 w-1/2 max-w-[160px] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--owl-message-modal-deco-accent), transparent)",
            }}
          />
        </div>

        <div className="owl-message-text-well mx-4 mt-4 mb-3 min-h-0 flex-1 overflow-y-auto rounded-2xl px-4 py-5 text-center">
          <div className={bodyClass}>
            {messageLines.map((line, i) => (
              <p
                key={i}
                className={[
                  "owl-message-line",
                  multiLine && i === 0 ? "owl-message-line--lead" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {line.length > 0 ? line : "\u00a0"}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-auto flex shrink-0 justify-center self-stretch overflow-hidden leading-none">
          <img
            src={owlSvg}
            alt=""
            width={OWL_PX}
            height={OWL_PX}
            className={`${owlAnim} block max-w-none select-none object-contain object-bottom pointer-events-none`}
            style={{ width: OWL_PX, height: OWL_PX }}
            draggable={false}
          />
        </div>
      </div>
    </FrostedCenterModal>
  );
}
