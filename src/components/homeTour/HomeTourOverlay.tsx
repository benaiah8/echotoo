import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { HomeTourStep } from "./homeTourSteps";
import {
  clampHoleRect,
  computeTooltipStyle,
  type SpotlightRect,
} from "./homeTourLayout";

export type { SpotlightRect };

const HOLE_PAD_PX = 8;
/** Outside-tap attention pulse (glow + Next nudge). */
const ATTENTION_MS = 720;

/** Match EchoToo frosted glass sheets (glass-bg + blur + soft border). */
const TOUR_TOOLTIP_GLASS_CLASS = [
  "pointer-events-auto rounded-2xl",
  "border border-[var(--bottom-tab-border)]",
  "bg-[color-mix(in_oklab,var(--glass-bg)_88%,transparent)]",
  "backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "text-[var(--text)]",
  "shadow-[0_8px_28px_rgba(0,0,0,0.28),0_0_18px_color-mix(in_oklab,var(--brand)_10%,transparent)]",
  "app-dark:shadow-[0_10px_32px_rgba(0,0,0,0.5)]",
  "transition-opacity duration-300",
].join(" ");

/** Scoped to Home Tour overlay only — soft brand wave + Next nudge + filter cues. */
const HOME_TOUR_OVERLAY_CSS = `
@keyframes home-tour-tooltip-glow {
  0% {
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.28),
      0 0 0 0 color-mix(in oklab, var(--brand) 0%, transparent);
  }
  35% {
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.28),
      0 0 0 3px color-mix(in oklab, var(--brand) 55%, transparent),
      0 0 22px 4px color-mix(in oklab, var(--brand) 38%, transparent);
  }
  70% {
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.28),
      0 0 0 8px color-mix(in oklab, var(--brand) 18%, transparent),
      0 0 28px 8px color-mix(in oklab, var(--brand) 16%, transparent);
  }
  100% {
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.28),
      0 0 0 0 color-mix(in oklab, var(--brand) 0%, transparent);
  }
}
@keyframes home-tour-next-nudge {
  0%, 100% { transform: translateX(0) scale(1); }
  20% { transform: translateX(-3px) scale(1.04); }
  40% { transform: translateX(3px) scale(1.05); }
  60% { transform: translateX(-2px) scale(1.03); }
  80% { transform: translateX(2px) scale(1.02); }
}
@keyframes home-tour-filter-cue-pulse {
  0% {
    opacity: 0.95;
    transform: scale(0.92);
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--brand) 55%, transparent);
  }
  55% {
    opacity: 0.55;
    transform: scale(1.18);
    box-shadow: 0 0 0 8px color-mix(in oklab, var(--brand) 0%, transparent);
  }
  100% {
    opacity: 0.95;
    transform: scale(0.92);
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--brand) 0%, transparent);
  }
}
[data-home-tour-attention="1"][data-home-tour-tooltip] {
  animation: home-tour-tooltip-glow ${ATTENTION_MS}ms ease-out 1;
}
[data-home-tour-attention="1"] [data-home-tour-next] {
  animation: home-tour-next-nudge ${ATTENTION_MS}ms ease-out 1;
}
[data-home-tour-filter-cue] {
  animation: home-tour-filter-cue-pulse 1.6s ease-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  [data-home-tour-attention="1"][data-home-tour-tooltip],
  [data-home-tour-attention="1"] [data-home-tour-next] {
    animation: none;
  }
  [data-home-tour-filter-cue] {
    animation: none;
    opacity: 0.9;
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand) 70%, transparent);
  }
}
`;

type HomeTourOverlayProps = {
  step: HomeTourStep;
  stepIndex: number;
  stepCount: number;
  /** Highest step index the user has reached (inclusive). */
  maxReachedIndex: number;
  targetRect: SpotlightRect | null;
  onNext: () => void;
  onSkip: () => void;
  onGoToStep: (index: number) => void;
};

type CueRect = { top: number; left: number; width: number; height: number };

function HomeTourFilterCues({ active }: { active: boolean }) {
  const [cues, setCues] = useState<CueRect[]>([]);

  useEffect(() => {
    if (!active) {
      setCues([]);
      return;
    }

    const measure = () => {
      const selectors = [
        '[data-tour-target="home-filter-trigger"]',
        '[data-tour-target="home-filter-shortcuts"]',
      ];
      const next: CueRect[] = [];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        next.push({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      }
      setCues(next);
    };

    measure();
    const id = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  if (!active || !cues.length) return null;

  return (
    <>
      {cues.map((c, i) => (
        <div
          key={i}
          data-home-tour-filter-cue
          className="pointer-events-none absolute z-[2] rounded-full border-2 border-[var(--brand)]"
          style={{
            top: c.top - 4,
            left: c.left - 4,
            width: c.width + 8,
            height: c.height + 8,
          }}
          aria-hidden
        />
      ))}
    </>
  );
}

function HomeTourProgress({
  stepIndex,
  stepCount,
  maxReachedIndex,
  onGoToStep,
}: {
  stepIndex: number;
  stepCount: number;
  maxReachedIndex: number;
  onGoToStep: (index: number) => void;
}) {
  return (
    <div
      className="mt-2.5 flex w-full justify-center"
      data-home-tour-progress-outside="1"
    >
      <div
        className={[
          "pointer-events-auto inline-flex items-center gap-1 px-3 py-2.5",
        ].join(" ")}
        style={{
          // Soft elliptical glow behind bars only — fades all sides to transparent.
          background:
            "radial-gradient(ellipse 78% 88% at 50% 50%, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.32) 36%, rgba(0,0,0,0.12) 58%, transparent 76%)",
        }}
        data-home-tour-progress
        data-home-tour-progress-strip="1"
        data-home-tour-progress-capsule="1"
        data-home-tour-progress-fade="1"
        data-home-tour-progress-radial="1"
        role="group"
        aria-label={`Tutorial progress, step ${stepIndex + 1} of ${stepCount}`}
        onClick={(e) => e.stopPropagation()}
      >
        {Array.from({ length: stepCount }, (_, i) => {
          const reached = i <= maxReachedIndex;
          const filled = i <= stepIndex;
          const isCurrent = i === stepIndex;

          if (!reached) {
            return (
              <div
                key={i}
                className="flex h-8 w-[26px] items-center justify-center"
                data-home-tour-progress-segment="future"
                aria-hidden
              >
                <span className="block h-1.5 w-[22px] rounded-full bg-[color-mix(in_oklab,var(--text)_22%,transparent)] opacity-55" />
              </div>
            );
          }

          return (
            <button
              key={i}
              type="button"
              aria-label={`Go to tutorial step ${i + 1}`}
              aria-current={isCurrent ? "step" : undefined}
              data-home-tour-progress-segment={
                isCurrent ? "current" : "reached"
              }
              onClick={() => onGoToStep(i)}
              className={[
                "flex h-8 w-[26px] items-center justify-center rounded-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-readable)]/70",
                "hover:opacity-95",
              ].join(" ")}
            >
              <span
                className={[
                  "block h-1.5 w-[22px] rounded-full transition-[background-color,opacity] duration-200",
                  filled
                    ? "bg-[var(--brand-readable)] opacity-100"
                    : "bg-[color-mix(in_oklab,var(--text)_22%,transparent)] opacity-55",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HomeTourOverlay({
  step,
  stepIndex,
  stepCount,
  maxReachedIndex,
  targetRect,
  onNext,
  onSkip,
  onGoToStep,
}: HomeTourOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  /** Increments on each outside tap so the attention animation can re-fire. */
  const [attentionToken, setAttentionToken] = useState(0);
  /** Re-measure Welcome center on viewport / frame resize. */
  const [centerTick, setCenterTick] = useState(0);
  const attentionClearRef = useRef<number | null>(null);

  const playOutsideAttention = useCallback(() => {
    if (attentionClearRef.current != null) {
      window.clearTimeout(attentionClearRef.current);
      attentionClearRef.current = null;
    }
    setAttentionToken((n) => n + 1);
    attentionClearRef.current = window.setTimeout(() => {
      setAttentionToken(0);
      attentionClearRef.current = null;
    }, ATTENTION_MS);
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (attentionClearRef.current != null) {
        window.clearTimeout(attentionClearRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (targetRect) return;
    const bump = () => setCenterTick((n) => n + 1);
    window.addEventListener("resize", bump);
    return () => window.removeEventListener("resize", bump);
  }, [targetRect]);

  useLayoutEffect(() => {
    if (!mounted) return;
    setVisible(false);
    setAttentionToken(0);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [mounted, step.id]);

  if (!mounted || typeof document === "undefined") return null;

  const hole = targetRect
    ? clampHoleRect({
        top: Math.max(0, targetRect.top - HOLE_PAD_PX),
        left: Math.max(0, targetRect.left - HOLE_PAD_PX),
        width: targetRect.width + HOLE_PAD_PX * 2,
        height: targetRect.height + HOLE_PAD_PX * 2,
      })
    : null;

  const isLast = stepIndex >= stepCount - 1;
  void centerTick;
  const stackStyle = computeTooltipStyle(targetRect);
  const attentionActive = attentionToken > 0;
  const titleClass =
    step.titleEmphasis === "prominent"
      ? "text-[15px] font-semibold tracking-tight text-[var(--text)]"
      : "text-sm font-semibold tracking-tight text-[var(--text)]";
  const showFilterCues = step.id === "date-time";

  const onOutsidePointer = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    playOutsideAttention();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[95]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-tour-title"
      aria-describedby="home-tour-body"
      data-home-tour-overlay
    >
      <style>{HOME_TOUR_OVERLAY_CSS}</style>

      <div
        className="absolute inset-0"
        onClick={onOutsidePointer}
        aria-hidden
      />

      {hole ? (
        <div
          className={[
            "pointer-events-auto absolute rounded-2xl transition-[top,left,width,height,opacity] duration-300 ease-out",
            visible ? "opacity-100" : "opacity-0",
          ].join(" ")}
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)",
            outline: "2px solid color-mix(in oklab, var(--brand) 85%, white)",
            outlineOffset: 2,
            background: "transparent",
          }}
          onClick={onOutsidePointer}
          aria-hidden
        />
      ) : (
        <div
          className={[
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            visible ? "opacity-100" : "opacity-0",
          ].join(" ")}
          style={{
            background: "rgba(0, 0, 0, 0.62)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
          aria-hidden
        />
      )}

      <HomeTourFilterCues active={showFilterCues} />

      <div
        className={[
          "z-[1] flex flex-col items-stretch",
          visible ? "opacity-100" : "opacity-0",
          "transition-opacity duration-300",
        ].join(" ")}
        style={stackStyle}
        data-home-tour-stack
      >
        <div
          key={attentionToken > 0 ? `attn-${attentionToken}` : "attn-idle"}
          className={TOUR_TOOLTIP_GLASS_CLASS}
          onClick={(e) => e.stopPropagation()}
          data-home-tour-tooltip
          data-home-tour-attention={attentionActive ? "1" : undefined}
          data-home-tour-welcome={!targetRect ? "1" : undefined}
        >
          <div className="px-4 pt-3.5">
            <div className="flex items-start justify-between gap-3">
              {step.title ? (
                <h2
                  id="home-tour-title"
                  className={`${titleClass} min-w-0 flex-1 pr-1`}
                >
                  {step.title}
                </h2>
              ) : (
                <span id="home-tour-title" className="sr-only">
                  Home tour
                </span>
              )}
              <span
                className="shrink-0 pt-0.5 text-[10px] font-medium tabular-nums text-[var(--text)]/50"
                data-home-tour-step-count
                aria-hidden
              >
                {stepIndex + 1}/{stepCount}
              </span>
            </div>
            <div
              className="mt-2 h-px w-8 rounded-full bg-[color-mix(in_oklab,var(--brand)_75%,transparent)]"
              data-home-tour-accent
              aria-hidden
            />
            <div
              id="home-tour-body"
              className="mt-3 text-[13px] leading-relaxed text-[var(--text)]/80"
            >
              {step.body}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-4">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text)]/65 hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] hover:text-[var(--text)]"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={onNext}
              data-home-tour-next
              className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-[var(--brand-ink)] shadow-sm active:scale-[0.97]"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
        <HomeTourProgress
          stepIndex={stepIndex}
          stepCount={stepCount}
          maxReachedIndex={maxReachedIndex}
          onGoToStep={onGoToStep}
        />
      </div>
    </div>,
    document.body
  );
}
