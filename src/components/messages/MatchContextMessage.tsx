/**
 * Centered neutral match-context timeline marker (Open Plan / P2P).
 * Not a sender-owned bubble — no avatar, no mine/theirs.
 */

import { format, isValid, parseISO } from "date-fns";
import type { MatchContextSnapshot } from "../../api/services/messaging";

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
    ? "You matched on this Open Plan"
    : "You matched through P2P";
  const caption = snapshot.caption.trim();
  const occursLabel = isOpenPlan
    ? formatMatchOccursAt(snapshot.occurs_at)
    : null;

  return (
    <div className="mx-auto flex max-w-[min(85%,18rem)] flex-col items-center gap-0.5 px-3 py-1 text-center">
      <p className="text-[12px] font-medium leading-snug text-[var(--text)]/55">
        {title}
      </p>
      {caption ? (
        <p className="text-[13px] font-semibold leading-snug text-[var(--text)]/80">
          {caption}
        </p>
      ) : null}
      {occursLabel ? (
        <p className="text-[11px] tabular-nums leading-snug text-[var(--text)]/45">
          {occursLabel}
        </p>
      ) : null}
    </div>
  );
}
