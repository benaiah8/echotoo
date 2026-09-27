/**
 * Read-only linked Event/Place context for social-plan group threads (Group Up G1.3).
 * Compact centered row — not a chat bubble.
 */

import { PiCaretDown, PiCaretUp } from "react-icons/pi";
import type { GroupUpSourceContext } from "../../lib/people/types";
import { getPlanSourceContextScheduleLabel } from "../../lib/planSourceContextLabel";

const CAPTION_MAX_LEN = 120;
const COLLAPSED_CAPTION_MAX_LEN = 48;

function truncateCaption(caption: string, maxLen: number): string {
  const trimmed = caption.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

export type PlanSourceContextBarProps = {
  sourceContext: GroupUpSourceContext;
  scheduleLabel?: string | null;
  onTap: () => void;
  variant?: "thread" | "settings";
  expanded?: boolean;
  onToggleExpand?: () => void;
};

export default function PlanSourceContextBar({
  sourceContext,
  scheduleLabel,
  onTap,
  variant = "thread",
  expanded = true,
  onToggleExpand,
}: PlanSourceContextBarProps) {
  const captionRaw = sourceContext.caption?.trim() || null;
  const schedule =
    scheduleLabel?.trim() ||
    getPlanSourceContextScheduleLabel(sourceContext) ||
    null;

  if (!captionRaw && !schedule) return null;

  const captionExpanded = captionRaw ? truncateCaption(captionRaw, CAPTION_MAX_LEN) : null;
  const captionCollapsed = captionRaw
    ? truncateCaption(captionRaw, COLLAPSED_CAPTION_MAX_LEN)
    : null;

  if (variant === "settings") {
    return (
      <button
        type="button"
        onClick={onTap}
        className="w-full rounded-2xl border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--glass-bg)_72%,var(--bg))] px-3 py-2.5 text-center backdrop-blur-[var(--glass-blur)] transition-opacity hover:opacity-95 active:scale-[0.99]"
        aria-label="View source post"
      >
        {captionExpanded ? (
          <p className="text-[12px] font-semibold leading-snug text-[var(--text)]/85 line-clamp-2">
            {captionExpanded}
          </p>
        ) : null}
        {schedule ? (
          <p className="mt-0.5 text-[11px] tabular-nums leading-snug text-[var(--text)]/50">
            {schedule}
          </p>
        ) : null}
      </button>
    );
  }

  const showExpandControl = Boolean(onToggleExpand);

  if (!expanded) {
    return (
      <div className="flex min-w-0 items-center gap-1 px-2.5 pb-2 pt-3">
        <button
          type="button"
          onClick={onTap}
          className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-[var(--text)]/78 transition-opacity hover:opacity-90"
          aria-label="View source post"
        >
          <span className="text-[var(--text)]/55">Post</span>
          {captionCollapsed ? (
            <>
              <span className="text-[var(--text)]/40"> · </span>
              <span>{captionCollapsed}</span>
            </>
          ) : schedule ? (
            <>
              <span className="text-[var(--text)]/40"> · </span>
              <span className="tabular-nums text-[var(--text)]/60">{schedule}</span>
            </>
          ) : null}
        </button>
        {showExpandControl ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text)]/50 transition-opacity hover:bg-[var(--text)]/6 hover:opacity-90"
            aria-label="Expand source context"
          >
            <PiCaretDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-2.5 pb-2 pt-3">
      <div className="flex min-w-0 items-start gap-1">
        <button
          type="button"
          onClick={onTap}
          className="min-w-0 flex-1 text-left transition-opacity hover:opacity-90"
          aria-label="View source post"
        >
          {captionExpanded ? (
            <p className="text-[11px] font-semibold leading-snug text-[var(--text)]/85 line-clamp-2">
              {captionExpanded}
            </p>
          ) : null}
          {schedule ? (
            <p className="mt-0.5 text-[10px] tabular-nums leading-snug text-[var(--text)]/50">
              {schedule}
            </p>
          ) : null}
        </button>
        {showExpandControl ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text)]/50 transition-opacity hover:bg-[var(--text)]/6 hover:opacity-90"
            aria-label="Collapse source context"
          >
            <PiCaretUp className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
