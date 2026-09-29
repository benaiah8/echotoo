import { useLayoutEffect, type ReactNode } from "react";
import { usePageBackgroundScrollLock } from "../../hooks/usePageBackgroundScrollLock";
import { CREATE_FINALIZE_SHELL_Z_CLASS } from "../../lib/createFlowChrome";

/** Solid through the status/notch, then a short fade (~20% of the 40px header controls). */
const FINALIZE_TOP_FADE_BELOW_SAFE_PX = 20;

/**
 * Finalize composer root bound to the resized layout viewport.
 * EditingCanvas (a child) is the only intended vertical scroller.
 * Document overflow is owned by the nested page-shell lock (no native fixed-body).
 * z-index covers BottomTab (z-40); tab stays mounted underneath.
 *
 * {@link exiting}: approved leave — hide shell immediately so remount lag is not
 * perceived as a frozen Create surface. Does not change layout metrics while open.
 */
export default function CreateFinalizeComposerShell({
  children,
  exiting = false,
}: {
  children: ReactNode;
  exiting?: boolean;
}) {
  useLayoutEffect(() => {
    if (exiting) return;
    window.scrollTo(0, 0);
  }, [exiting]);

  usePageBackgroundScrollLock(true);

  return (
    <div
      className={[
        "fixed inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]",
        CREATE_FINALIZE_SHELL_Z_CLASS,
        exiting
          ? "pointer-events-none invisible opacity-0 !transition-none"
          : "visible opacity-100",
      ].join(" ")}
      aria-hidden={exiting || undefined}
      data-create-finalize-shell
      data-create-finalize-exiting={exiting ? "1" : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-30"
        style={{
          height: `calc(var(--safe-area-top-layout) + ${FINALIZE_TOP_FADE_BELOW_SAFE_PX}px)`,
          background: `linear-gradient(
            to bottom,
            var(--bg) 0,
            var(--bg) var(--safe-area-top-layout),
            color-mix(in oklab, var(--bg) 55%, transparent) calc(var(--safe-area-top-layout) + 10px),
            transparent 100%
          )`,
        }}
      />
      <div className="relative mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
