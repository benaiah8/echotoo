/**
 * Identified Group Up request row for Messages → Requests.
 */

import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import type { GroupUpIncomingRequest } from "../../lib/people/types";
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
  request: GroupUpIncomingRequest;
  busy: boolean;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
};

export default function GroupUpIncomingRequestRow({
  request,
  busy,
  onAccept,
  onDecline,
}: Props) {
  const src = avatarDisplayUrl(request.avatar_url) ?? null;
  const isPreset = isAvatarPresetValue(request.avatar_url);
  const name =
    request.display_name?.trim() ||
    request.username?.trim() ||
    peopleUiCopy.groupUpIncomingSomeone;
  const title = request.title?.trim() || peopleUiCopy.groupUp;
  const caption = request.source_caption?.trim() || null;
  const typeLabel =
    request.source_type === "hangout"
      ? peopleUiCopy.groupUpBrowseTypeEvent
      : request.source_type === "experience"
        ? peopleUiCopy.groupUpBrowseTypePlace
        : null;
  const occursLabel = request.occurs_at
    ? formatSocialOccursSchedule(
        request.occurs_at,
        request.occurs_time_explicit !== false
      )
    : null;
  const requestedLabel = request.requested_at
    ? formatRequestedAt(request.requested_at)
    : null;
  const initial = name.slice(0, 1).toUpperCase() || "?";

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
              <span className="text-[18px] leading-none">{initial}</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                {peopleUiCopy.groupUpIncomingLabel}
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
                {name}
              </p>
              {request.username?.trim() ? (
                <p className="truncate text-[12px] text-[var(--text)]/55">
                  @{request.username.trim()}
                </p>
              ) : null}
            </div>
            {requestedLabel ? (
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--text)]/45">
                {requestedLabel}
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--text)]">
            {title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {typeLabel ? (
              <span className="inline-flex items-center rounded-full border border-[var(--text)]/14 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--text)]/60">
                {typeLabel}
              </span>
            ) : null}
            <span className="text-[11px] font-semibold text-[var(--text)]/50">
              {peopleUiCopy.groupUpBrowseRequested}
            </span>
          </div>
          {occursLabel ? (
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--text)]/70">
              {occursLabel}
            </p>
          ) : null}
          {caption ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--text)]/60">
              {caption}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
                "inline-flex min-h-11 min-w-[6.5rem] items-center justify-center rounded-full px-4",
                "border border-[var(--brand-glass-border)] bg-[var(--brand)] text-[13px] font-semibold text-[var(--brand-ink)]",
                "transition active:scale-[0.96]",
                "disabled:pointer-events-none disabled:opacity-40",
              ].join(" ")}
            >
              {busy ? "…" : peopleUiCopy.groupUpIncomingAccept}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                if (busy) return;
                onDecline(request.request_id);
              }}
              className={[
                "inline-flex min-h-11 min-w-[6.5rem] items-center justify-center rounded-full px-4",
                "border border-[var(--text)]/18 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] text-[13px] font-semibold text-[var(--text)]",
                "transition active:scale-[0.96]",
                "disabled:pointer-events-none disabled:opacity-40",
              ].join(" ")}
            >
              {peopleUiCopy.groupUpIncomingDecline}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
