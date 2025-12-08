// src/components/ui/ActionSheet.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";

type Props = {
  onBack: () => void;
  onPublish: () => void;
  onSaveDraft?: () => void; // NEW: save draft callback
  publishing?: boolean;
  backText?: string;
  publishText?: string;
  onExit?: () => void; // NEW: exit/cancel callback
  isEditMode?: boolean; // NEW: whether we're in edit mode
};

export default function ActionSheet({
  onBack,
  onPublish,
  onSaveDraft,
  publishing = false,
  backText = "Back",
  publishText = "Publish",
  onExit,
  isEditMode = false,
}: Props) {
  const navigate = useNavigate();

  // Measure BottomTab so the bar hugs it perfectly
  const [btHeight, setBtHeight] = useState(0);
  const [hidden, setHidden] = useState(false); // track scroll state

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
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          const shouldHide = current > 60; // same threshold as BottomTab
          setHidden(shouldHide);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const SAFE =
    typeof window !== "undefined"
      ? parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-area-inset-bottom"
          ) || "0"
        )
      : 0;

  return (
    <div
      className={[
        "fixed left-0 right-0 z-30 transition-transform duration-300",
        hidden ? "translate-y-[110%]" : "translate-y-0",
      ].join(" ")}
      style={{ bottom: btHeight > 0 ? btHeight : 10 }}
    >
      {/* Full gradient background */}
      <div
        className="w-full rounded-t-2xl"
        style={{
          height: 52 + SAFE,
          paddingTop: 0,
          paddingBottom: SAFE,
          backgroundImage: `linear-gradient(to top, var(--bg) 0%, var(--bg) 30%, var(--surface) 100%)`,
          borderTop: `1px solid var(--border)`,
        }}
      >
        {/* the actual control bar */}
        <div
          className={[
            "mx-auto max-w-[640px] px-4",
            "h-[52px] rounded-t-2xl",
            isEditMode && onExit
              ? "flex items-center gap-2 justify-between"
              : "flex items-center gap-2",
          ].join(" ")}
        >
          {isEditMode && onExit ? (
            <>
              <button
                onClick={onBack}
                className="flex-1 border border-[var(--border)] text-[var(--text)] py-1.5 rounded-full text-[13px] font-medium hover:bg-white/5 active:scale-[0.99] transition"
              >
                {backText}
              </button>
              <button
                onClick={onExit}
                className="flex-1 border border-red-500 text-red-500 py-1.5 rounded-full text-[13px] font-medium hover:bg-red-500/10 active:scale-[0.99] transition"
              >
                Exit
              </button>
              <button
                onClick={onPublish}
                disabled={publishing}
                className="flex-1 bg-[var(--brand)] text-[var(--brand-ink)] py-1.5 rounded-full font-medium text-[13px] disabled:opacity-60 hover:brightness-110 active:scale-[0.99] transition border border-[var(--brand)]"
              >
                {publishing ? "Publishing..." : publishText}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onBack}
                className="flex-1 border border-[var(--border)] text-[var(--text)] py-1.5 rounded-full text-[13px] font-medium hover:bg-white/5 active:scale-[0.99] transition"
              >
                {backText}
              </button>
              {onSaveDraft && (
                <button
                  onClick={onSaveDraft}
                  disabled={publishing}
                  className="flex-1 bg-[var(--brand)] text-[var(--brand-ink)] py-1.5 rounded-full text-[13px] font-medium hover:brightness-110 active:scale-[0.99] transition border border-[var(--brand)]"
                >
                  Save Draft
                </button>
              )}
              <button
                onClick={onPublish}
                disabled={publishing}
                className="flex-1 bg-[var(--brand)] text-[var(--brand-ink)] py-1.5 rounded-full font-medium text-[13px] disabled:opacity-60 hover:brightness-110 active:scale-[0.99] transition border border-[var(--brand)]"
              >
                {publishing ? "Publishing..." : publishText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
