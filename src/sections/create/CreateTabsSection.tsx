// src/sections/create/CreateTabsSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
};

export default function CreateTabsSection({
  step,
  paths,
  onNext,
  onPrev,
  isEditMode = false,
  hidePrev = false,
}: Props) {
  const navigate = useNavigate();

  // visual tuning
  const SAFE = envSafeArea();
  const BAR_H = 52; // visible control bar height
  const OVERLAP = 0; // no overlap - directly attach to bottom tab

  // measure BottomTab so the bar hugs it perfectly (but with lower z-index)
  const [btHeight, setBtHeight] = useState(0);
  const [hidden, setHidden] = useState(false); // track scroll state to follow bottom tab

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () =>
      setBtHeight(el ? Math.round(el.getBoundingClientRect().height) : 0);
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

  // Follow the bottom tab's scroll behavior
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY;
      const shouldHide = current > 60; // same threshold as BottomTab
      setHidden(shouldHide);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // let pages reserve enough space so content never hides behind bars
  useEffect(() => {
    const total = btHeight + BAR_H + SAFE;
    document.documentElement.style.setProperty(
      "--create-actions-total-bottom",
      `${total}px`
    );
  }, [btHeight, SAFE]);

  const prevPath = useMemo(
    () => paths[Math.max(0, step - 2)] || null,
    [paths, step]
  );
  const nextPath = useMemo(
    () => paths[Math.min(paths.length - 1, step)] || null,
    [paths, step]
  );

  // Gradient from black at bottom to gray at top (theme-aware)
  const gradientBg = `linear-gradient(to top,
      var(--bg) 0%,
      var(--bg) 30%,
      var(--surface) 100%)`;

  return (
    <>
      {/* Navigation bar that follows bottom tab behavior */}
      <div
        className={[
          "fixed left-0 right-0 z-30 transition-transform duration-300",
          hidden ? "translate-y-[110%]" : "translate-y-0",
        ].join(" ")}
        style={{ bottom: Math.max(0, btHeight - OVERLAP) }}
      >
        {/* Full gradient background */}
        <div
          className="w-full rounded-t-2xl"
          style={{
            height: BAR_H + SAFE,
            paddingBottom: SAFE,
            backgroundImage: gradientBg,
            borderTop: `1px solid var(--border)`, // top border
          }}
        >
          {/* the actual control bar */}
          <div
            className={[
              "mx-auto max-w-[640px] px-4",
              "h-[52px] rounded-t-2xl",
              "flex items-center justify-between",
            ].join(" ")}
          >
            {!hidePrev && (
              <button
                className="text-[13px] font-medium text-[var(--text)]/85"
                onClick={() =>
                  onPrev ? onPrev() : prevPath ? navigate(prevPath) : null
                }
              >
                ← Prev
              </button>
            )}
            {hidePrev && <div />}

            <div className="flex items-center gap-2">
              {(isEditMode ? [1, 2] : [1, 2, 3, 4]).map((n) => (
                <span
                  key={n}
                  className={[
                    "inline-block h-[6px] rounded-full",
                    n === step
                      ? "w-6 bg-[var(--text)]/85"
                      : "w-3 bg-[var(--text)]/30",
                  ].join(" ")}
                />
              ))}
            </div>

            <button
              className="text-[13px] font-medium text-[var(--text)]/85"
              onClick={() =>
                onNext ? onNext() : nextPath ? navigate(nextPath) : null
              }
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** reads iOS safe area inset (0 for desktop) */
function envSafeArea() {
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;height:constant(safe-area-inset-bottom);height:env(safe-area-inset-bottom);";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).height || "0");
    document.body.removeChild(probe);
    return isFinite(px) ? px : 0;
  } catch {
    return 0;
  }
}
