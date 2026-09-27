/**
 * Presentation-only selected-people summary — one morphing pill
 * (collapsed stack ↔ expanded chips). Domain-agnostic.
 */

import type { ReactNode } from "react";
import { PiCaretDown, PiCheck, PiX } from "react-icons/pi";
import Avatar from "../ui/Avatar";

export type SelectedPersonSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

type Props = {
  people: SelectedPersonSummary[];
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
  /** Max overlapping faces in the collapsed control. @default 3 */
  maxVisibleAvatars?: number;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Optional trailing control beside the pill. */
  action?: ReactNode;
};

/** Uniform inset on all four sides of the pill. */
const PILL_INSET = "p-1.5";
const AVATAR_PX = 24;
const CHIP_AVATAR_PX = 20;
const CHECK_PX = 28;

function identityLabel(p: SelectedPersonSummary): string {
  return p.displayName.trim() || "Member";
}

export default function SelectedPeopleSummary({
  people,
  expanded,
  onToggle,
  onRemove,
  maxVisibleAvatars = 3,
  emptyLabel = "None selected",
  className = "",
  disabled = false,
  action,
}: Props) {
  const count = people.length;
  const canInteract = count > 0 && !disabled;
  const visible = people.slice(0, maxVisibleAvatars);
  const overflow = Math.max(0, count - maxVisibleAvatars);

  if (count === 0) {
    return (
      <div className={`flex w-full justify-center ${className}`.trim()}>
        <div
          className={`flex items-center rounded-full border border-[var(--border)]/40 bg-[color-mix(in_oklab,var(--surface-2)_22%,transparent)] ${PILL_INSET}`}
        >
          <span className="px-1 text-[11px] font-medium text-[var(--text)]/45">
            {emptyLabel}
          </span>
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className={`flex w-full items-center gap-2 ${className}`.trim()}>
      <div
        className={[
          "relative flex min-h-[2.25rem] items-center overflow-hidden rounded-full border border-[var(--border)]/55",
          "bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)]",
          PILL_INSET,
          "transition-[max-width,width] duration-200 ease-out motion-reduce:transition-none",
          expanded
            ? "w-full max-w-full flex-1"
            : "mx-auto w-fit max-w-full",
        ].join(" ")}
      >
        <button
          type="button"
          disabled={!canInteract || expanded}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`Show ${count} selected ${count === 1 ? "person" : "people"}`}
          className={[
            "flex items-center gap-1.5 outline-none",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            expanded
              ? "pointer-events-none absolute inset-1.5 opacity-0"
              : "relative opacity-100",
          ].join(" ")}
        >
          <div className="flex shrink-0 items-center -space-x-2">
            {visible.map((p) => (
              <div
                key={p.id}
                className="rounded-full bg-[var(--bg)] ring-2 ring-[color-mix(in_oklab,var(--surface-2)_55%,var(--bg))]"
              >
                <Avatar
                  url={p.avatarUrl}
                  name={identityLabel(p)}
                  userId={p.id}
                  size={AVATAR_PX}
                  tightLineBox
                  className="rounded-full"
                />
              </div>
            ))}
            {overflow > 0 ? (
              <div
                className="z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1 text-[10px] font-semibold tabular-nums text-[var(--text)]/80 ring-2 ring-[color-mix(in_oklab,var(--surface-2)_55%,var(--bg))]"
                aria-label={`${overflow} more selected`}
              >
                +{overflow}
              </div>
            ) : null}
          </div>
          <span
            className="text-[12px] font-medium tabular-nums text-[var(--text)]/75"
            aria-live="polite"
          >
            {count}
          </span>
          <PiCaretDown
            className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/40"
            aria-hidden
          />
        </button>

        <div
          className={[
            "flex min-w-0 flex-1 items-center gap-1",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
            expanded
              ? "relative opacity-100"
              : "pointer-events-none absolute inset-1.5 opacity-0",
          ].join(" ")}
          aria-hidden={!expanded}
        >
          <div
            role="region"
            aria-label="Selected people"
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex w-max items-center gap-1">
              {people.map((p) => {
                const label = identityLabel(p);
                return (
                  <li key={p.id}>
                    <div className="flex max-w-[8rem] items-center gap-0.5 rounded-full border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface)_55%,transparent)] py-0.5 pl-0.5 pr-0.5">
                      <Avatar
                        url={p.avatarUrl}
                        name={label}
                        userId={p.id}
                        size={CHIP_AVATAR_PX}
                        tightLineBox
                        className="rounded-full"
                      />
                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text)]/85">
                        {label}
                      </span>
                      <button
                        type="button"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text)]/65 transition hover:bg-[var(--text)]/10 hover:text-[var(--text)]"
                        aria-label={`Remove ${label}`}
                        disabled={disabled}
                        tabIndex={expanded ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(p.id);
                        }}
                      >
                        <PiX className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            type="button"
            disabled={!canInteract}
            tabIndex={expanded ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              if (expanded) onToggle();
            }}
            className="flex shrink-0 items-center justify-center rounded-full border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_45%,transparent)] text-[var(--text)]/55 transition hover:border-amber-400/40 hover:bg-amber-400/15 hover:text-amber-700 app-dark:hover:text-amber-200"
            style={{ width: CHECK_PX, height: CHECK_PX }}
            aria-label="Collapse selected people"
          >
            <PiCheck className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      {action}
    </div>
  );
}
