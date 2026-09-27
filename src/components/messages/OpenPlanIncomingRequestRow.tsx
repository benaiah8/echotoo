/**
 * Anonymous Open Plan request row for Messages → Requests.
 * No name, username, or profile navigation before Accept.
 */

import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import type { OpenPlanIncomingRequest } from "../../lib/people/types";
import { formatOpenPlanSchedule } from "../../lib/openPlanSchedule";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

function formatRequestedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  request: OpenPlanIncomingRequest;
  busy: boolean;
  onAccept: (requestId: string) => void;
};

export default function OpenPlanIncomingRequestRow({
  request,
  busy,
  onAccept,
}: Props) {
  const src = avatarDisplayUrl(request.avatar_url) ?? null;
  const isPreset = isAvatarPresetValue(request.avatar_url);
  const caption = request.source_caption?.trim() || null;
  const planNote = request.plan_description?.trim() || null;
  const bio = request.bio?.trim() || null;
  const occursLabel = request.occurs_at
    ? formatOpenPlanSchedule(
        request.occurs_at,
        request.occurs_time_explicit !== false
      )
    : null;
  const requestedLabel = request.requested_at
    ? formatRequestedAt(request.requested_at)
    : null;

  return (
    <li className="border-b border-[var(--border)]/50 px-1 py-3">
      <div className="flex w-full max-w-full items-start gap-3">
        <div
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/40"
          aria-hidden
        >
          {src && !isPreset ? (
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              decoding="async"
            />
          ) : src && isPreset ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface)]">
              <img
                src={src}
                alt=""
                className="h-[78%] w-[78%] object-contain"
                draggable={false}
                decoding="async"
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--brand)] font-semibold text-[var(--brand-ink)]">
              <span className="text-[18px] leading-none">?</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                {peopleUiCopy.openPlanIncomingLabel}
              </p>
              {caption ? (
                <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text)]">
                  {caption}
                </p>
              ) : (
                <p className="mt-0.5 text-[15px] font-semibold leading-snug text-[var(--text)]">
                  {peopleUiCopy.openPlanIncomingLabel}
                </p>
              )}
            </div>
            {requestedLabel ? (
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--text)]/45">
                {requestedLabel}
              </span>
            ) : null}
          </div>

          {occursLabel ? (
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--text)]/70">
              {occursLabel}
            </p>
          ) : null}
          {planNote ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/65">
              <span className="mr-1 inline-flex translate-y-[-1px] items-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]">
                {peopleUiCopy.openPlansNoteLabel}
              </span>
              {planNote}
            </p>
          ) : null}
          {bio ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/60">
              {bio}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text)]/45">
            {peopleUiCopy.openPlanIncomingPrivacyLine}
          </p>

          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (busy) return;
              onAccept(request.request_id);
            }}
            className={[
              "mt-3 inline-flex min-h-11 min-w-[7.5rem] items-center justify-center rounded-full px-4",
              "border border-[var(--brand-glass-border)] bg-[var(--brand)] text-[13px] font-semibold text-[var(--brand-ink)]",
              "transition active:scale-[0.96]",
              "disabled:pointer-events-none disabled:opacity-40",
            ].join(" ")}
          >
            {busy ? "…" : peopleUiCopy.openPlanIncomingAccept}
          </button>
        </div>
      </div>
    </li>
  );
}
