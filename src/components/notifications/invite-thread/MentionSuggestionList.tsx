/**
 * Presentational @mention suggestion listbox (invite-thread visual language).
 * Parent owns filtering, insertion, and dismissal.
 */

import type { Ref } from "react";
import type { InviteThreadParticipant } from "../../../api/services/inviteThreads";
import Avatar from "../../ui/Avatar";

function participantLabel(p: InviteThreadParticipant): string {
  return p.display_name || p.username || "Member";
}

function participantPrimaryLine(p: InviteThreadParticipant): string {
  const d = (p.display_name ?? "").trim();
  const u = (p.username ?? "").trim();
  return d || u || "EchoToo user";
}

function participantSecondaryLine(p: InviteThreadParticipant): string | null {
  const d = (p.display_name ?? "").trim();
  const u = (p.username ?? "").trim();
  if (!u || !d) return null;
  return `@${u}`;
}

export type MentionSuggestionListProps = {
  suggestions: InviteThreadParticipant[];
  onSelect: (participant: InviteThreadParticipant) => void;
  listboxRef?: Ref<HTMLDivElement>;
  className?: string;
};

export default function MentionSuggestionList({
  suggestions,
  onSelect,
  listboxRef,
  className = "",
}: MentionSuggestionListProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listboxRef}
      className={[
        "absolute bottom-full left-0 right-0 z-[25] mb-1 overflow-hidden rounded-xl border border-neutral-900/17 bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-xl app-dark:border-white/22 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="listbox"
      aria-label="Mention suggestions"
    >
      <div className="max-h-[min(200px,36dvh)] touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] py-1">
        {suggestions.map((p, idx) => {
          const rowKey = `${p.user_id ?? p.username ?? `m-${idx}`}`;
          const primary = participantPrimaryLine(p);
          const secondary = participantSecondaryLine(p);
          const isLast = idx === suggestions.length - 1;
          const optionLabel =
            secondary != null ? `${primary}, ${secondary}` : primary;
          return (
            <div
              key={rowKey}
              role="option"
              tabIndex={0}
              aria-label={optionLabel}
              data-mention-row="true"
              data-mention-zone="row"
              className={`flex w-full min-h-[44px] cursor-pointer select-none items-center px-3 py-2 text-left outline-none transition-colors hover:bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] app-dark:hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-amber-400/40 ${
                isLast
                  ? ""
                  : "border-b border-neutral-900/10 app-dark:border-white/[0.08]"
              }`}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") {
                  e.preventDefault();
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                onSelect(p);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p);
                }
              }}
            >
              <div
                data-mention-zone="content"
                className="flex min-w-0 shrink items-center gap-2.5"
              >
                <Avatar
                  variant="default"
                  url={p.avatar_url || undefined}
                  name={participantLabel(p)}
                  size={34}
                  tightLineBox
                  className="shrink-0 rounded-full"
                  userId={p.user_id ?? undefined}
                  disableInnerPointer
                  imageDraggable={false}
                />
                <div className="min-w-0 max-w-[min(100%,18rem)] flex-1">
                  <p className="truncate text-sm font-medium leading-snug text-[var(--text)]">
                    {primary}
                  </p>
                  {secondary ? (
                    <p className="truncate text-xs text-[var(--text)]/55">
                      {secondary}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                data-mention-zone="empty"
                className="min-h-0 min-w-0 flex-1 self-stretch"
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
