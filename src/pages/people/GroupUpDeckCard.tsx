import type { GroupUpCandidate } from "../../lib/people/types";
import type { GroupUpDeckViewerLabel } from "../../lib/groupUpBrowse";
import { peopleUiCopy } from "./peopleUiCopy";

export type GroupUpDeckPhotoKind = "photo" | "preset" | "empty";

/**
 * Group-first Group Up browse card (not person-first like MatchDeckCard).
 */
export default function GroupUpDeckCard({
  candidate,
  occursLabel,
  typeChipLabel,
  hostedByLabel,
  organizerPhotoUrl,
  organizerPhotoKind,
  onHostTap,
  viewerLabel = null,
}: {
  candidate: GroupUpCandidate;
  occursLabel: string | null;
  typeChipLabel: string;
  hostedByLabel: string;
  organizerPhotoUrl: string | null;
  organizerPhotoKind: GroupUpDeckPhotoKind;
  onHostTap?: () => void;
  /** Requested / Host / Member (G3) when shown under Yours. */
  viewerLabel?: GroupUpDeckViewerLabel;
}) {
  const title = candidate.group_title?.trim() || peopleUiCopy.groupUp;
  const description = candidate.group_description?.trim() || null;
  const caption = candidate.source_caption?.trim() || null;
  const memberLabel =
    candidate.member_count > 0
      ? `${candidate.member_count} member${candidate.member_count === 1 ? "" : "s"}`
      : null;

  const viewerLabelCopy =
    viewerLabel === "requested"
      ? peopleUiCopy.groupUpBrowseRequested
      : viewerLabel === "host"
        ? peopleUiCopy.groupUpBrowseHostLabel
        : viewerLabel === "member"
          ? "Member"
          : null;

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-[18px] border border-[var(--border)]/60 bg-[var(--surface-2)] shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {viewerLabelCopy ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[var(--text)]/20 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] px-2.5 text-[11px] font-semibold leading-none text-[var(--text)]/85">
              {viewerLabelCopy}
            </span>
          ) : null}
          <span className="inline-flex h-7 items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-2.5 text-[11px] font-semibold leading-none text-[var(--text)]">
            {typeChipLabel}
          </span>
          {occursLabel ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[var(--text)]/16 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] px-2.5 text-[11px] font-semibold leading-none text-[var(--text)]/80">
              {occursLabel}
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-2">
          <h2 className="text-[18px] font-bold leading-tight text-[var(--text)] line-clamp-2">
            {title}
          </h2>
          {description ? (
            <p className="text-[13px] leading-snug text-[var(--text)]/75 line-clamp-3">
              {description}
            </p>
          ) : null}
          {caption ? (
            <p className="text-[12px] leading-snug text-[var(--text)]/55 line-clamp-2">
              {caption}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2.5 border-t border-[var(--border)]/50 pt-3 text-left transition active:opacity-90 disabled:pointer-events-none"
          disabled={!onHostTap}
          onClick={(e) => {
            e.stopPropagation();
            onHostTap?.();
          }}
        >
          {organizerPhotoKind === "photo" && organizerPhotoUrl ? (
            <img
              src={organizerPhotoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]/40"
              draggable={false}
            />
          ) : organizerPhotoKind === "preset" && organizerPhotoUrl ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)]/40">
              <img
                src={organizerPhotoUrl}
                alt=""
                className="h-[78%] w-[78%] object-contain"
                draggable={false}
              />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-ink)] ring-1 ring-[var(--border)]/40">
              <span className="text-sm font-semibold">?</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[var(--text)]/85">
              {hostedByLabel}
            </p>
            {memberLabel ? (
              <p className="text-[11px] text-[var(--text)]/55">{memberLabel}</p>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}
