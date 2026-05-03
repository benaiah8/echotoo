import { PiStarFill } from "react-icons/pi";

type Props = {
  ratingEnabled?: boolean | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  /** When set (1–5), chip reads clearly “rated” without full black/white extremes. */
  viewerRating?: number | null;
  onClick?: () => void;
  className?: string;
};

/**
 * Feed card rating chip (display-only for now).
 * Hidden when ratings are disabled.
 */
export default function PostRatingChip({
  ratingEnabled,
  ratingAverage,
  ratingCount,
  viewerRating,
  onClick,
  className = "",
}: Props) {
  if (!ratingEnabled) return null;

  const count = Math.max(0, Math.floor(Number(ratingCount ?? 0)));
  const hasRatings = count > 0;
  const avgNum =
    hasRatings &&
    typeof ratingAverage === "number" &&
    Number.isFinite(ratingAverage)
      ? ratingAverage
      : 0;
  const avgStr = avgNum.toFixed(1);

  const ratedByMe =
    typeof viewerRating === "number" &&
    Number.isFinite(viewerRating) &&
    viewerRating >= 1 &&
    viewerRating <= 5;

  return (
    <button
      type="button"
      data-viewer-rated={ratedByMe ? "true" : undefined}
      onClick={(e) => {
        // Display-only v1: keep tappable affordance without side effects.
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={[
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-[12px] font-semibold leading-none tabular-nums tracking-tight",
        "transition-[background-color,border-color,box-shadow,color,transform] active:scale-[0.98]",
        ratedByMe
          ? [
              // Light: deep charcoal + solid black rim
              "border-black bg-neutral-800 text-white shadow-[0_1px_2px_rgba(0,0,0,0.22)]",
              "hover:border-black hover:bg-neutral-700",
              // Dark: elevated zinc + solid white rim
              "app-dark:border-white app-dark:bg-zinc-700 app-dark:text-white",
              "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_3px_rgba(0,0,0,0.35)]",
              "app-dark:hover:border-white app-dark:hover:bg-zinc-600",
            ].join(" ")
          : [
              "border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]",
              "text-[var(--text)]/90",
              "hover:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)]",
              "app-dark:border-white/18 app-dark:bg-white/[0.06] app-dark:text-white/90 app-dark:hover:bg-white/[0.1]",
            ].join(" "),
        className,
      ].join(" ")}
      aria-label={
        ratedByMe
          ? `Your rating included: ${avgStr} (${count})`
          : `Rating ${avgStr} (${count})`
      }
    >
      <PiStarFill
        className={[
          "h-3.5 w-3.5 shrink-0",
          ratedByMe
            ? "text-amber-300 app-dark:text-amber-200"
            : "text-amber-500/95 app-dark:text-amber-300/92",
        ].join(" ")}
        aria-hidden
      />
      <span>{avgStr}</span>
      <span
        className={
          ratedByMe
            ? "text-white/72 app-dark:text-white/65"
            : "text-[var(--text)]/58 app-dark:text-white/60"
        }
      >
        ({count})
      </span>
    </button>
  );
}
