import { PiStar, PiStarFill } from "react-icons/pi";
import { useEffect, useState } from "react";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import toast from "react-hot-toast";
import {
  deletePostRating,
  upsertPostRating,
} from "../../api/services/postRatings";
import useAuthActionGate from "../../hooks/useAuthActionGate";

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  viewerRating?: number | null;
};

function formatRatedByCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1000) return String(Math.floor(value));
  if (value < 1_000_000) {
    const k = value / 1000;
    const digits = k >= 10 ? 0 : 1;
    return `${parseFloat(k.toFixed(digits))}K`;
  }
  const m = value / 1_000_000;
  const digits = m >= 10 ? 0 : 1;
  return `${parseFloat(m.toFixed(digits))}M`;
}

function roundedViewerStars(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function StarRow({
  viewerRating,
  onSelectStar,
  submitting,
}: {
  viewerRating?: number | null;
  onSelectStar?: (stars: number) => void;
  submitting?: boolean;
}) {
  const filled = roundedViewerStars(viewerRating);

  return (
    <div
      className="flex items-center justify-center gap-1"
      role="group"
      aria-label="Your rating"
    >
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const isFilled = filled > 0 && n <= filled;
        return (
          <button
            key={n}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (submitting) return;
              onSelectStar?.(n);
            }}
            className={[
              "rounded-lg p-1 transition-[opacity,transform,background-color,color] active:scale-[0.95]",
              "hover:bg-black/[0.05] app-dark:hover:bg-white/[0.1]",
              submitting ? "cursor-wait" : "",
              isFilled
                ? "opacity-100"
                : filled > 0
                  ? "opacity-[0.38] hover:opacity-85"
                  : "opacity-[0.82] hover:opacity-100 app-dark:opacity-[0.88]",
            ].join(" ")}
            aria-label={
              isFilled && filled === n
                ? `Clear ${n}-star rating`
                : `Rate ${n} star${n > 1 ? "s" : ""}`
            }
            aria-pressed={isFilled && n <= filled}
          >
            {isFilled ? (
              <PiStarFill
                className="h-7 w-7 text-amber-500/95 app-dark:text-amber-300/95"
                aria-hidden
              />
            ) : (
              <PiStar
                className="h-7 w-7 text-amber-500/95 app-dark:text-amber-300/95"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function PostRatingModal({
  open,
  onClose,
  postId,
  ratingAverage,
  ratingCount,
  viewerRating,
}: Props) {
  const { ensureAuthed } = useAuthActionGate();
  const [currentAverage, setCurrentAverage] = useState<number | null>(
    typeof ratingAverage === "number" ? ratingAverage : null
  );
  const [currentCount, setCurrentCount] = useState<number | null>(
    typeof ratingCount === "number" ? ratingCount : null
  );
  const [currentViewerRating, setCurrentViewerRating] = useState<number | null>(
    typeof viewerRating === "number" ? viewerRating : null
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentAverage(typeof ratingAverage === "number" ? ratingAverage : null);
    setCurrentCount(typeof ratingCount === "number" ? ratingCount : null);
    setCurrentViewerRating(typeof viewerRating === "number" ? viewerRating : null);
    setSubmitting(false);
  }, [open, ratingAverage, ratingCount, viewerRating]);

  const count = Math.max(0, Math.floor(Number(currentCount ?? 0)));
  const avgNum =
    count > 0 &&
    typeof currentAverage === "number" &&
    Number.isFinite(currentAverage)
      ? currentAverage
      : 0;
  const avgStr = avgNum.toFixed(1);
  const ratedByLabel = formatRatedByCount(count);

  const handleSelectStar = async (stars: number) => {
    if (submitting) return;
    if (!ensureAuthed()) return;
    const prevRounded = roundedViewerStars(currentViewerRating);
    const clearing = prevRounded > 0 && prevRounded === stars;

    setSubmitting(true);
    const previous = {
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
        setCurrentAverage(previous.avg);
        setCurrentCount(previous.count);
        setCurrentViewerRating(previous.viewer);
        toast.error(
          clearing ? "Failed to remove rating" : "Failed to submit rating"
        );
        return;
      }
      setCurrentAverage(data.ratingAverage ?? previous.avg);
      setCurrentCount(data.ratingCount ?? previous.count);
      setCurrentViewerRating(data.viewerRating ?? (clearing ? null : stars));
      onClose();
    } catch {
      setCurrentAverage(previous.avg);
      setCurrentCount(previous.count);
      setCurrentViewerRating(previous.viewer);
      toast.error(
        clearing ? "Failed to remove rating" : "Failed to submit rating"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={() => onClose()}
      zTier="dialog"
      aria-labelledby="post-rating-modal-title"
      containerClassName="px-5"
    >
      <div
        className={`${frostedModalPanelClassName} mx-auto w-full max-w-[min(340px,86vw)]`}
        style={{ ...frostedModalPanelStyle, maxWidth: "min(340px, 86vw)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mt-1 text-center text-sm tracking-tight text-[var(--text)]/72 app-dark:text-white/70">
          <span className="mr-1.5 font-medium">Rated by</span>
          <span className="font-extrabold text-[var(--text)] app-dark:text-white">
            {ratedByLabel}
          </span>
        </p>
        <p
          id="post-rating-modal-title"
          className="mt-3 mb-2 text-center text-[38px] font-extrabold tabular-nums leading-none tracking-[-0.03em] text-[var(--text)] app-dark:text-white"
        >
          {avgStr}
        </p>

        <StarRow
          viewerRating={currentViewerRating}
          onSelectStar={handleSelectStar}
          submitting={submitting}
        />

        <p className="mt-4 text-center text-[11px] text-[var(--text)]/45 app-dark:text-white/40">
          Tap the same star again to remove your rating · Tap outside to close
        </p>
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--text)]/55 transition hover:text-[var(--text)]/80 app-dark:text-white/50 app-dark:hover:text-white/75"
          >
            Close
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
