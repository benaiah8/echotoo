import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getOwlLogoPath } from "../../lib/assets";
import { readUsableAppBounds, type AppBounds } from "./homeTourLayout";

const CELEBRATION_MS = 1800;
const PARTICLE_COUNT = 10;

const PARTICLE_COLORS = [
  "var(--brand)",
  "color-mix(in oklab, var(--brand) 65%, white)",
  "color-mix(in oklab, var(--text) 35%, transparent)",
] as const;

/** Soft static / gently drifting dots across the farewell screen. */
const BG_DOTS: ReadonlyArray<{
  top: string;
  left: string;
  size: number;
  opacity: number;
  brand: boolean;
  blur?: boolean;
}> = [
  { top: "8%", left: "12%", size: 3, opacity: 0.55, brand: true },
  { top: "14%", left: "78%", size: 2, opacity: 0.4, brand: false },
  { top: "22%", left: "28%", size: 4.5, opacity: 0.32, brand: true, blur: true },
  { top: "18%", left: "58%", size: 2.5, opacity: 0.5, brand: true },
  { top: "32%", left: "8%", size: 2, opacity: 0.35, brand: false },
  { top: "36%", left: "88%", size: 3.5, opacity: 0.45, brand: true },
  { top: "48%", left: "18%", size: 2.5, opacity: 0.3, brand: false },
  { top: "52%", left: "72%", size: 3, opacity: 0.4, brand: true, blur: true },
  { top: "62%", left: "42%", size: 2, opacity: 0.28, brand: false },
  { top: "68%", left: "86%", size: 2.5, opacity: 0.42, brand: true },
  { top: "74%", left: "14%", size: 3, opacity: 0.38, brand: true },
  { top: "78%", left: "55%", size: 2, opacity: 0.32, brand: false },
  { top: "84%", left: "34%", size: 4, opacity: 0.28, brand: true, blur: true },
  { top: "88%", left: "70%", size: 2.5, opacity: 0.36, brand: false },
  { top: "12%", left: "42%", size: 2, opacity: 0.3, brand: false },
  { top: "42%", left: "48%", size: 2.5, opacity: 0.24, brand: true },
  { top: "58%", left: "6%", size: 3, opacity: 0.33, brand: true },
  { top: "28%", left: "94%", size: 2, opacity: 0.28, brand: false },
  { top: "6%", left: "52%", size: 2, opacity: 0.26, brand: true },
  { top: "44%", left: "82%", size: 3, opacity: 0.3, brand: false },
];

const CELEBRATION_CSS = `
@keyframes home-tour-cele-screen-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes home-tour-cele-screen-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes home-tour-cele-content-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes home-tour-cele-owl-in {
  from { opacity: 0; transform: rotate(-10deg) translate(-12%, 14%); }
  to { opacity: 1; transform: rotate(-10deg) translate(0, 0); }
}
@keyframes home-tour-cele-burst {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  20% { opacity: 0.75; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1); }
}
@keyframes home-tour-cele-dot-drift {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
[data-home-tour-celebration-root] {
  animation: home-tour-cele-screen-in 220ms ease-out both;
  container-type: inline-size;
  container-name: home-tour-cele;
}
[data-home-tour-celebration-root][data-leaving="1"] {
  animation: home-tour-cele-screen-out 280ms ease-in both;
}
[data-home-tour-celebration-content] {
  animation: home-tour-cele-content-in 280ms ease-out both;
}
[data-home-tour-celebration-owl] {
  animation: home-tour-cele-owl-in 360ms ease-out both;
}
[data-home-tour-particle] {
  animation: home-tour-cele-burst 980ms ease-out forwards;
}
[data-home-tour-bg-dot] {
  animation: home-tour-cele-dot-drift 4.8s ease-in-out infinite;
}
/* EchoToo theme: html.theme-light = light; default (:root) = dark.
   Do NOT use .app-dark — that class is never on the DOM (only a Tailwind variant). */
[data-home-tour-celebration-owl] img {
  /* Dark mode (default): soft off-white body, dark facial details */
  filter: grayscale(1) brightness(1.92) contrast(1.14);
}
html.theme-light [data-home-tour-celebration-owl] img {
  /* Light mode: invert after grayscale so body is charcoal and eyes/details stay light */
  filter: grayscale(1) invert(1) contrast(1.08) brightness(0.9);
}
[data-home-tour-celebration-see],
[data-home-tour-celebration-you],
[data-home-tour-celebration-around] {
  font-size: clamp(1.25rem, 5.8cqw, 1.8rem);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  [data-home-tour-celebration-root],
  [data-home-tour-celebration-root][data-leaving="1"],
  [data-home-tour-celebration-content],
  [data-home-tour-celebration-owl] {
    animation: none;
    opacity: 1;
  }
  [data-home-tour-celebration-content] {
    transform: none;
  }
  [data-home-tour-celebration-owl] {
    transform: rotate(-10deg);
  }
  [data-home-tour-particle] {
    display: none !important;
  }
  [data-home-tour-bg-dot] {
    animation: none;
  }
}
`;

type HomeTourCelebrationProps = {
  onDismiss: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Full-screen frosted farewell after Done.
 * Sized to the app/phone frame (not browser vw).
 * Large corner-peeking owl + vertically centered one-line farewell.
 */
export default function HomeTourCelebration({
  onDismiss,
}: HomeTourCelebrationProps) {
  const [leaving, setLeaving] = useState(false);
  const [bounds, setBounds] = useState<AppBounds>(() => readUsableAppBounds());
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const leaveAt = window.setTimeout(
      () => setLeaving(true),
      CELEBRATION_MS - 280
    );
    const doneAt = window.setTimeout(() => onDismiss(), CELEBRATION_MS);
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [onDismiss]);

  useEffect(() => {
    const syncBounds = () => setBounds(readUsableAppBounds());
    syncBounds();
    window.addEventListener("resize", syncBounds);
    window.visualViewport?.addEventListener("resize", syncBounds);
    window.visualViewport?.addEventListener("scroll", syncBounds);
    return () => {
      window.removeEventListener("resize", syncBounds);
      window.visualViewport?.removeEventListener("resize", syncBounds);
      window.visualViewport?.removeEventListener("scroll", syncBounds);
    };
  }, []);

  if (typeof document === "undefined") return null;

  const particles = reduced
    ? []
    : Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (i % 3) * 0.12;
        const dist = 52 + (i % 4) * 11;
        return {
          id: i,
          dx: `${Math.cos(angle) * dist}px`,
          dy: `${Math.sin(angle) * dist - 10}px`,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          size: i % 3 === 0 ? 4.5 : 3.2,
          delay: (i % 4) * 30,
        };
      });

  const frameStyle: CSSProperties = {
    position: "fixed",
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
  };

  return createPortal(
    <div
      className={[
        "pointer-events-none z-[96]",
        "overflow-hidden",
        "pt-[max(0.5rem,env(safe-area-inset-top))]",
        "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        "bg-[color-mix(in_oklab,var(--glass-bg)_72%,transparent)]",
        "backdrop-blur-[18px] [-webkit-backdrop-filter:blur(18px)]",
      ].join(" ")}
      style={frameStyle}
      data-home-tour-celebration-root
      data-home-tour-celebration-fullscreen="1"
      data-home-tour-celebration-app-frame="1"
      data-leaving={leaving ? "1" : undefined}
      aria-live="polite"
      aria-atomic="true"
    >
      <style>{CELEBRATION_CSS}</style>

      {/* 1–2. Background dots */}
      <div
        className="absolute inset-0 z-0"
        data-home-tour-celebration-dots
        aria-hidden
      >
        {BG_DOTS.map((d, i) => (
          <span
            key={i}
            data-home-tour-bg-dot
            className="absolute rounded-full"
            style={{
              top: d.top,
              left: d.left,
              width: d.size,
              height: d.size,
              opacity: d.opacity,
              background: d.brand
                ? "var(--brand)"
                : "color-mix(in oklab, var(--text) 55%, transparent)",
              filter: d.blur ? "blur(1px)" : undefined,
              animationDelay: `${(i % 5) * 0.35}s`,
            }}
          />
        ))}
      </div>

      {/* 3. Subtle particles near farewell text */}
      {!reduced
        ? particles.map((p) => (
            <span
              key={p.id}
              data-home-tour-particle
              className="absolute left-1/2 top-[48%] z-[1] -translate-x-1/2 rounded-[1px]"
              style={
                {
                  width: p.size,
                  height: p.size * 0.55,
                  background: p.color,
                  ["--dx" as string]: p.dx,
                  ["--dy" as string]: p.dy,
                  animationDelay: `${p.delay}ms`,
                  opacity: 0,
                } as CSSProperties
              }
              aria-hidden
            />
          ))
        : null}

      {/* 4. Large owl peeking from lower-left corner */}
      <div
        data-home-tour-celebration-owl
        data-home-tour-celebration-owl-peek="1"
        data-home-tour-celebration-owl-corner="lower-left"
        className={[
          "absolute z-[2]",
          "bottom-[-10%] left-[-12%]",
          "w-[min(52%,13.5rem)]",
          "origin-bottom-left",
        ].join(" ")}
        style={{ transform: "rotate(-10deg)" }}
        aria-hidden
      >
        <img
          src={getOwlLogoPath()}
          alt=""
          width={240}
          height={240}
          data-home-tour-celebration-owl-mono="1"
          className="h-auto w-full select-none object-contain drop-shadow-[0_14px_32px_rgba(0,0,0,0.32)]"
          draggable={false}
        />
      </div>

      {/* 5. One-line farewell — true center of app frame */}
      <div
        data-home-tour-celebration-content
        data-home-tour-celebration-centered-viewport="1"
        className={[
          "absolute inset-0 z-[3]",
          "flex items-center justify-center",
          "px-3",
        ].join(" ")}
      >
        <p
          className={[
            "w-[92%] max-w-[92%]",
            "whitespace-nowrap text-center tracking-tight text-[var(--text)]",
          ].join(" ")}
          data-home-tour-celebration-copy
          data-home-tour-celebration-hero="1"
          data-home-tour-celebration-centered="1"
          data-home-tour-celebration-line="see-you-around"
        >
          <span data-home-tour-celebration-see>See{" "}</span>
          <span
            className={[
              "inline-block italic",
              "font-[family-name:var(--font-people-display)]",
              "text-[var(--text)]",
              "origin-center",
            ].join(" ")}
            style={{ transform: "rotate(-2deg)" }}
            data-home-tour-celebration-you
          >
            You
          </span>
          <span data-home-tour-celebration-around>{" "}Around.</span>
        </p>
      </div>
    </div>,
    document.body
  );
}
