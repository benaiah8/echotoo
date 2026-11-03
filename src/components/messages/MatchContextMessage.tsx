/**
 * Centered match-context timeline marker (Open Plan / P2P).
 * Not a sender-owned bubble — no avatar, no mine/theirs.
 * Only the title uses a compact rainbow-edged pill; caption/schedule are plain.
 */

import { format, isValid, parseISO } from "date-fns";
import type { MatchContextSnapshot } from "../../api/services/messaging";

/** Compact title pill: 1px EchoToo spectrum border (Duo comment spectrum). */
const MATCH_TITLE_PILL_FRAME_CLASS = [
  "inline-flex max-w-full rounded-full p-px",
  "bg-[linear-gradient(115deg,#f97316_0%,#eab308_20%,#22c55e_40%,#22d3ee_60%,#3b82f6_80%,#a855f7_100%)]",
].join(" ");

const MATCH_TITLE_PILL_INTERIOR_CLASS = [
  "rounded-full px-2.5 py-1",
  "bg-[color-mix(in_oklab,var(--surface)_94%,var(--bg))]",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_72%,#0a0a0c)]",
].join(" ");

function formatMatchOccursAt(iso: string | null | undefined): string | null {
  const raw = (iso ?? "").trim();
  if (!raw) return null;
  const d = parseISO(raw);
  if (!isValid(d)) return null;
  return format(d, "EEE, MMM d · p");
}

export type MatchContextMessageProps = {
  snapshot: MatchContextSnapshot;
};

export default function MatchContextMessage({
  snapshot,
}: MatchContextMessageProps) {
  const isOpenPlan = snapshot.subtype === "open_plan_match";
  const title = isOpenPlan
    ? "You've connected on this plan"
    : "You matched through P2P";
  const caption = snapshot.caption.trim();
  const occursLabel = isOpenPlan
    ? formatMatchOccursAt(snapshot.occurs_at)
    : null;

  return (
    <div
      className="mx-auto flex max-w-[min(88%,19rem)] flex-col items-center gap-0.5 px-3 py-1 text-center"
      data-match-context-message="true"
      data-match-context-subtype={snapshot.subtype}
    >
      <div
        className={MATCH_TITLE_PILL_FRAME_CLASS}
        data-match-context-title-pill="true"
      >
        <p
          data-match-context-title="true"
          className={[
            MATCH_TITLE_PILL_INTERIOR_CLASS,
            "text-[12px] font-semibold leading-snug tracking-tight",
            "text-[var(--text)]/90",
            "app-dark:text-[var(--text)]/94",
          ].join(" ")}
        >
          {title}
        </p>
      </div>
      {caption ? (
        <p
          data-match-context-caption="true"
          className={[
            "w-full min-w-0 break-words text-xs font-normal leading-snug",
            "[overflow-wrap:anywhere] line-clamp-2",
            "text-[var(--text)]/55",
            "app-dark:text-[var(--text)]/58",
          ].join(" ")}
        >
          {caption}
        </p>
      ) : null}
      {occursLabel ? (
        <p
          data-match-context-schedule="true"
          className={[
            "text-[11px] tabular-nums leading-snug",
            "text-[var(--text)]/48",
            "app-dark:text-[var(--text)]/52",
          ].join(" ")}
        >
          {occursLabel}
        </p>
      ) : null}
    </div>
  );
}
