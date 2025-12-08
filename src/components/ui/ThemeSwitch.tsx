import { useEffect, useState, CSSProperties } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import {
  applyTheme,
  getInitialTheme,
  toggleTheme,
  type Theme,
} from "../../lib/theme";

/**
 * Track height is derived from knob + padY*2, so the knob always sits inside.
 * padX controls the left/right inner padding (travel endpoints).
 */
export default function ThemeSwitch({
  width = 56, // total rail width (px)
  knobW = 22, // knob width (px)
  knobH = 16, // knob height (px)
  padX = 4, // left/right inner padding (px)
  padY = 4, // top/bottom inner padding (px)
  trackDark = "rgba(255,255,255,0.18)", // lighter white color for dark track
  trackLight = "rgba(0,0,0,0.80)",
  knobDark = "#ffffff",
  knobLight = "#0b0b0b",
  border = "rgba(255,255,255,0.20)",
  className = "",
}: {
  width?: number;
  knobW?: number;
  knobH?: number;
  padX?: number;
  padY?: number;
  trackDark?: string;
  trackLight?: string;
  knobDark?: string;
  knobLight?: string;
  border?: string;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const isLight = theme === "light";
  const height = knobH + padY * 2; // track auto-height from knob + vertical padding

  const style = {
    ["--w" as any]: `${width}px`,
    ["--h" as any]: `${height}px`,
    ["--knobW" as any]: `${knobW}px`,
    ["--knobH" as any]: `${knobH}px`,
    ["--padX" as any]: `${padX}px`,
    ["--padY" as any]: `${padY}px`,
    // how far the knob travels horizontally
    ["--tx" as any]: isLight
      ? `calc(var(--w) - (var(--padX) * 2) - var(--knobW))`
      : "0px",
    ["--track-bg" as any]: isLight ? trackLight : trackDark,
    // Light mode => black knob, Dark mode => white knob
    ["--knob-color" as any]: isLight ? knobDark : knobLight,

    ["--border" as any]: border,
  } as CSSProperties;

  const onToggle = () => setTheme(toggleTheme());

  return (
    <button
      type="button"
      aria-label="Toggle light/dark theme"
      onClick={onToggle}
      style={style}
      className={[
        "relative inline-flex items-center rounded-full select-none focus:outline-none",
        className,
      ].join(" ")}
    >
      {/* track */}
      <span
        className="block rounded-full"
        style={{
          width: "var(--w)",
          height: "var(--h)",
          background: "var(--track-bg)",
          border: "1px solid var(--border)",
          boxSizing: "border-box",
        }}
      />

      {/* icons (inside the rail; knob slides over but stays within) */}
      <span
        className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none"
        style={{
          width: "var(--w)",
          height: "var(--h)",
        }}
      >
        <FiMoon size={14} className="text-white" />
        <FiSun
          size={14}
          className="text-yellow-300 drop-shadow-[0_0_2px_rgba(0,0,0,0.25)]"
        />
      </span>

      {/* knob — fixed size, fully inside using padX/padY */}
      <span
        className="absolute rounded-full shadow transition-transform duration-300 ease-out"
        style={{
          width: "var(--knobW)",
          height: "var(--knobH)",
          borderRadius: "calc(var(--knobH) / 2)",
          background: "var(--knob-color)",
          left: "var(--padX)",
          top: "var(--padY)",
          transform: `translateX(var(--tx))`,
        }}
      />
    </button>
  );
}
