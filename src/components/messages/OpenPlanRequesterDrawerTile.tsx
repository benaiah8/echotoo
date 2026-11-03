/**
 * Open Plan requester row for the host drawer list.
 * Top: avatar + name/date stack + Chat (far right). Second: full-width note.
 * Full-width hairline divider between rows (hidden on last listitem).
 * No bio/Decline. Avatar/name open profile when profile_open_key is present.
 */

import { formatRequestedAt } from "../../lib/formatRequestedAt";
import { resolveOpenPlanRequesterNameLabel } from "../../lib/openPlanRequesterNameLabel";
import type { OpenPlanRequester } from "../../lib/people/types";
import { resolveOpenPlanRequesterProfileOpenKey } from "../../lib/people/resolveRequesterProfileOpenKey";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import OpenPlanAnonymousAvatar from "./OpenPlanAnonymousAvatar";

const AVATAR_PX = 40;

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
  const { label: nameLabel, kind: nameKind } =
    resolveOpenPlanRequesterNameLabel(request);
  const note = request.note?.trim() || null;
  const sentLabel = request.requested_at
    ? formatRequestedAt(request.requested_at)
    : null;
  const profileOpenKey = resolveOpenPlanRequesterProfileOpenKey(request);
  const canOpenProfile = Boolean(profileOpenKey);

  const identityBlock = (
    <span className="relative h-10 w-10 shrink-0" aria-hidden={!canOpenProfile}>
      <OpenPlanAnonymousAvatar
        avatarUrl={request.avatar_url}
        profilePhotos={request.profile_photos}
        echoPreset={request.echo_preset}
        neutralEchoSeed={request.request_id}
        size={AVATAR_PX}
      />
    </span>
  );

  const nameClass = [
    "block min-w-0 truncate text-[14px] font-semibold leading-snug",
    nameKind === "named" ? "text-[var(--text)]" : "text-[var(--text)]/45",
  ].join(" ");

  const nameEl = canOpenProfile ? (
    <button
      type="button"
      onClick={() => onProfile(request)}
      className="min-w-0 max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
      aria-label={peopleUiCopy.deckOpenProfile}
    >
      <span
        data-requester-display-name
        data-requester-name-kind={nameKind}
        className={nameClass}
      >
        {nameLabel}
      </span>
    </button>
  ) : (
    <span
      data-requester-display-name
      data-requester-name-kind={nameKind}
      className={nameClass}
    >
      {nameLabel}
    </span>
  );

  return (
    <div
      className="flex min-w-0 flex-col"
      data-open-plan-requester-row="true"
    >
      <div className="flex min-w-0 flex-col gap-1.5 px-1 py-3">
        <div
          className="flex min-w-0 items-center gap-2.5"
          data-open-plan-requester-top="true"
        >
          {canOpenProfile ? (
            <button
              type="button"
              onClick={() => onProfile(request)}
              className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
              aria-label={peopleUiCopy.deckOpenProfile}
            >
              {identityBlock}
            </button>
          ) : (
            <div className="shrink-0">{identityBlock}</div>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {nameEl}
            {sentLabel ? (
              <span
                data-open-plan-request-sent
                className="mt-0.5 text-[12px] leading-snug text-[var(--text)]/50"
              >
                {sentLabel}
              </span>
            ) : null}
          </div>

          {/* Label is Chat; handler remains accept → DM. Far right of identity row. */}
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
              "inline-flex min-h-11 shrink-0 items-center justify-center self-center",
              "touch-manipulation disabled:pointer-events-none disabled:opacity-40",
            ].join(" ")}
          >
            <span
              data-open-plan-accept-pill
              className={[
                "inline-flex h-7 min-w-[4.5rem] items-center justify-center rounded-full px-3",
                "border border-[var(--brand-glass-border)] bg-[var(--brand)]",
                "text-[12.5px] font-semibold leading-none text-[var(--brand-ink)]",
                "transition active:scale-[0.96]",
              ].join(" ")}
            >
              {busy ? "…" : peopleUiCopy.openPlanIncomingAccept}
            </span>
          </button>
        </div>

        {note ? (
          <p
            data-open-plan-request-note
            className="w-full break-words text-[13px] font-normal leading-snug text-[var(--text)]/70 [overflow-wrap:anywhere]"
          >
            {note}
          </p>
        ) : null}
      </div>

      {/* Full-bleed hairline — same token as People feed row separators. */}
      <div
        role="separator"
        data-open-plan-requester-divider="true"
        className="h-px w-full shrink-0 bg-[var(--border)] group-last/op-req:hidden"
      />
    </div>
  );
}
