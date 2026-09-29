/**
 * Ordinary top-toaster error toast — dismiss X + fail-safe lifetime.
 *
 * react-hot-toast pauses its own duration on toaster mouse-enter (hardcoded;
 * no pauseOnHover prop in 2.6). An independent wall-clock timer ensures errors
 * cannot stick indefinitely after a mobile touch "hover" pause.
 *
 * Does not affect social-action / discover-pref toasters or loading toasts.
 */

import { useEffect, type CSSProperties } from "react";
import toast, { ToastBar, type Toast } from "react-hot-toast";
import { PiX } from "react-icons/pi";

/** Ordinary error auto-dismiss target (ms). */
export const ORDINARY_ERROR_TOAST_DURATION_MS = 7000;

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearOrdinaryErrorFailSafe(id: string): void {
  const handle = dismissTimers.get(id);
  if (handle != null) {
    clearTimeout(handle);
    dismissTimers.delete(id);
  }
}

/**
 * Arm an independent dismiss that ignores react-hot-toast hover pause.
 * Safe to call repeatedly for the same id (resets the timer).
 */
export function armOrdinaryErrorFailSafe(
  id: string,
  durationMs: number = ORDINARY_ERROR_TOAST_DURATION_MS
): void {
  if (!id) return;
  clearOrdinaryErrorFailSafe(id);
  if (durationMs <= 0 || !Number.isFinite(durationMs)) return;
  const handle = setTimeout(() => {
    dismissTimers.delete(id);
    toast.dismiss(id);
  }, durationMs);
  dismissTimers.set(id, handle);
}

export function __hasOrdinaryErrorFailSafeForTests(id: string): boolean {
  return dismissTimers.has(id);
}

export function __resetOrdinaryErrorFailSafesForTests(): void {
  for (const handle of dismissTimers.values()) clearTimeout(handle);
  dismissTimers.clear();
}

const dismissBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 44,
  height: 44,
  margin: "-8px -6px -8px 0",
  padding: 0,
  border: "none",
  borderRadius: 9999,
  background: "transparent",
  color: "inherit",
  opacity: 0.72,
  cursor: "pointer",
};

/**
 * Default Toaster child renderer: errors get X + fail-safe; other types unchanged.
 */
export default function OrdinaryErrorToastBar({
  toast: t,
}: {
  toast: Toast;
}) {
  useEffect(() => {
    if (t.type !== "error") {
      clearOrdinaryErrorFailSafe(t.id);
      return;
    }
    if (!t.visible) {
      clearOrdinaryErrorFailSafe(t.id);
      return;
    }
    armOrdinaryErrorFailSafe(t.id, ORDINARY_ERROR_TOAST_DURATION_MS);
    return () => {
      clearOrdinaryErrorFailSafe(t.id);
    };
  }, [t.id, t.type, t.visible]);

  if (t.type !== "error") {
    return <ToastBar toast={t} />;
  }

  return (
    <ToastBar toast={t}>
      {({ icon, message }) => (
        <>
          {icon}
          {message}
          <button
            type="button"
            aria-label="Dismiss"
            data-ordinary-error-toast-dismiss
            data-toast-id={t.id}
            style={dismissBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              clearOrdinaryErrorFailSafe(t.id);
              toast.dismiss(t.id);
            }}
          >
            <PiX size={18} aria-hidden />
          </button>
        </>
      )}
    </ToastBar>
  );
}
