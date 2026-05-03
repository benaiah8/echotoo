// src/sections/create/CreateTabsSection.tsx
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PiArrowRight } from "react-icons/pi";
import {
  APP_SAFE_BOTTOM_SYNC_EVENT,
  BOTTOM_TAB_PILL_OFFSET_PX,
  resolveSafeAreaBottomLayoutPx,
} from "../../lib/appSafeAreaBottom";

/**
 * Height (px) of the create-step strip (outer frosted bar + inner pills).
 * Roughly ~50% of a typical bottom-tab pill (~54px). Change only this number to tune.
 */
export const CREATE_STEP_STRIP_HEIGHT_PX = 28;

/** Taller strip when forward-only step uses solid white primary CTA (e.g. Activities). */
export const CREATE_STEP_STRIP_HEIGHT_PX_FORWARD_EMPHASIS = 40;

type Props = {
  /** 1..4 where 1=create, 2=activities, 3=categories/caption, 4=preview */
  step: number;
  /** absolute paths for prev/next (length 4 is fine; we read [step-2] and [step]) */
  paths: string[];
  onNext?: () => void;
  onPrev?: () => void;
  /** Whether we're in edit mode (shows only 3 dots instead of 4) */
  isEditMode?: boolean;
  /** Whether to hide the Previous button */
  hidePrev?: boolean;
  /**
   * Activities step: one forward action only (no Prev, no step dots).
   * Other create steps keep the three-part strip unless they opt in.
   */
  forwardOnly?: boolean;
  /** Label for the forward button (default "Next →") */
  nextLabel?: string;
  /** When true, this strip does not hide on scroll (stable primary CTA) */
  stableOnScroll?: boolean;
  /** Quiet note fixed just above the forward strip (e.g. Activities optionality) */
  footerNote?: ReactNode;
  /** Stronger primary CTA styling for forward-only steps (e.g. Activities → caption) */
  emphasizeNext?: boolean;
};

export default function CreateTabsSection({
  step,
  paths,
  onNext,
  onPrev,
  isEditMode = false,
  hidePrev = false,
  forwardOnly = false,
  nextLabel = "Next →",
  stableOnScroll = false,
  footerNote,
  emphasizeNext = false,
}: Props) {
  const navigate = useNavigate();

  /** Space between this strip and the bottom tab pill (px) — increase/decrease here */
  const GAP_ABOVE_TAB = 16;

  const [safeBottom, setSafeBottom] = useState(0);
  useEffect(() => {
    const sync = () => setSafeBottom(resolveSafeAreaBottomLayoutPx());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener(APP_SAFE_BOTTOM_SYNC_EVENT, sync);
    };
  }, []);

  // measure BottomTab so the bar sits just above it (lower z-index than tab)
  const [btHeight, setBtHeight] = useState(0);
  const [btWidth, setBtWidth] = useState(0);
  const [hidden, setHidden] = useState(false); // track scroll state to follow bottom tab

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
    // re-measure on resize & when BottomTab animates
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

  // Follow the bottom tab's scroll behavior (optional: keep strip visible)
  useEffect(() => {
    if (stableOnScroll) {
      setHidden(false);
      return;
    }
    const onScroll = () => {
      const current = window.scrollY;
      const shouldHide = current > 60; // same threshold as BottomTab
      setHidden(shouldHide);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [stableOnScroll]);

  const footerNoteReservePx = footerNote ? 26 : 0;

  const forwardEmphasis = emphasizeNext && forwardOnly;
  const stripHeightPx = forwardEmphasis
    ? CREATE_STEP_STRIP_HEIGHT_PX_FORWARD_EMPHASIS
    : CREATE_STEP_STRIP_HEIGHT_PX;

  // let pages reserve enough space so content never hides behind bars
  useEffect(() => {
    const total =
      BOTTOM_TAB_PILL_OFFSET_PX +
      safeBottom +
      btHeight +
      GAP_ABOVE_TAB +
      stripHeightPx +
      footerNoteReservePx;
    document.documentElement.style.setProperty(
      "--create-actions-total-bottom",
      `${total}px`
    );
  }, [btHeight, safeBottom, footerNoteReservePx, stripHeightPx]);

  const prevPath = useMemo(
    () => paths[Math.max(0, step - 2)] || null,
    [paths, step]
  );
  const nextPath = useMemo(
    () => paths[Math.min(paths.length - 1, step)] || null,
    [paths, step]
  );

  /** Same geometry as ActionSheet: above `#bottom-tab` (offset + safe area + tab height + gap). */
  const bottomOffset =
    BOTTOM_TAB_PILL_OFFSET_PX +
    safeBottom +
    (btHeight > 0 ? btHeight : 0) +
    GAP_ABOVE_TAB;

  const stepCount = isEditMode ? 2 : 4;
  const rowH = stripHeightPx;

  const innerPill =
    "flex h-full min-h-0 shrink-0 items-center justify-center rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]";

  const outerStyle: React.CSSProperties =
    btWidth > 0
      ? {
          width: btWidth,
          maxWidth: "calc(100vw - 24px)",
          height: rowH,
        }
      : { height: rowH };

  const showPrev = !forwardOnly && !hidePrev;
  const showStepDots = !forwardOnly;

  return (
    <>
      <div
        className={[
          "fixed inset-x-0 z-30 flex flex-col items-center gap-1.5 pointer-events-none",
          "transition-transform duration-300",
          hidden ? "translate-y-[110%]" : "translate-y-0",
        ].join(" ")}
        style={{ bottom: bottomOffset }}
      >
        {footerNote ? (
          <div className="pointer-events-none max-w-[min(640px,calc(100vw-24px))] px-3 text-center">
            {footerNote}
          </div>
        ) : null}
        {/* Borderless frosted track (flush); height = CREATE_STEP_STRIP_HEIGHT_PX */}
        <div
          className={[
            "pointer-events-auto flex items-stretch rounded-full",
            forwardOnly ? "justify-center w-full min-w-0" : "justify-between",
            forwardEmphasis
              ? "bg-transparent backdrop-blur-none"
              : "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
            btWidth > 0
              ? "max-w-none"
              : forwardOnly
              ? "w-full max-w-[min(640px,calc(100vw-24px))]"
              : "w-fit max-w-[min(640px,calc(100vw-24px))]",
          ].join(" ")}
          style={outerStyle}
        >
          {showPrev ? (
            <button
              type="button"
              className={`${innerPill} px-3`}
              onClick={() =>
                onPrev ? onPrev() : prevPath ? navigate(prevPath) : null
              }
            >
              <span className="text-[11px] sm:text-[12px] font-medium text-[var(--text)]/85 leading-none">
                ← Prev
              </span>
            </button>
          ) : null}

          {showStepDots ? (
            <div
              className={`${innerPill} min-w-0 px-2.5`}
              role="status"
              aria-label={`Step ${step} of ${stepCount}`}
            >
              <div className="flex items-center justify-center gap-2">
                {(isEditMode ? [1, 2] : [1, 2, 3, 4]).map((n) => (
                  <span
                    key={n}
                    className={[
                      "inline-block h-[4px] rounded-full shrink-0",
                      n === step
                        ? "w-5 bg-[var(--text)]/85"
                        : "w-2.5 bg-[var(--text)]/30",
                    ].join(" ")}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className={
              forwardEmphasis
                ? [
                    "flex h-full min-h-0 shrink-0 items-center justify-center rounded-full",
                    "min-w-0 flex-1 px-4",
                    "border border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]",
                    "shadow-sm hover:brightness-110 active:scale-[0.99]",
                  ].join(" ")
                : [
                    innerPill,
                    forwardOnly ? "min-w-0 flex-1 px-4" : "px-3",
                  ].join(" ")
            }
            onClick={() =>
              onNext ? onNext() : nextPath ? navigate(nextPath) : null
            }
            aria-label={nextLabel}
          >
            {forwardEmphasis ? (
              <span className="flex items-center justify-center gap-2">
                <span className="text-center text-[13px] font-semibold leading-tight tracking-tight text-[var(--brand-ink)] sm:text-[14px]">
                  {nextLabel}
                </span>
                <PiArrowRight
                  className="h-[1.1rem] w-[1.1rem] shrink-0 text-[var(--brand-ink)] sm:h-[1.15rem] sm:w-[1.15rem]"
                  aria-hidden
                />
              </span>
            ) : (
              <span
                className={[
                  "leading-tight text-center",
                  emphasizeNext && forwardOnly
                    ? "text-[10px] font-bold tracking-tight text-[var(--text)] sm:text-[11px]"
                    : "text-[11px] font-medium text-[var(--text)]/85 sm:text-[12px]",
                ].join(" ")}
              >
                {nextLabel}
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
