import { useEffect, useState } from "react";
import { PiStar, PiStarFill } from "react-icons/pi";
import toast from "react-hot-toast";
import {
  deletePostRating,
  upsertPostRating,
} from "../../api/services/postRatings";
import useAuthActionGate from "../../hooks/useAuthActionGate";

function roundedViewerStars(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(1, Math.min(5, Math.round(v)));
}

type Props = {
  ratingEnabled?: boolean | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  /** When set (1–5), stars up to this value render filled for read-only feedback. */
  viewerRating?: number | null;
  /** Inline submit mode (detail): stars submit immediately. */
  inlineInteractive?: boolean;
  postId?: string;
  onRatingApplied?: (next: {
    ratingAverage: number | null;
    ratingCount: number | null;
    viewerRating: number | null;
  }) => void;
  onOpenModal?: () => void;
  className?: string;
};

/** Five star controls: tappable look, no backend (stub). Main visual anchor for the strip. */
function PostRatingStarsRow({
  viewerRating,
  onSelectStar,
  isSubmitting = false,
  onOpenModal,
}: {
  viewerRating?: number | null;
  onSelectStar?: (stars: number) => void;
  isSubmitting?: boolean;
  onOpenModal?: () => void;
}) {
  const filled =
    typeof viewerRating === "number" &&
    Number.isFinite(viewerRating) &&
    viewerRating >= 1 &&
    viewerRating <= 5
      ? Math.round(viewerRating)
      : 0;
  const showViewerFill = filled > 0;

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 border-l border-[var(--border)]/55 pl-2.5 app-dark:border-white/20"
      role="group"
      aria-label="Your rating"
    >
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const isFilled = showViewerFill && n <= filled;
        return (
          <button
            key={n}
            type="button"
            className={[
              "rounded-md p-0.5 transition-[opacity,transform,background-color,filter,color]",
              "text-amber-600 hover:bg-black/[0.05] active:scale-[0.94]",
              "app-dark:text-amber-300 app-dark:hover:bg-white/[0.1]",
              isSubmitting ? "cursor-wait" : "",
              isFilled
                ? "opacity-100 drop-shadow-[0_0_5px_rgba(245,158,11,0.28)] app-dark:drop-shadow-[0_0_6px_rgba(252,211,77,0.22)]"
                : showViewerFill
                  ? "opacity-[0.42] hover:opacity-90 app-dark:opacity-[0.48] app-dark:hover:opacity-95"
                  : "opacity-[0.82] hover:opacity-100 app-dark:opacity-[0.88] app-dark:hover:opacity-100",
            ].join(" ")}
            aria-label={
              isFilled && filled === n
                ? `Clear ${n}-star rating`
                : `Rate ${n} star${n > 1 ? "s" : ""}`
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isSubmitting) return;
              if (onSelectStar) {
                onSelectStar(n);
                return;
              }
              onOpenModal?.();
            }}
          >
            {isFilled ? (
              <PiStarFill className="h-4 w-4" aria-hidden />
            ) : (
              <PiStar className="h-4 w-4" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact inline rating strip for post detail (feed chip comes later).
 * Hidden when `rating_enabled` is false or missing.
 */
export default function PostRatingSummary({
  ratingEnabled,
  ratingAverage,
  ratingCount,
  viewerRating,
  inlineInteractive = false,
  postId,
  onRatingApplied,
  onOpenModal,
  className = "",
}: Props) {
  const { ensureAuthed } = useAuthActionGate();
  if (!ratingEnabled) return null;

  const [currentCount, setCurrentCount] = useState<number>(
    Math.max(0, Math.floor(Number(ratingCount ?? 0)))
  );
  const [currentAverage, setCurrentAverage] = useState<number>(
    typeof ratingAverage === "number" && Number.isFinite(ratingAverage)
      ? ratingAverage
      : 0
  );
  const [currentViewerRating, setCurrentViewerRating] = useState<number | null>(
    typeof viewerRating === "number" && Number.isFinite(viewerRating)
      ? Math.max(1, Math.min(5, Math.round(viewerRating)))
      : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentCount(Math.max(0, Math.floor(Number(ratingCount ?? 0))));
  }, [ratingCount]);
  useEffect(() => {
    setCurrentAverage(
      typeof ratingAverage === "number" && Number.isFinite(ratingAverage)
        ? ratingAverage
        : 0
    );
  }, [ratingAverage]);
  useEffect(() => {
    setCurrentViewerRating(
      typeof viewerRating === "number" && Number.isFinite(viewerRating)
        ? Math.max(1, Math.min(5, Math.round(viewerRating)))
        : null
    );
  }, [viewerRating]);

  const hasRatings = currentCount > 0;
  const avgNum =
    hasRatings &&
    typeof currentAverage === "number" &&
    Number.isFinite(currentAverage)
      ? currentAverage
      : 0;
  const avgStr = avgNum.toFixed(1);

  const handleSelectStar = async (stars: number) => {
    if (!inlineInteractive || !postId || isSubmitting) return;
    if (!ensureAuthed()) return;
    const prevRounded = roundedViewerStars(currentViewerRating);
    const clearing = prevRounded > 0 && prevRounded === stars;

    setIsSubmitting(true);

    const prev = {
      avg: currentAverage,
      count: currentCount,
      viewer: currentViewerRating,
    };
    if (clearing) {
      setCurrentViewerRating(null);
    } else {
      setCurrentViewerRating(stars);
    }
    try {
      const { data, error } = clearing
        ? await deletePostRating(postId)
        : await upsertPostRating(postId, stars);
      if (error || !data) {
        setCurrentAverage(prev.avg);
        setCurrentCount(prev.count);
        setCurrentViewerRating(prev.viewer);
        toast.error(
          clearing ? "Failed to remove rating" : "Failed to submit rating"
        );
        return;
      }
      setCurrentAverage(data.ratingAverage ?? prev.avg);
      setCurrentCount(
        typeof data.ratingCount === "number" ? data.ratingCount : prev.count
      );
      setCurrentViewerRating(
        data.viewerRating ?? (clearing ? null : stars)
      );
      onRatingApplied?.({
        ratingAverage: data.ratingAverage ?? prev.avg,
        ratingCount:
          typeof data.ratingCount === "number" ? data.ratingCount : prev.count,
        viewerRating: data.viewerRating ?? (clearing ? null : stars),
      });
    } catch {
      setCurrentAverage(prev.avg);
      setCurrentCount(prev.count);
      setCurrentViewerRating(prev.viewer);
      toast.error(
        clearing ? "Failed to remove rating" : "Failed to submit rating"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={[
        "mt-2.5 inline-flex max-w-full items-center gap-2.5 rounded-full",
        "border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_18%,transparent)]",
        "px-3 py-[5px]",
        "shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.55)]",
        "app-dark:border-white/20 app-dark:bg-white/[0.08]",
        "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.35)]",
        className,
      ].join(" ")}
      role="region"
      tabIndex={!inlineInteractive && onOpenModal ? 0 : undefined}
      onClick={!inlineInteractive ? onOpenModal : undefined}
      onKeyDown={
        !inlineInteractive && onOpenModal
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenModal();
              }
            }
          : undefined
      }
      aria-label={
        hasRatings
          ? `Rating ${avgStr} out of 5, ${currentCount} rating${currentCount === 1 ? "" : "s"}`
          : `Rating ${avgStr}, no ratings yet`
      }
    >
      <div className="flex min-w-0 items-baseline gap-0.5 tabular-nums tracking-tight">
        <span className="text-[12px] font-bold leading-none text-[var(--text)] app-dark:text-white/95">
          {avgStr}
        </span>
        <span className="text-[12px] font-semibold leading-none text-[var(--text)]/58 app-dark:text-white/62">
          ({currentCount})
        </span>
      </div>
      <PostRatingStarsRow
        viewerRating={currentViewerRating}
        onSelectStar={inlineInteractive ? handleSelectStar : undefined}
        isSubmitting={isSubmitting}
        onOpenModal={onOpenModal}
      />
    </div>
  );
}
