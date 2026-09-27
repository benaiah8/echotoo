/**
 * Compact Group Up requester tile for the host drawer grid.
 * Presentation only — accept/decline/profile handlers stay on the overlay.
 */

import { PiCheck, PiX } from "react-icons/pi";
import type { GroupUpRequester } from "../../lib/people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import Avatar from "../ui/Avatar";

const AVATAR_PX = 56;

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

  return (
    <div className="flex min-w-0 flex-col items-center px-0.5 py-1.5 text-center">
      <button
        type="button"
        onClick={() => onProfile(request)}
        className="flex w-full min-w-0 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        aria-label={peopleUiCopy.deckOpenProfile}
      >
        <span className="relative mx-auto h-14 w-14 shrink-0">
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
        <span className="mt-1.5 w-full truncate text-center text-[11px] font-medium leading-snug text-[var(--text)]">
          {name}
        </span>
      </button>
      <div
        data-requester-action-pill
        className="mt-1 inline-flex items-center rounded-full border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)]"
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
              <span className="text-[11px] font-semibold leading-none">…</span>
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
  );
}
