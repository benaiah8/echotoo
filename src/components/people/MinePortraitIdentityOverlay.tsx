/**
 * Mine portrait identity: fixed over moving photos.
 * Top-center: display name + profile icon (only those open Profile).
 * Bottom: expandable bio + readability gradient (bio never opens Profile).
 *
 * Embla may start horizontal drag from name / bio. Pointer handlers must not
 * stopPropagation on down/move. Taps use the same 10px move threshold as photo
 * cycle so a drag never opens profile / toggles bio.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PiArrowSquareOutBold } from "react-icons/pi";
import { peopleIdentityMovedPastTapThreshold } from "../../lib/people/mineIdentityGesture";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** Inset inside the media frame (≈12px — within 10–14px brief). */
export const PEOPLE_MINE_IDENTITY_TOP_INSET_PX = 12;
/** Horizontal clearance from portrait edges. */
export const PEOPLE_MINE_IDENTITY_SIDE_INSET_PX = 12;
/**
 * Room reserved per side so a centered chip never reaches the top-right
 * fullscreen control (44px hit + ~4px inset + small gap).
 */
export const PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX = 52;
/** @deprecated Alias — identity is top-center; side inset clears edges. */
export const PEOPLE_MINE_IDENTITY_LEFT_INSET_PX =
  PEOPLE_MINE_IDENTITY_SIDE_INSET_PX;

const NAME_TEXT_CLASS =
  "block min-w-0 max-w-full truncate font-[family-name:var(--font-people-display)] text-[16px] font-medium leading-none tracking-wide text-inherit";

/** Feed: smaller, less dominant name on photo. */
const NAME_TEXT_FEED_CLASS =
  "block min-w-0 max-w-full truncate text-[12px] font-medium leading-none tracking-tight text-inherit";

const PROFILE_HIT_CLASS =
  "pointer-events-auto relative z-[1] inline-flex min-w-0 max-w-full cursor-pointer items-center border-0 bg-transparent p-0 text-inherit outline-none touch-manipulation";

/**
 * Compact frosted chip behind name + icon for contrast on bright/dark photos.
 * Chip is pointer-events-none; only the name/icon buttons receive taps.
 */
const IDENTITY_CHIP_CLASS = [
  "pointer-events-none relative z-[1] inline-flex min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden",
  "rounded-full border px-2.5 py-1.5 shadow-sm",
  "backdrop-blur-md backdrop-saturate-125",
  // Dark theme: dark glass + light text
  "border-white/18 bg-black/58 text-white",
  // Light theme: light glass + dark text
  "app-light:border-black/12 app-light:bg-white/78 app-light:text-[color-mix(in_oklab,var(--text)_92%,#0b0b0c)]",
].join(" ");

const IDENTITY_CHIP_FEED_CLASS = [
  "pointer-events-none relative z-[1] inline-flex min-w-0 max-w-full items-center justify-center gap-0.5 overflow-hidden",
  "rounded-full border px-2 py-1 shadow-sm",
  "backdrop-blur-md backdrop-saturate-125",
  "border-white/14 bg-black/42 text-white/95",
  "app-light:border-black/10 app-light:bg-white/70 app-light:text-[color-mix(in_oklab,var(--text)_88%,#0b0b0c)]",
].join(" ");

const BIO_TEXT_CLASS = "text-[13px] leading-relaxed text-white/88";
const BIO_TEXT_FLAT_LIGHT_CLASS =
  "text-[13px] leading-relaxed text-[var(--text)]";

/** Expanded bio stays inside the front plate; scrolls internally. */
const BIO_EXPANDED_MAX_CLASS =
  "max-h-[10rem] overflow-y-auto overscroll-contain";

/** Collapsed: stronger dark scrim for bright photos (both themes). */
const GRADIENT_COLLAPSED =
  "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.68) 40%, rgba(0,0,0,0.32) 70%, transparent 100%)";

/**
 * Expanded: near-opaque behind the readable block, soft fade above the text.
 * Stays inside the rounded front plate via the identity plate overflow clip.
 */
const GRADIENT_EXPANDED =
  "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.94) 48%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.28) 88%, transparent 100%)";

/**
 * Modern Duo light-mode photo only. Dark mode and Discover keep the constants above.
 * Bottom stop stays in the 55–62% band so white bio text still reads.
 */
const GRADIENT_COLLAPSED_DUO_LIGHT_PHOTO =
  "linear-gradient(to top, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.32) 46%, rgba(0,0,0,0.10) 74%, transparent 100%)";

const GRADIENT_EXPANDED_DUO_LIGHT_PHOTO =
  "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.50) 48%, rgba(0,0,0,0.20) 76%, transparent 100%)";

/** Modern Duo only. `flat` is Echo, empty, or a failed legacy photo that paints Echo. */
export type DuoPortraitScrim = "photo" | "flat";

export function resolveDuoPortraitScrim(options: {
  duoPortraitScrim?: DuoPortraitScrim | null;
  light: boolean;
  expanded: boolean;
}): { background: string | null; bioClass: string } {
  const { duoPortraitScrim, light, expanded } = options;
  if (!duoPortraitScrim || !light) {
    return {
      background: expanded ? GRADIENT_EXPANDED : GRADIENT_COLLAPSED,
      bioClass: BIO_TEXT_CLASS,
    };
  }
  if (duoPortraitScrim === "flat") {
    return { background: null, bioClass: BIO_TEXT_FLAT_LIGHT_CLASS };
  }
  return {
    background: expanded
      ? GRADIENT_EXPANDED_DUO_LIGHT_PHOTO
      : GRADIENT_COLLAPSED_DUO_LIGHT_PHOTO,
    bioClass: BIO_TEXT_CLASS,
  };
}

function readThemeLight(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("theme-light")
  );
}

function useThemeLight(active: boolean): boolean {
  const [light, setLight] = useState(readThemeLight);
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const read = () => setLight(readThemeLight());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, [active]);
  return active ? light : false;
}

export default function MinePortraitIdentityOverlay({
  name,
  bio,
  resetKey,
  interactive = true,
  onOpenProfile,
  feedLayout = false,
  duoPortraitScrim = null,
}: {
  name: string;
  bio: string | null;
  /** Collapse when candidate or photo index changes. */
  resetKey: string;
  /** When false (neighbor slides), bio/profile are non-interactive. */
  interactive?: boolean;
  /** When set, the display name / profile icon open this candidate's profile. */
  onOpenProfile?: () => void;
  /** People vertical feed — subtler upper-right chip (clears fullscreen). */
  feedLayout?: boolean;
  /**
   * Modern Duo paint only. Omitted for Discover and legacy Mine so those
   * keep {@link GRADIENT_COLLAPSED} / {@link GRADIENT_EXPANDED}.
   */
  duoPortraitScrim?: DuoPortraitScrim | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const measureRef = useRef<HTMLElement | null>(null);
  const bioOriginRef = useRef<{ x: number; y: number } | null>(null);
  const nameOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressBioToggleRef = useRef(false);
  const suppressProfileRef = useRef(false);
  const themeLight = useThemeLight(duoPortraitScrim != null);
  const portraitScrim = resolveDuoPortraitScrim({
    duoPortraitScrim,
    light: themeLight,
    expanded,
  });

  useEffect(() => {
    setExpanded(false);
    suppressBioToggleRef.current = false;
    suppressProfileRef.current = false;
    bioOriginRef.current = null;
    nameOriginRef.current = null;
  }, [resetKey]);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = measureRef.current;
    if (!el || !bio) {
      setCanExpand(false);
      return;
    }
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [bio, expanded, name, resetKey]);

  const toggle = useCallback(() => {
    if (!interactive || !canExpand) return;
    setExpanded((v) => !v);
  }, [canExpand, interactive]);

  const openProfile = useCallback(() => {
    if (!interactive || !onOpenProfile) return;
    onOpenProfile();
  }, [interactive, onOpenProfile]);

  const onBioKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    [toggle]
  );

  const onBioPointerDown = useCallback((e: ReactPointerEvent) => {
    // Do not stopPropagation — Embla listens on the viewport and must see the gesture.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    bioOriginRef.current = { x: e.clientX, y: e.clientY };
    suppressBioToggleRef.current = false;
  }, []);

  const onBioPointerMove = useCallback((e: ReactPointerEvent) => {
    const origin = bioOriginRef.current;
    if (!origin) return;
    if (peopleIdentityMovedPastTapThreshold(origin, e.clientX, e.clientY)) {
      suppressBioToggleRef.current = true;
    }
  }, []);

  const onBioPointerUp = useCallback(() => {
    bioOriginRef.current = null;
  }, []);

  const onBioScroll = useCallback(() => {
    suppressBioToggleRef.current = true;
  }, []);

  const onBioClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressBioToggleRef.current) {
        suppressBioToggleRef.current = false;
        return;
      }
      toggle();
    },
    [toggle]
  );

  const onProfilePointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    nameOriginRef.current = { x: e.clientX, y: e.clientY };
    suppressProfileRef.current = false;
  }, []);

  const onProfilePointerMove = useCallback((e: ReactPointerEvent) => {
    const origin = nameOriginRef.current;
    if (!origin) return;
    if (peopleIdentityMovedPastTapThreshold(origin, e.clientX, e.clientY)) {
      suppressProfileRef.current = true;
    }
  }, []);

  const onProfilePointerUp = useCallback(() => {
    nameOriginRef.current = null;
  }, []);

  const onProfileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressProfileRef.current) {
        suppressProfileRef.current = false;
        return;
      }
      openProfile();
    },
    [openProfile]
  );

  const onProfileKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      openProfile();
    },
    [openProfile]
  );

  const showBioControl = Boolean(bio && interactive && (canExpand || expanded));
  const canOpenProfile = Boolean(interactive && onOpenProfile);

  const profilePointerProps = {
    onClick: onProfileClick,
    onPointerDown: onProfilePointerDown,
    onPointerMove: onProfilePointerMove,
    onPointerUp: onProfilePointerUp,
    onPointerCancel: onProfilePointerUp,
    onKeyDown: onProfileKeyDown,
  } as const;

  const nameTextClass = feedLayout ? NAME_TEXT_FEED_CLASS : NAME_TEXT_CLASS;
  const chipClass = feedLayout ? IDENTITY_CHIP_FEED_CLASS : IDENTITY_CHIP_CLASS;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[4]"
      data-people-duo-identity="true"
      data-people-mine-identity="true"
      data-people-mine-identity-expanded={expanded ? "true" : "false"}
      data-people-feed-identity={feedLayout ? "true" : undefined}
    >
      {/* Deck: top-center. Feed Discover: top-left; right inset clears fullscreen. */}
      <div
        className={
          feedLayout
            ? "pointer-events-none absolute z-[5] flex min-w-0 justify-start"
            : "pointer-events-none absolute left-1/2 z-[5] flex min-w-0 -translate-x-1/2 justify-center"
        }
        style={
          feedLayout
            ? {
                top: 8,
                left: PEOPLE_MINE_IDENTITY_SIDE_INSET_PX,
                right: PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX,
              }
            : {
                top: PEOPLE_MINE_IDENTITY_TOP_INSET_PX,
                maxWidth: `calc(100% - ${PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX * 2}px)`,
              }
        }
        data-people-mine-identity-top="true"
        data-people-mine-identity-anchor={
          feedLayout ? "top-left" : "top-center"
        }
      >
        <div
          className={chipClass}
          data-people-mine-identity-chip="true"
          data-people-mine-identity-name-row="true"
        >
          {canOpenProfile ? (
            <>
              <button
                type="button"
                className={`${PROFILE_HIT_CLASS} min-h-[28px] min-w-0`}
                data-people-mine-identity-hit="true"
                data-people-mine-profile-hit="true"
                data-people-mine-profile-name-hit="true"
                aria-label={peopleUiCopy.deckOpenProfile}
                title={peopleUiCopy.deckOpenProfile}
                {...profilePointerProps}
              >
                <span className={nameTextClass}>{name}</span>
              </button>
              <button
                type="button"
                className={`${PROFILE_HIT_CLASS} min-h-[28px] shrink-0 p-0.5`}
                data-people-mine-identity-hit="true"
                data-people-mine-profile-hit="true"
                data-people-mine-profile-icon-hit="true"
                aria-label={peopleUiCopy.deckOpenProfile}
                title={peopleUiCopy.deckOpenProfile}
                {...profilePointerProps}
              >
                <PiArrowSquareOutBold
                  className={
                    feedLayout
                      ? "h-3 w-3 opacity-70"
                      : "h-3.5 w-3.5 opacity-75"
                  }
                  aria-hidden
                />
              </button>
            </>
          ) : (
            <span className={`${nameTextClass} relative z-[1]`}>{name}</span>
          )}
        </div>
      </div>

      {/* Bottom: bio + scrim only — never a Profile trigger. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex flex-col justify-end"
        data-people-mine-identity-bio-region="true"
      >
        <div
          className={`relative flex min-h-0 flex-col gap-0.75 px-[18px] pb-4 ${
            expanded ? "pt-16" : "pt-14"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={
              portraitScrim.background
                ? { background: portraitScrim.background }
                : undefined
            }
            aria-hidden
            data-people-mine-identity-bio-scrim="true"
            data-people-duo-portrait-scrim={duoPortraitScrim ?? undefined}
          />
          {bio ? (
            showBioControl ? (
              <button
                type="button"
                className={`pointer-events-auto relative w-full cursor-pointer border-0 bg-transparent p-0 text-left outline-none ${portraitScrim.bioClass} ${
                  expanded ? BIO_EXPANDED_MAX_CLASS : ""
                }`}
                style={expanded ? { touchAction: "pan-y" } : undefined}
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse bio" : "Expand bio"}
                data-people-mine-identity-hit="true"
                data-people-mine-bio-hit="true"
                onClick={onBioClick}
                onPointerDown={onBioPointerDown}
                onPointerMove={onBioPointerMove}
                onPointerUp={onBioPointerUp}
                onPointerCancel={onBioPointerUp}
                onScroll={onBioScroll}
                onKeyDown={onBioKeyDown}
              >
                <span
                  ref={(node) => {
                    measureRef.current = node;
                  }}
                  className={
                    expanded ? "whitespace-pre-wrap" : "line-clamp-2"
                  }
                >
                  {bio}
                </span>
              </button>
            ) : (
              <p
                ref={(node) => {
                  measureRef.current = node;
                }}
                className={`relative line-clamp-2 ${portraitScrim.bioClass}`}
              >
                {bio}
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
