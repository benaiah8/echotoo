/**
 * Open Plan requester tile for the host drawer grid.
 * Photo + display name (or "Name hidden") + compact Accept — no bio/Decline in drawer.
 * Avatar/name open full-page profile when profile_open_key is present.
 */

import type { OpenPlanRequester } from "../../lib/people/types";
import { resolveOpenPlanRequesterProfileOpenKey } from "../../lib/people/resolveRequesterProfileOpenKey";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import OpenPlanAnonymousAvatar from "./OpenPlanAnonymousAvatar";

const AVATAR_PX = 56;

type Props = {
  request: OpenPlanRequester;
  busy: boolean;
  onAccept: (requestId: string) => void;
  onProfile: (request: OpenPlanRequester) => void;
};

export default function OpenPlanRequesterDrawerTile({
  request,
  busy,
  onAccept,
  onProfile,
}: Props) {
  const visibleName = request.display_name?.trim() || null;
  const nameLabel = visibleName || peopleUiCopy.openPlanRequesterNameHidden;
  const profileOpenKey = resolveOpenPlanRequesterProfileOpenKey(request);
  const canOpenProfile = Boolean(profileOpenKey);

  const identityBlock = (
    <>
      <span className="relative mx-auto h-14 w-14 shrink-0" aria-hidden={!canOpenProfile}>
        <OpenPlanAnonymousAvatar
          avatarUrl={request.avatar_url}
          profilePhotos={request.profile_photos}
          echoPreset={request.echo_preset}
          size={AVATAR_PX}
        />
      </span>
      <span
        data-requester-display-name
        className={[
          "mt-1.5 w-full truncate text-center text-[12.5px] font-semibold leading-snug",
          visibleName ? "text-[var(--text)]" : "text-[var(--text)]/45",
        ].join(" ")}
      >
        {nameLabel}
      </span>
    </>
  );

  return (
    <div className="flex min-w-0 flex-col items-center px-0.5 py-1.5 text-center">
      {canOpenProfile ? (
        <button
          type="button"
          onClick={() => onProfile(request)}
          className="flex w-full min-w-0 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          aria-label={peopleUiCopy.deckOpenProfile}
        >
          {identityBlock}
        </button>
      ) : (
        <div className="flex w-full min-w-0 flex-col items-center">
          {identityBlock}
        </div>
      )}
      {/* Visual pill ~28px; min-h-11 wrapper keeps ≥44px touch target. */}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        aria-label={peopleUiCopy.openPlanIncomingAccept}
        onClick={(e) => {
          e.stopPropagation();
          if (busy) return;
          onAccept(request.request_id);
        }}
        className={[
          "mt-1 inline-flex min-h-11 w-[80px] max-w-[82px] min-w-[76px] items-center justify-center",
          "touch-manipulation disabled:pointer-events-none disabled:opacity-40",
        ].join(" ")}
      >
        <span
          data-open-plan-accept-pill
          className={[
            "inline-flex h-7 w-full items-center justify-center rounded-full px-2.5",
            "border border-[var(--brand-glass-border)] bg-[var(--brand)]",
            "text-[12.5px] font-semibold leading-none text-[var(--brand-ink)]",
            "transition active:scale-[0.96]",
          ].join(" ")}
        >
          {busy ? "…" : peopleUiCopy.openPlanIncomingAccept}
        </span>
      </button>
    </div>
  );
}
