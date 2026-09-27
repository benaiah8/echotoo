/**
 * Group host notch — frosted sibling to MinePortraitIdentityOverlay chip tokens.
 * Does not modify the frozen Mine identity overlay.
 */
import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { peopleIdentityMovedPastTapThreshold } from "../../lib/people/mineIdentityGesture";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/**
 * Compact frosted pill — balanced L/R inset (equal px), tight avatar↔text gap.
 * Width is content-sized inside the full inset host slot (not shrink-to-fit absolute).
 */
const HOST_CHIP_CLASS = [
  "relative z-[1] inline-flex w-max max-w-[min(100%,18rem)] items-center gap-1.5 overflow-hidden",
  "rounded-full border px-2 py-1.5 shadow-sm",
  "backdrop-blur-md backdrop-saturate-125",
  "border-white/18 bg-black/58 text-white",
  "app-light:border-black/12 app-light:bg-white/78 app-light:text-[color-mix(in_oklab,var(--text)_92%,#0b0b0c)]",
].join(" ");

const AVATAR_PX = 28;

export default function PeopleGroupHostNotch({
  displayName,
  avatarUrl,
  hostedByLabel = peopleUiCopy.groupUpBrowseHostedBy,
  onOpenProfile,
}: {
  displayName: string;
  avatarUrl: string | null | undefined;
  hostedByLabel?: string;
  onOpenProfile?: () => void;
}) {
  const name = displayName.trim() || "Host";
  const photoKind = isAvatarPresetValue(avatarUrl)
    ? "preset"
    : avatarDisplayUrl(avatarUrl)
      ? "photo"
      : "empty";
  const photo = photoKind !== "empty" ? avatarDisplayUrl(avatarUrl) : null;

  const originRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRef = useRef(false);

  const openProfile = useCallback(() => {
    if (!onOpenProfile) return;
    onOpenProfile();
  }, [onOpenProfile]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    originRef.current = { x: e.clientX, y: e.clientY };
    suppressRef.current = false;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;
    if (peopleIdentityMovedPastTapThreshold(origin, e.clientX, e.clientY)) {
      suppressRef.current = true;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    originRef.current = null;
  }, []);

  const onClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      if (suppressRef.current) {
        suppressRef.current = false;
        return;
      }
      openProfile();
    },
    [openProfile],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      openProfile();
    },
    [openProfile],
  );

  const body = (
    <>
      {photoKind === "photo" && photo ? (
        <img
          src={photo}
          alt=""
          className="shrink-0 rounded-full object-cover ring-1 ring-white/25"
          style={{ width: AVATAR_PX, height: AVATAR_PX }}
          draggable={false}
        />
      ) : photoKind === "preset" && photo ? (
        <div
          className="flex shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25"
          style={{ width: AVATAR_PX, height: AVATAR_PX }}
        >
          <img
            src={photo}
            alt=""
            className="h-[78%] w-[78%] object-contain"
            draggable={false}
          />
        </div>
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-ink)] ring-1 ring-white/25"
          style={{ width: AVATAR_PX, height: AVATAR_PX }}
        >
          <span className="text-[12px] font-semibold leading-none">
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="min-w-0 max-w-full">
        <p className="truncate text-[9px] font-medium leading-none tracking-wide text-inherit opacity-70">
          {hostedByLabel}
        </p>
        <p className="mt-0.5 truncate font-[family-name:var(--font-people-display)] text-[13px] font-medium leading-tight tracking-wide text-inherit">
          {name}
        </p>
      </div>
    </>
  );

  if (onOpenProfile) {
    return (
      <button
        type="button"
        className={[
          HOST_CHIP_CLASS,
          "pointer-events-auto cursor-pointer text-left outline-none touch-manipulation",
        ].join(" ")}
        data-people-group-host-notch="true"
        data-people-group-host-hit="true"
        aria-label={`${hostedByLabel} ${name}. ${peopleUiCopy.deckOpenProfile}`}
        title={peopleUiCopy.deckOpenProfile}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={`${HOST_CHIP_CLASS} pointer-events-none`}
      data-people-group-host-notch="true"
      aria-label={`${hostedByLabel} ${name}`}
    >
      {body}
    </div>
  );
}
