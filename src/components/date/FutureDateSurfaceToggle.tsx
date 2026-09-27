/**
 * Dumb Calendar ↔ Wheel surface toggle (shared by Duo panel + Create schedule sheet).
 * No date logic, bounds, or segment ownership.
 */
import { PiCalendarBlank, PiCirclesThree } from "react-icons/pi";

export type FutureDatePickerSurface = "calendar" | "wheel";

const CIRCLE = "h-8 w-8 shrink-0";

const circleToolClass = (active: boolean) =>
  [
    "inline-flex items-center justify-center rounded-full border",
    CIRCLE,
    "transition-colors",
    active
      ? [
          "border-[color-mix(in_oklab,var(--text)_28%,transparent)]",
          "bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]",
          "text-[var(--text)]/88",
        ].join(" ")
      : [
          "border-[color-mix(in_oklab,var(--border)_50%,transparent)]",
          "bg-transparent",
          "text-[var(--text)]/55",
          "hover:bg-[color-mix(in_oklab,var(--surface)_16%,transparent)]",
        ].join(" "),
  ].join(" ");

export type FutureDateSurfaceToggleProps = {
  value: FutureDatePickerSurface;
  onChange: (next: FutureDatePickerSurface) => void;
  className?: string;
};

export default function FutureDateSurfaceToggle({
  value,
  onChange,
  className = "",
}: FutureDateSurfaceToggleProps) {
  return (
    <div
      className={["flex shrink-0 items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label="Date picker surface"
    >
      <button
        type="button"
        className={circleToolClass(value === "calendar")}
        aria-label="Calendar picker"
        aria-pressed={value === "calendar"}
        onClick={() => onChange("calendar")}
      >
        <PiCalendarBlank className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className={circleToolClass(value === "wheel")}
        aria-label="Wheel picker"
        aria-pressed={value === "wheel"}
        onClick={() => onChange("wheel")}
      >
        <PiCirclesThree className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
