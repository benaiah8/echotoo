import { PiCalendarBlank, PiMapPin, PiPath } from "react-icons/pi";

/**
 * Inline post-type metadata (Hangout vs Experience). Compact; not a button.
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
  const label = type === "hangout" ? "Hangout post" : "Experience post";
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
 * Feed-only hint row: “View details” first, then static location + date icons.
 */
export function PostFeedDetailsHintRow({
  onOpenDetails,
  className = "",
}: {
  onOpenDetails: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenDetails();
      }}
      className={[
        "group flex w-full min-w-0 items-center gap-1.5 rounded-md text-left leading-none",
        "text-[var(--text)]/50 transition-colors hover:text-[var(--text)]/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/35",
        className,
      ].join(" ")}
      aria-label="View full post details"
    >
      <span
        className={[
          "inline-flex shrink-0 items-center rounded-full border border-[var(--border)]/50",
          "bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] px-1.5 py-[3px] text-[10px] font-medium leading-none",
          "text-[var(--text)]/78 group-hover:border-[var(--border)]/65 group-hover:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)]",
          "app-dark:border-white/14 app-dark:bg-white/[0.05] app-dark:text-white/75",
        ].join(" ")}
      >
        View details
      </span>
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[var(--text)]/38 group-hover:text-[var(--text)]/48"
        aria-hidden
      >
        <PiMapPin className="h-3 w-3" strokeWidth={1.35} />
        <PiCalendarBlank className="h-3 w-3" strokeWidth={1.35} />
      </span>
    </button>
  );
}
