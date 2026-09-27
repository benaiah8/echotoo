import { PiCalendarBlank, PiMapPin, PiPath } from "react-icons/pi";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import {
  feedScheduleLabelUsesPill,
  getPostScheduleLabelClasses,
} from "../../lib/postScheduleLabelStyles";

/**
 * Inline post-type metadata (Event vs Post). Compact; not a button.
 * Hangout: calendar + soft green tint. Experience: path/route + soft orange tint.
 */
export function PostTypeMetaChip({
  type,
  className = "",
}: {
  type: "hangout" | "experience";
  className?: string;
}) {
  const Icon = type === "hangout" ? PiCalendarBlank : PiPath;
  const label = postTypeCompactLabel(type);
  const tint =
    type === "hangout"
      ? [
          "border-emerald-600/18 bg-emerald-500/[0.07] text-emerald-900/78",
          "app-dark:border-emerald-400/22 app-dark:bg-emerald-400/[0.08] app-dark:text-emerald-200/72",
        ].join(" ")
      : [
          "border-orange-600/18 bg-orange-500/[0.07] text-orange-900/78",
          "app-dark:border-orange-400/22 app-dark:bg-orange-400/[0.08] app-dark:text-orange-200/72",
        ].join(" ");
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded border px-[3px] py-px",
        tint,
        className,
      ].join(" ")}
      aria-label={label}
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={1.35} aria-hidden />
    </span>
  );
}

/**
 * Compact location square — soft neutral wash (secondary to date chip).
 * Dark: white ~15% fill. Light: soft dark wash. No yellow/brand fill.
 */
const LOCATION_SQUARE_CLASS = [
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
  "border border-black/12 bg-black/[0.06] text-[var(--text)]/80",
  "app-dark:border-white/18 app-dark:bg-white/15 app-dark:text-white/85",
  "hover:bg-black/[0.1] hover:text-[var(--text)]/95",
  "app-dark:hover:bg-white/20 app-dark:hover:text-white/95",
  "active:bg-black/[0.12] app-dark:active:bg-white/25",
  "touch-manipulation",
].join(" ");

/** Standalone header location square. Tap opens Detail → scroll to Location. */
export function PostFeedLocationPin({
  className = "",
  onOpen,
}: {
  className?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={[LOCATION_SQUARE_CLASS, className].join(" ")}
      aria-label="View location"
      title="View location"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <PiMapPin className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/**
 * Shared Post header metadata: separate date chip + soft location square
 * (+ optional plain relative timestamp). Never merges date into the location control.
 */
export function PostFeedHeaderMeta({
  scheduleKind,
  scheduleLabel,
  hasLocation,
  onOpenLocation,
  className = "",
}: {
  scheduleKind: PostScheduleLabelKind;
  scheduleLabel: string;
  hasLocation: boolean;
  onOpenLocation: () => void;
  className?: string;
}) {
  const label = scheduleLabel.trim();
  const showEventDate = Boolean(label) && feedScheduleLabelUsesPill(scheduleKind);
  const relativeOutside =
    Boolean(label) && scheduleKind === "posted_ago" ? label : null;

  if (!showEventDate && !hasLocation && !relativeOutside) return null;

  const dateChipClass = showEventDate
    ? [
        "inline-flex h-5 shrink-0 items-center justify-center text-[10px] leading-none",
        getPostScheduleLabelClasses(scheduleKind, "feed"),
      ].join(" ")
    : "";

  return (
    <div
      className={[
        "inline-flex shrink-0 items-center gap-1",
        className,
      ].join(" ")}
    >
      {showEventDate ? <span className={dateChipClass}>{label}</span> : null}
      {hasLocation ? <PostFeedLocationPin onOpen={onOpenLocation} /> : null}
      {relativeOutside ? (
        <span className="shrink-0 whitespace-nowrap text-[10px] font-normal leading-none text-[var(--text)]/45">
          {relativeOutside}
        </span>
      ) : null}
    </div>
  );
}
