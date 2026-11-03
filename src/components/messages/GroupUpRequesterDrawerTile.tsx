/**
 * Group Up requester row for the host drawer list.
 * Top: avatar + name/date stack + Accept/Decline (far right). Second: full-width note.
 * Full-width hairline divider between rows (hidden on last listitem).
 * Presentation only — accept/decline/profile handlers stay on the overlay.
 */

import { PiCheck, PiX } from "react-icons/pi";
import { formatRequestedAt } from "../../lib/formatRequestedAt";
import type { GroupUpRequester } from "../../lib/people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import Avatar from "../ui/Avatar";

const AVATAR_PX = 40;

type Props = {
  request: GroupUpRequester;
  busy: boolean;
  onProfile: (request: GroupUpRequester) => void;
  onAccept: (requestId: string, requestedAt: string) => void;
  onDecline: (requestId: string, requestedAt: string) => void;
};

export default function GroupUpRequesterDrawerTile({
  request,
  busy,
  onProfile,
  onAccept,
  onDecline,
}: Props) {
  const name =
    request.display_name?.trim() ||
    request.username?.trim() ||
    peopleUiCopy.groupUpIncomingSomeone;
  const note = request.note?.trim() || null;
  const sentLabel = request.requested_at
    ? formatRequestedAt(request.requested_at)
    : null;

  return (
    <div
      className="flex min-w-0 flex-col"
      data-group-up-requester-row="true"
    >
      <div className="flex min-w-0 flex-col gap-1.5 px-1 py-3">
        <div
          className="flex min-w-0 items-center gap-2.5"
          data-group-up-requester-top="true"
        >
          <button
            type="button"
            onClick={() => onProfile(request)}
            className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
            aria-label={peopleUiCopy.deckOpenProfile}
          >
            <span className="relative h-10 w-10 shrink-0">
              <Avatar
                url={request.avatar_url}
                name={name}
                userId={request.requester_user_id}
                size={AVATAR_PX}
                tightLineBox
                disableInnerPointer
                className="rounded-full"
              />
            </span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <button
              type="button"
              onClick={() => onProfile(request)}
              className="min-w-0 max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
              aria-label={peopleUiCopy.deckOpenProfile}
            >
              <span
                data-requester-display-name
                className="block min-w-0 truncate text-[14px] font-semibold leading-snug text-[var(--text)]"
              >
                {name}
              </span>
            </button>
            {sentLabel ? (
              <span
                data-group-up-request-sent
                className="mt-0.5 text-[12px] leading-snug text-[var(--text)]/50"
              >
                {sentLabel}
              </span>
            ) : null}
          </div>

          <div
            data-requester-action-pill
            className="inline-flex shrink-0 items-center self-center rounded-full border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)]"
          >
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              aria-label={peopleUiCopy.groupUpIncomingAccept}
              onClick={(e) => {
                e.stopPropagation();
                if (busy) return;
                onAccept(request.request_id, request.requested_at);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center transition active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand)] text-[var(--brand-ink)]">
                {busy ? (
                  <span className="text-[11px] font-semibold leading-none">
                    …
                  </span>
                ) : (
                  <PiCheck className="h-4 w-4" aria-hidden />
                )}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={peopleUiCopy.groupUpIncomingDecline}
              onClick={(e) => {
                e.stopPropagation();
                if (busy) return;
                onDecline(request.request_id, request.requested_at);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center transition active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--text)]/20 bg-[color-mix(in_oklab,var(--surface-2)_78%,transparent)] text-[var(--text)]/80 app-dark:border-white/18 app-dark:bg-[color-mix(in_oklab,var(--surface)_55%,#111)] app-light:border-black/12">
                <PiX className="h-4 w-4" aria-hidden />
              </span>
            </button>
          </div>
        </div>

        {note ? (
          <p
            data-group-up-request-note
            className="w-full break-words text-[13px] font-normal leading-snug text-[var(--text)]/70 [overflow-wrap:anywhere]"
          >
            {note}
          </p>
        ) : null}
      </div>

      {/* Full-bleed hairline — same token as Open Plan / People feed separators. */}
      <div
        role="separator"
        data-group-up-requester-divider="true"
        className="h-px w-full shrink-0 bg-[var(--border)] group-last/gu-req:hidden"
      />
    </div>
  );
}
