/**
 * Create Finalize canvas — committed hashtags below Date/Location meta.
 * Display-only chips; tap opens the existing Tags sheet (no per-chip remove).
 */
import { formatHashtagForDisplay } from "../../lib/createFlowLimits";

/** Matches published PostDetailBody hashtag chips (compact, muted). */
const chipClass =
  "min-w-0 max-w-full break-words rounded-full border border-[var(--border)]/55 bg-[var(--surface)]/16 px-2 py-0.5 text-[10px] font-medium leading-tight text-[var(--text)]/62 app-dark:border-white/20 app-dark:bg-white/[0.06] app-dark:text-white/58";

type Props = {
  tags: string[];
  onClick: () => void;
};

export default function CreateFinalizeCanvasTagsRow({ tags, onClick }: Props) {
  if (tags.length === 0) return null;

  return (
    <button
      type="button"
      data-create-finalize-canvas-tags
      aria-label="Edit hashtags"
      onClick={onClick}
      className="flex w-full min-w-0 flex-wrap gap-1.5 rounded-[14px] text-left transition hover:opacity-95 active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
    >
      {tags.map((t) => {
        const label = formatHashtagForDisplay(t);
        if (!label) return null;
        return (
          <span key={t} className={chipClass}>
            {label}
          </span>
        );
      })}
    </button>
  );
}
