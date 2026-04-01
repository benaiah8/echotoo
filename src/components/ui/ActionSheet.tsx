// src/components/ui/ActionSheet.tsx
import React, { useEffect, useState } from "react";

type Props = {
  onBack: () => void;
  onPublish: () => void;
  onSaveDraft?: () => void;
  publishing?: boolean;
  backText?: string;
  publishText?: string;
  onExit?: () => void;
  isEditMode?: boolean;
  /** When set, Publish and Save draft are disabled and this hint is shown above the action strip. */
  pendingUploadsNotice?: string;
  /**
   * Disables Publish / Save draft while uploads are pending without showing the notice banner
   * (e.g. Preview uses an overlay on the media area instead).
   */
  lockActionsWhilePendingUploads?: boolean;
  /** When true, the action strip stays visible while scrolling (no hide-on-scroll). */
  stableActions?: boolean;
  /**
   * Stronger separation from page content: theme-aware upward drop shadow on the strip
   * (e.g. create finalize). No gradient scrim — shadow only. Does not change behavior.
   */
  enhancedSurface?: boolean;
};

/** Keep in sync with CreateTabsSection */
const GAP_ABOVE_TAB = 16;

/**
 * Preview Back / Publish strip height (px). Slightly taller than create Prev/Next for a bolder bar — tune here.
 */
const PREVIEW_ACTION_STRIP_HEIGHT_PX = 36;

const btnStretch =
  "flex h-full min-h-0 flex-1 min-w-0 basis-0 items-center justify-center rounded-full";

const innerGlassPill = `${btnStretch} border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] px-2 sm:px-3`;

const publishPillBase = `${btnStretch} bg-[var(--brand)] text-[var(--brand-ink)] border border-[var(--brand)] px-2 sm:px-3 font-semibold text-[12px] sm:text-[13px] leading-none hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60`;

const exitPillBase = `${btnStretch} border border-red-500 text-red-500 px-2 sm:px-3 font-semibold text-[12px] sm:text-[13px] leading-none hover:bg-red-500/10 active:scale-[0.99] transition`;

export default function ActionSheet({
  onBack,
  onPublish,
  onSaveDraft,
  publishing = false,
  backText = "Back",
  publishText = "Publish",
  onExit,
  isEditMode = false,
  pendingUploadsNotice,
  lockActionsWhilePendingUploads = false,
  stableActions = false,
  enhancedSurface = false,
}: Props) {
  const [btHeight, setBtHeight] = useState(0);
  const [btWidth, setBtWidth] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () => {
      if (!el) {
        setBtHeight(0);
        setBtWidth(0);
        return;
      }
      const r = el.getBoundingClientRect();
      setBtHeight(Math.round(r.height));
      setBtWidth(Math.round(r.width));
    };
    measure();
    window.addEventListener("resize", measure);
    const mo = el ? new MutationObserver(measure) : null;
    if (el && mo)
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    const end = () => measure();
    el?.addEventListener("transitionend", end);
    return () => {
      window.removeEventListener("resize", measure);
      el?.removeEventListener("transitionend", end);
      mo?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (stableActions) {
      setHidden(false);
      return;
    }
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          setHidden(current > 60);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stableActions]);

  const bottomOffset = btHeight > 0 ? btHeight + GAP_ABOVE_TAB : GAP_ABOVE_TAB;
  const rowH = PREVIEW_ACTION_STRIP_HEIGHT_PX;
  const actionsLocked =
    Boolean(pendingUploadsNotice) || lockActionsWhilePendingUploads;
  const primaryDisabled = publishing || actionsLocked;

  const outerStyle: React.CSSProperties =
    btWidth > 0
      ? {
          width: btWidth,
          maxWidth: "calc(100vw - 24px)",
          height: rowH,
        }
      : { width: "min(100vw - 24px, 640px)", height: rowH };

  const backPillClass = innerGlassPill;

  return (
    <div
      className="fixed inset-x-0 z-30 flex flex-col items-center pointer-events-none"
      style={{ bottom: bottomOffset }}
    >
      {pendingUploadsNotice ? (
        <div className="pointer-events-auto mb-2 w-full max-w-[min(640px,calc(100vw-24px))] px-3">
          <p
            className="rounded-xl border border-[var(--border)] bg-[var(--glass-bg)] px-3 py-2.5 text-center text-[12px] font-medium leading-snug text-[var(--text)]/90 shadow-sm backdrop-blur-[var(--glass-blur)] sm:text-[13px]"
            role="status"
            aria-live="polite"
          >
            {pendingUploadsNotice}
          </p>
        </div>
      ) : null}
      <div
        className={[
          "flex w-full justify-center transition-transform duration-300",
          hidden ? "translate-y-[110%]" : "translate-y-0",
        ].join(" ")}
      >
        <div
          className={[
            "pointer-events-auto flex items-stretch gap-2 rounded-full",
            "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
            enhancedSurface
              ? "shadow-[0_-10px_28px_-6px_rgba(0,0,0,0.2),0_6px_20px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_-14px_40px_-8px_rgba(0,0,0,0.55),0_8px_24px_-6px_rgba(0,0,0,0.35)]"
              : "",
            btWidth > 0 ? "max-w-none" : "max-w-[min(640px,calc(100vw-24px))]",
          ].join(" ")}
          style={outerStyle}
        >
          {isEditMode && onExit ? (
            <>
              <button type="button" onClick={onBack} className={backPillClass}>
                <span className="truncate text-[12px] sm:text-[13px] font-semibold text-[var(--text)]/85 leading-none">
                  {backText}
                </span>
              </button>
              <button type="button" onClick={onExit} className={exitPillBase}>
                <span className="truncate">Exit</span>
              </button>
              <button
                type="button"
                onClick={onPublish}
                disabled={primaryDisabled}
                className={publishPillBase}
              >
                <span className="truncate">
                  {publishing ? "Publishing..." : publishText}
                </span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onBack} className={backPillClass}>
                <span className="truncate text-[12px] sm:text-[13px] font-semibold text-[var(--text)]/85 leading-none">
                  {backText}
                </span>
              </button>
              {onSaveDraft && (
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={primaryDisabled}
                  className={publishPillBase}
                >
                  <span className="truncate">Save Draft</span>
                </button>
              )}
              <button
                type="button"
                onClick={onPublish}
                disabled={primaryDisabled}
                className={publishPillBase}
              >
                <span className="truncate">
                  {publishing ? "Publishing..." : publishText}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
