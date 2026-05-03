import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import CreateChooserPanel from "./CreateChooserPanel";
import CreateDraftEntryDialog from "./CreateDraftEntryDialog";
import { useCreateDraftEntryGate } from "../../hooks/useCreateDraftEntryGate";

const EXIT_MS = 300;
const NAV_DELAY_MS = 280;

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen dim + blur below bottom tab (z-40); z-[38] so tab bar stays tappable.
 * Body scroll locked while open. Enter/exit transitions; backdrop tap closes smoothly.
 */
export default function CreateChooserOverlay({ open, onClose }: Props) {
  const { onPickerContinue, draftEntryDialogProps } = useCreateDraftEntryGate({
    closeChooserOverlay: onClose,
    navDelayMs: NAV_DELAY_MS,
  });
  const [visible, setVisible] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setVisible(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
    exitTimerRef.current = setTimeout(() => {
      setVisible(false);
      exitTimerRef.current = null;
    }, EXIT_MS);
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !animateIn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, animateIn, onClose]);

  const handleBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleContinue = (type: "hangout" | "experience") => {
    onPickerContinue(type);
  };

  const draftDialogOpenRef = useRef(false);
  const onDismissDraftRef = useRef(draftEntryDialogProps.onDismiss);
  draftDialogOpenRef.current = draftEntryDialogProps.open;
  onDismissDraftRef.current = draftEntryDialogProps.onDismiss;

  useEffect(() => {
    if (!open) return;
    return subscribeAndroidHardwareBack(() => {
      if (draftDialogOpenRef.current) {
        onDismissDraftRef.current();
        return;
      }
      onClose();
    });
  }, [open, onClose]);

  if (!visible) return null;

  const transition =
    "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]";
  const show = animateIn;

  return createPortal(
    <div
      className="fixed inset-0 z-[38] flex flex-col justify-end pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Choose what to create"
    >
      <div
        className={[
          "absolute inset-0 pointer-events-auto touch-manipulation",
          transition,
          show ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.58)",
          backdropFilter: "blur(22px) saturate(1.15)",
          WebkitBackdropFilter: "blur(22px) saturate(1.15)",
        }}
        onPointerDown={handleBackdropPointerDown}
        aria-hidden
      />
      <div
        className={[
          "relative z-10 w-full max-w-[min(440px,calc(100vw-24px))] mx-auto px-3 pointer-events-auto",
          transition,
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        ].join(" ")}
        style={{
          paddingBottom: "calc(70px + var(--safe-area-bottom-layout, 0px))",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CreateChooserPanel variant="overlay" onContinue={handleContinue} />
      </div>
      <CreateDraftEntryDialog {...draftEntryDialogProps} />
    </div>,
    document.body
  );
}
