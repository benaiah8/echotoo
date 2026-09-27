import { PiStar, PiStarFill } from "react-icons/pi";
import { useEffect, useMemo, useState } from "react";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import toast from "react-hot-toast";
import {
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
  selectedRating,
  onSelectStar,
  disabled,
}: {
  selectedRating: number;
  onSelectStar?: (stars: number) => void;
  disabled?: boolean;
}) {
  const filled = selectedRating;

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
              if (disabled) return;
              onSelectStar?.(n);
            }}
            className={[
              "rounded-lg p-1 transition-[opacity,transform,background-color,color] active:scale-[0.95]",
              "hover:bg-black/[0.05] app-dark:hover:bg-white/[0.1]",
              disabled ? "cursor-not-allowed opacity-60" : "",
              isFilled
                ? "opacity-100"
                : filled > 0
                  ? "opacity-[0.38] hover:opacity-85"
                  : "opacity-[0.82] hover:opacity-100 app-dark:opacity-[0.88]",
            ].join(" ")}
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={isFilled}
            disabled={disabled}
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
  /** Pending selection only — not persisted until Rate is pressed. */
  const [selectedRating, setSelectedRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const savedRounded = roundedViewerStars(currentViewerRating);

  useEffect(() => {
    if (!open) return;
    setCurrentAverage(typeof ratingAverage === "number" ? ratingAverage : null);
    setCurrentCount(typeof ratingCount === "number" ? ratingCount : null);
    setCurrentViewerRating(typeof viewerRating === "number" ? viewerRating : null);
    setSelectedRating(roundedViewerStars(viewerRating));
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

  const submitLabel = useMemo(() => {
    if (savedRounded > 0) return "Update rating";
    return "Rate";
  }, [savedRounded]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (selectedRating < 1) return false;
    if (savedRounded > 0 && selectedRating === savedRounded) return false;
    return true;
  }, [savedRounded, selectedRating, submitting]);

  const handleSelectStar = (stars: number) => {
    if (submitting) return;
    setSelectedRating(stars);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    if (!ensureAuthed()) return;

    setSubmitting(true);
    const previous = {
      avg: currentAverage,
      count: currentCount,
      viewer: currentViewerRating,
    };

    try {
      const { data, error } = await upsertPostRating(postId, selectedRating);
      if (error || !data) {
        toast.error("Failed to submit rating");
        return;
      }
      setCurrentAverage(data.ratingAverage ?? previous.avg);
      setCurrentCount(data.ratingCount ?? previous.count);
      setCurrentViewerRating(data.viewerRating ?? selectedRating);
      onClose();
    } catch {
      toast.error("Failed to submit rating");
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
          selectedRating={selectedRating}
          onSelectStar={handleSelectStar}
          disabled={submitting}
        />

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className={[
              "min-w-[7.5rem] rounded-full px-5 py-2 text-sm font-semibold transition-opacity",
              "bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90",
              "disabled:cursor-not-allowed disabled:opacity-40",
            ].join(" ")}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-[var(--text)]/45 app-dark:text-white/40">
          Tap outside to close
        </p>
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--text)]/55 transition hover:text-[var(--text)]/80 disabled:opacity-50 app-dark:text-white/50 app-dark:hover:text-white/75"
          >
            Close
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
