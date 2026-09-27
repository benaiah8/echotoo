import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PiArrowsOut, PiPencilSimple, PiPlus } from "react-icons/pi";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { resolveDisplayEchoPreset } from "../../lib/profileIdentityMedia";
import {
  PROFILE_PHOTOS_MAX,
  resolveProfileHeroPhotos,
} from "../../lib/profilePhotos";
import {
  PROFILE_HERO_CARD_EXCHANGE_EASE,
  PROFILE_HERO_CARD_EXCHANGE_MS,
  PROFILE_HERO_CARD_TRANSFORM_ORIGIN,
  PROFILE_HERO_ECHO_CLEARANCE_CLASS,
  PROFILE_HERO_EXPAND_EASE,
  PROFILE_HERO_EXPAND_MS,
  PROFILE_HERO_NAV_OVERHANG_CLASS,
  PROFILE_HERO_REAR_SQUIRCLE_RADIUS,
  PROFILE_HERO_SIZE_STYLE,
  PROFILE_HERO_SQUIRCLE_RADIUS,
  PROFILE_HERO_TOP_PAD_CLASS,
  PROFILE_HERO_WRAPPER_CLASS,
  deriveOwnProfileHeroCycleIndexAfterAdd,
  deriveProfileHeroNextIndex,
  deriveProfileHeroPrevIndex,
  profileHeroCardBorderClass,
  profileHeroCardOpacity,
  profileHeroCardShadowClass,
  profileHeroCardTransform,
  profileHeroCardZIndex,
  profileHeroClipPaddingBottomPercent,
  profileHeroColumnWidth,
  profileHeroFrontTapAction,
  profileHeroStackAssignments,
  profileHeroStackClipPath,
  shouldShowProfileHeroCycleNav,
  type ProfileHeroStackMotion,
  type ProfileHeroStackRole,
} from "../../lib/profilePhotoHeroPresentation";
import { MemberNumberHeroBadge } from "./MemberNumberPill";
import AvatarPreviewLightbox from "./AvatarPreviewLightbox";

type LightboxActions =
  | ReactNode
  | ((api: { close: () => void }) => ReactNode);

type Props = {
  profilePhotos?: string[] | null;
  avatarUrl?: string | null;
  echoPreset?: string | null;
  userId?: string | null;
  profileId?: string | null;
  displayName?: string | null;
  memberNo?: number | null;
  onEditProfile?: () => void;
  onEchoClick?: () => void;
  showEmptySlots?: boolean;
  onAddPhoto?: () => void;
  /** Disables Add affordance while picker/crop/upload is active. */
  addPhotoBusy?: boolean;
  lightboxActions?: LightboxActions;
  onActiveDisplayPathChange?: (path: string | null) => void;
};

type HeroItem =
  | { kind: "photo"; path: string; slot: number }
  | { kind: "add"; slot: number };

const EDIT_BTN =
  "absolute right-1.5 top-0 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center " +
  "rounded-full bg-[var(--brand)] text-[var(--brand-ink)] " +
  "shadow-[0_2px_10px_rgba(0,0,0,0.28)] " +
  "transition hover:brightness-[0.97] active:scale-95 touch-manipulation";

const ECHO_RING =
  "rounded-full border-[3px] " +
  "app-light:border-neutral-950/80 app-dark:border-white/85 " +
  "shadow-[0_4px_14px_rgba(0,0,0,0.22)]";

const ADD_SURFACE =
  "flex h-full w-full flex-col items-center justify-center gap-1.5 " +
  "bg-[color-mix(in_oklab,var(--glass-bg)_88%,var(--surface-2))] " +
  "app-light:bg-[color-mix(in_oklab,var(--surface)_70%,var(--surface-2))]";

const ECHO_INNER_CLASS =
  "flex h-[clamp(2.75rem,11vw,3.5rem)] w-[clamp(2.75rem,11vw,3.5rem)] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)]";

function heroItemKey(item: HeroItem): string {
  return item.kind === "photo" ? `photo-${item.path}` : `add-${item.slot}`;
}

function itemsMatch(a: HeroItem, b: HeroItem): boolean {
  if (a.kind === "photo" && b.kind === "photo") return a.path === b.path;
  if (a.kind === "add" && b.kind === "add") return a.slot === b.slot;
  return false;
}

function buildStackItems(
  photos: string[],
  showEmptySlots: boolean,
): HeroItem[] {
  if (showEmptySlots) {
    return Array.from({ length: PROFILE_PHOTOS_MAX }, (_, slot) => {
      const path = photos[slot];
      return path
        ? { kind: "photo" as const, path, slot }
        : { kind: "add" as const, slot };
    });
  }
  return photos.map((path, slot) => ({
    kind: "photo" as const,
    path,
    slot,
  }));
}

function buildCycleItems(
  photos: string[],
  showEmptySlots: boolean,
): HeroItem[] {
  if (!showEmptySlots) {
    return photos.map((path, slot) => ({
      kind: "photo" as const,
      path,
      slot,
    }));
  }
  if (photos.length === 0) {
    return [{ kind: "add", slot: 0 }];
  }
  const photoItems = photos.map((path, slot) => ({
    kind: "photo" as const,
    path,
    slot,
  }));
  if (photos.length >= PROFILE_PHOTOS_MAX) return photoItems;
  return [...photoItems, { kind: "add", slot: photos.length }];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function findStackIndex(stackItems: HeroItem[], active: HeroItem | null): number {
  if (!active || stackItems.length === 0) return 0;
  const idx = stackItems.findIndex((item) => itemsMatch(item, active));
  return idx >= 0 ? idx : 0;
}

export default function ProfilePhotoHero({
  profilePhotos,
  avatarUrl,
  echoPreset,
  userId,
  profileId,
  displayName,
  memberNo,
  onEditProfile,
  onEchoClick,
  showEmptySlots = false,
  onAddPhoto,
  addPhotoBusy = false,
  lightboxActions,
  onActiveDisplayPathChange,
}: Props) {
  const [heroExpanded, setHeroExpanded] = useState(false);
  const photos = useMemo(
    () =>
      resolveProfileHeroPhotos({
        profile_photos: profilePhotos,
        avatar_url: avatarUrl,
      }),
    [profilePhotos, avatarUrl],
  );
  const echo = useMemo(
    () =>
      resolveDisplayEchoPreset({
        profile_photos: profilePhotos,
        echo_preset: echoPreset,
        avatar_url: avatarUrl,
        user_id: userId,
        profile_id: profileId,
      }),
    [profilePhotos, echoPreset, avatarUrl, userId, profileId],
  );
  const echoSrc = echo ? avatarDisplayUrl(echo) : undefined;

  const stackItems = useMemo(
    () => buildStackItems(photos, showEmptySlots),
    [photos, showEmptySlots],
  );
  const cycleItems = useMemo(
    () => buildCycleItems(photos, showEmptySlots),
    [photos, showEmptySlots],
  );

  const [cycleIndex, setCycleIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prevPhotosLenRef = useRef(photos.length);

  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);
  const [demotingIndex, setDemotingIndex] = useState<number | null>(null);
  const displayedFrontRef = useRef(0);
  const exchangeGenRef = useRef(0);
  const mountedExchangeRef = useRef(false);
  const stackKey = stackItems.map(heroItemKey).join("|");
  const prevStackKeyRef = useRef(stackKey);

  useEffect(() => {
    const prevLen = prevPhotosLenRef.current;
    const nextLen = photos.length;
    if (showEmptySlots && nextLen > prevLen) {
      setCycleIndex(deriveOwnProfileHeroCycleIndexAfterAdd(prevLen, nextLen));
    } else {
      setCycleIndex((i) =>
        cycleItems.length === 0 ? 0 : Math.min(i, cycleItems.length - 1),
      );
    }
    prevPhotosLenRef.current = nextLen;
  }, [photos, cycleItems.length, showEmptySlots]);

  const safeCycle =
    cycleItems.length === 0
      ? 0
      : Math.min(cycleIndex, cycleItems.length - 1);
  const activeItem = cycleItems[safeCycle] ?? null;
  const activeIsPhoto = activeItem?.kind === "photo";
  const activeIsAdd = activeItem?.kind === "add";
  const activePath = activeIsPhoto ? activeItem.path : null;
  const activeSrc = activePath ? avatarDisplayUrl(activePath) : undefined;

  const frontStackIndex = findStackIndex(stackItems, activeItem);

  useEffect(() => {
    const nextFront = frontStackIndex;
    const stackChanged = prevStackKeyRef.current !== stackKey;
    prevStackKeyRef.current = stackKey;

    if (!mountedExchangeRef.current) {
      mountedExchangeRef.current = true;
      displayedFrontRef.current = nextFront;
      setPromotingIndex(null);
      setDemotingIndex(null);
      return;
    }

    // Photo-list identity change: settle immediately (no exchange flash).
    if (stackChanged) {
      exchangeGenRef.current += 1;
      displayedFrontRef.current = nextFront;
      setPromotingIndex(null);
      setDemotingIndex(null);
      return;
    }

    const prevFront = displayedFrontRef.current;
    if (prevFront === nextFront) return;

    const gen = ++exchangeGenRef.current;
    displayedFrontRef.current = nextFront;

    if (prefersReducedMotion()) {
      setPromotingIndex(null);
      setDemotingIndex(null);
      return;
    }

    setPromotingIndex(nextFront);
    setDemotingIndex(prevFront);

    const settleTimer = window.setTimeout(() => {
      if (gen !== exchangeGenRef.current) return;
      setPromotingIndex(null);
      setDemotingIndex(null);
    }, PROFILE_HERO_CARD_EXCHANGE_MS);

    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [frontStackIndex, stackKey]);

  const atmospherePath = useMemo(() => {
    if (activePath) return activePath;
    if (activeIsAdd) return photos[0] ?? echo ?? null;
    return echo ?? null;
  }, [activePath, activeIsAdd, photos, echo]);

  useEffect(() => {
    onActiveDisplayPathChange?.(atmospherePath);
  }, [atmospherePath, onActiveDisplayPathChange]);

  const roleByIndex = useMemo(() => {
    const map = new Map<number, ProfileHeroStackRole>();
    for (const a of profileHeroStackAssignments(
      stackItems.length,
      frontStackIndex,
    )) {
      map.set(a.itemIndex, a.role);
    }
    return map;
  }, [stackItems.length, frontStackIndex]);

  const canCycle = cycleItems.length > 1;
  const showCycleNav = shouldShowProfileHeroCycleNav(cycleItems.length);

  const cyclePrev = () => {
    if (!canCycle) return;
    setCycleIndex((i) =>
      deriveProfileHeroPrevIndex(i, cycleItems.length),
    );
  };

  const cycleNext = () => {
    if (!canCycle) return;
    setCycleIndex((i) =>
      deriveProfileHeroNextIndex(i, cycleItems.length),
    );
  };

  const onFrontTap = () => {
    const action = profileHeroFrontTapAction(heroExpanded);
    if (action === "expand") {
      setHeroExpanded(true);
      return;
    }
    cycleNext();
  };

  const openLightbox = () => {
    if (!activeSrc) return;
    setLightboxOpen(true);
  };

  const lightboxSrc = activeSrc ?? null;
  const alt = displayName?.trim() || "Profile";
  const resolvedLightboxActions =
    typeof lightboxActions === "function"
      ? lightboxActions({ close: () => setLightboxOpen(false) })
      : lightboxActions;

  const renderMemberBadge = () =>
    memberNo != null ? <MemberNumberHeroBadge memberNo={memberNo} /> : null;

  /** Own-only — outside clip so it stays visible when collapsed. */
  const renderEditAffordance = () =>
    onEditProfile ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditProfile();
        }}
        className={EDIT_BTN}
        aria-label="Edit profile"
      >
        <PiPencilSimple className="h-[14px] w-[14px]" aria-hidden />
      </button>
    ) : null;

  const navDotVisibleClass =
    "h-1.5 w-1.5 rounded-full " +
    "app-dark:bg-white/70 app-light:bg-[var(--text)]/55";

  const renderEchoCycleNav = () => {
    if (!showCycleNav) return null;
    return (
      <div
        className="pointer-events-none absolute left-1/2 top-full z-[1] mt-1.5 flex -translate-x-1/2 -translate-y-1/2 items-center"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Previous profile item"
          onClick={(e) => {
            e.stopPropagation();
            cyclePrev();
          }}
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-end touch-manipulation"
        >
          <span className={navDotVisibleClass} aria-hidden />
        </button>
        <div
          className="h-11 w-[clamp(2rem,8vw,2.5rem)] shrink-0"
          aria-hidden
        />
        <button
          type="button"
          aria-label="Next profile item"
          onClick={(e) => {
            e.stopPropagation();
            cycleNext();
          }}
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-start touch-manipulation"
        >
          <span className={navDotVisibleClass} aria-hidden />
        </button>
      </div>
    );
  };

  const renderCardFace = (item: HeroItem, isFront: boolean) => {
    if (item.kind === "photo") {
      const src = avatarDisplayUrl(item.path);
      return src ? (
        <img
          src={src}
          alt={isFront ? alt : ""}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <span className="block h-full w-full bg-[var(--surface-2)]" />
      );
    }

    if (!isFront) {
      return (
        <div className={`${ADD_SURFACE} opacity-90`}>
          <PiPlus className="h-6 w-6 text-[var(--text)]/35" />
        </div>
      );
    }

    const addEnabled = Boolean(onAddPhoto) && !addPhotoBusy;
    return (
      <div className={ADD_SURFACE}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!addEnabled) return;
            onAddPhoto?.();
          }}
          disabled={!addEnabled}
          aria-label="Add profile photo"
          className={[
            "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1.5",
            "rounded-[1rem] px-4 py-3 touch-manipulation",
            "transition-[transform,opacity] active:scale-[0.98]",
            addEnabled
              ? "cursor-pointer"
              : "cursor-default opacity-60 pointer-events-none",
          ].join(" ")}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)]/50 bg-[var(--surface)]/70 text-[var(--text)]/70">
            <PiPlus className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-[12px] font-medium text-[var(--text)]/55">
            {addPhotoBusy ? "Adding…" : "Add photo"}
          </span>
        </button>
      </div>
    );
  };

  if (!showEmptySlots && photos.length === 0) {
    return (
      <div className="relative mx-auto flex w-full max-w-full min-w-0 flex-col items-center">
        <div
          className={[
            PROFILE_HERO_WRAPPER_CLASS,
            PROFILE_HERO_TOP_PAD_CLASS,
            "relative",
          ].join(" ")}
          style={{ width: "clamp(7.5rem, min(42vw, 22dvh), 9rem)" }}
        >
          {renderMemberBadge()}
          <div className="relative flex items-center justify-center pt-1">
            <button
              type="button"
              disabled={!echoSrc}
              onClick={() => {
                if (echoSrc) setLightboxOpen(true);
              }}
              aria-label="View Echo"
              className={[
                "relative",
                ECHO_RING,
                "transition-[transform,opacity] active:scale-[0.98]",
                echoSrc ? "cursor-pointer" : "cursor-default",
                "disabled:pointer-events-none",
              ].join(" ")}
            >
              <span className={ECHO_INNER_CLASS}>
                {echoSrc ? (
                  <img
                    src={echoSrc}
                    alt=""
                    className="h-full w-full object-cover pointer-events-none"
                    draggable={false}
                  />
                ) : (
                  <span className="text-sm text-[var(--text)]/35">Echo</span>
                )}
              </span>
            </button>
          </div>
        </div>

        {echoSrc ? (
          <AvatarPreviewLightbox
            src={echoSrc}
            alt={alt}
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            variant="circle"
            actions={resolvedLightboxActions}
          />
        ) : null}
      </div>
    );
  }

  const heroColumnStyle: CSSProperties = {
    width: profileHeroColumnWidth(heroExpanded),
    transition: prefersReducedMotion()
      ? undefined
      : `width ${PROFILE_HERO_EXPAND_MS}ms ${PROFILE_HERO_EXPAND_EASE}`,
  };

  /** Full composition height of the current column width (compact or expanded). */
  const clipStyle: CSSProperties = {
    width: "100%",
    height: 0,
    paddingBottom: `${profileHeroClipPaddingBottomPercent()}%`,
    clipPath: profileHeroStackClipPath(),
  };

  const fullMediaStyle: CSSProperties = {
    width: "100%",
    aspectRatio: PROFILE_HERO_SIZE_STYLE.aspectRatio,
  };

  const cardTransition = prefersReducedMotion()
    ? undefined
    : `transform ${PROFILE_HERO_CARD_EXCHANGE_MS}ms ${PROFILE_HERO_CARD_EXCHANGE_EASE}, opacity ${PROFILE_HERO_CARD_EXCHANGE_MS}ms ${PROFILE_HERO_CARD_EXCHANGE_EASE}, box-shadow ${PROFILE_HERO_CARD_EXCHANGE_MS}ms ${PROFILE_HERO_CARD_EXCHANGE_EASE}`;

  const frontAriaLabel = !heroExpanded
    ? "Show full profile photo"
    : canCycle
      ? activeIsAdd
        ? "Empty photo slot. Tap to show next."
        : `Profile photo ${(activeItem && activeItem.kind === "photo" ? activeItem.slot : 0) + 1}. Tap to show next.`
      : activeIsAdd
        ? "Empty photo slot"
        : "Profile photo";

  return (
    <div className="relative mx-auto flex w-full max-w-full min-w-0 flex-col items-center">
      <div
        className={[
          PROFILE_HERO_WRAPPER_CLASS,
          PROFILE_HERO_TOP_PAD_CLASS,
          "flex flex-col px-1",
        ].join(" ")}
        style={heroColumnStyle}
      >
        <div className="relative w-full overflow-visible">
          {renderMemberBadge()}
          {renderEditAffordance()}

          <div
            className="relative w-full overflow-visible"
            style={clipStyle}
            data-profile-hero-clip="stack"
            data-profile-hero-expanded={heroExpanded ? "true" : "false"}
          >
            <div
              className="absolute inset-x-0 top-0 w-full overflow-visible"
              style={fullMediaStyle}
            >
              <div className="relative h-full w-full overflow-visible">
                {stackItems.map((item, itemIndex) => {
                  const role = roleByIndex.get(itemIndex);
                  if (!role) return null;

                  const isFront = role === "front";
                  const motion: ProfileHeroStackMotion =
                    itemIndex === promotingIndex
                      ? "promoting"
                      : itemIndex === demotingIndex
                        ? "demoting"
                        : "settled";
                  const z = profileHeroCardZIndex(role, motion);
                  const radius = isFront
                    ? PROFILE_HERO_SQUIRCLE_RADIUS
                    : PROFILE_HERO_REAR_SQUIRCLE_RADIUS;

                  const borderClass = profileHeroCardBorderClass(heroExpanded);
                  const shadowClass = profileHeroCardShadowClass(
                    role,
                    heroExpanded,
                  );
                  const cardStyle: CSSProperties = {
                    zIndex: z,
                    opacity: profileHeroCardOpacity(role, heroExpanded),
                    transformOrigin: PROFILE_HERO_CARD_TRANSFORM_ORIGIN,
                    transform: profileHeroCardTransform(role, heroExpanded),
                    transition: cardTransition,
                  };

                  if (isFront) {
                    return (
                      <div
                        key={heroItemKey(item)}
                        role="button"
                        tabIndex={0}
                        onClick={onFrontTap}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onFrontTap();
                          }
                        }}
                        aria-label={frontAriaLabel}
                        aria-expanded={heroExpanded}
                        data-profile-hero-card={role}
                        data-profile-hero-card-index={itemIndex}
                        className={[
                          "absolute left-1/2 top-1/2 h-full w-full",
                          "overflow-hidden bg-[var(--surface-2)]/40",
                          borderClass,
                          shadowClass,
                          "touch-manipulation active:scale-[0.995] cursor-pointer",
                          radius,
                        ].join(" ")}
                        style={cardStyle}
                      >
                        {renderCardFace(item, true)}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={heroItemKey(item)}
                      aria-hidden
                      data-profile-hero-card={role}
                      data-profile-hero-card-index={itemIndex}
                      className={[
                        "pointer-events-none absolute left-1/2 top-1/2 h-full w-full overflow-hidden",
                        "bg-[var(--surface-2)]/50",
                        borderClass,
                        shadowClass,
                        radius,
                      ].join(" ")}
                      style={cardStyle}
                    >
                      {renderCardFace(item, false)}
                    </div>
                  );
                })}

                {activeIsPhoto && activeSrc ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightbox();
                    }}
                    className="absolute bottom-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]/70 bg-[color-mix(in_oklab,var(--surface)_78%,transparent)] text-[var(--text)]/90 shadow-sm backdrop-blur-md transition active:scale-95 touch-manipulation"
                    aria-label="View full screen"
                  >
                    <PiArrowsOut className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {echoSrc || showCycleNav ? (
            <div className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2 translate-y-1/2">
              {echoSrc ? (
                <button
                  type="button"
                  onClick={() => onEchoClick?.()}
                  aria-label={onEchoClick ? "Edit Echo" : "Echo"}
                  className={[
                    "relative z-[2]",
                    ECHO_RING,
                    onEchoClick
                      ? "cursor-pointer transition-[transform] active:scale-[0.98]"
                      : "cursor-default",
                  ].join(" ")}
                >
                  <span className={ECHO_INNER_CLASS}>
                    <img
                      src={echoSrc}
                      alt=""
                      className="h-full w-full object-cover pointer-events-none"
                      draggable={false}
                    />
                  </span>
                </button>
              ) : null}
              {renderEchoCycleNav()}
            </div>
          ) : null}
        </div>

        {echoSrc ? (
          <div className={PROFILE_HERO_ECHO_CLEARANCE_CLASS} aria-hidden />
        ) : (
          <div className="h-1" aria-hidden />
        )}
        {showCycleNav ? (
          <div className={PROFILE_HERO_NAV_OVERHANG_CLASS} aria-hidden />
        ) : null}
      </div>

      {lightboxSrc ? (
        <AvatarPreviewLightbox
          src={lightboxSrc}
          alt={alt}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          variant="portrait"
          actions={resolvedLightboxActions}
        />
      ) : null}
    </div>
  );
}
