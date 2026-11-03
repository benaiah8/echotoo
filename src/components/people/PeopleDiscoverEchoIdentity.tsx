/**
 * Discover Echo-only identity — centered name + profile affordance above the character.
 * Not used on real profile photos (those keep MinePortraitIdentityOverlay).
 */
import { PiArrowSquareOutBold } from "react-icons/pi";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export default function PeopleDiscoverEchoIdentity({
  name,
  onOpenProfile,
  discoverCharacterName = false,
}: {
  name: string;
  onOpenProfile?: () => void;
  /** Larger type on unified Discover character cards only. */
  discoverCharacterName?: boolean;
}) {
  const nameClass = discoverCharacterName
    ? "truncate text-[clamp(1.125rem,4.8vw,1.25rem)] font-semibold leading-tight tracking-tight [text-shadow:0_1px_8px_color-mix(in_oklab,var(--bg)_72%,transparent)]"
    : "truncate text-[clamp(1rem,4.2vw,1.125rem)] font-semibold leading-tight tracking-tight";
  const label = name?.trim() || "Someone";
  const canOpen = Boolean(onOpenProfile);

  if (canOpen) {
    return (
      <div
        className="flex w-full flex-col items-center gap-1 px-2 text-center"
        data-people-discover-echo-identity="true"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenProfile?.();
          }}
          className="inline-flex max-w-full items-center justify-center gap-1.5 touch-manipulation text-[var(--text)] transition active:scale-[0.98]"
          aria-label={`${peopleUiCopy.deckOpenProfile}: ${label}`}
          data-people-discover-echo-name-hit="true"
        >
          <span className={nameClass}>{label}</span>
          <PiArrowSquareOutBold
            className="h-4 w-4 shrink-0 opacity-65"
            aria-hidden
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full px-2 text-center"
      data-people-discover-echo-identity="true"
    >
      <span
        className={`block ${nameClass} text-[var(--text)]`}
        data-people-discover-echo-name="true"
      >
        {label}
      </span>
    </div>
  );
}
