import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  profileIdentityInitial,
  resolveProfileIdentityMedia,
  type ProfileIdentityMediaSource,
} from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DUO_FRONT_RADIUS,
  PEOPLE_DUO_FRONT_ROTATE_DEG,
  PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS,
  PEOPLE_DUO_PHOTO_BORDER_REAR_CSS,
  PEOPLE_DUO_REAR_OPACITY,
  PEOPLE_DUO_REAR_RADIUS,
  PEOPLE_PHOTO_CROSSFADE_EASE,
  PEOPLE_PHOTO_CROSSFADE_MS,
  PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
  peopleDuoPeekTransformOrigin,
  peopleDuoPhotoPeekTransform,
  peoplePhotoStackPeeks,
  prefersPeopleMotionReduce,
  type PeopleDuoPeekDirection,
} from "../../lib/people/peopleCandidateMediaPresentation";

export type PeopleCandidateMediaProps = {
  source: ProfileIdentityMediaSource;
  activeIndex: number;
  onActiveIndexChange?: (index: number) => void;
  withPhoto?: boolean;
  isCurrent?: boolean;
  className?: string;
  enableTapCycle?: boolean;
  /**
   * Mine uses upward rear peeks; Discover keeps legacy downward until parity.
   */
  peekDirection?: PeopleDuoPeekDirection;
  /**
   * Rendered INSIDE the front photo frame (name/bio).
   * Must stay within overflow-hidden rounded frame.
   */
  identityOverlay?: ReactNode;
};

const PRESET_SHELL =
  "flex h-[46%] max-h-[11rem] w-[46%] max-w-[11rem] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/50";

const FACE_IN_FROM = "translateX(6px) scale(0.99)";
const FACE_OUT_TO = "translateX(-5px) scale(0.99)";
const FACE_SETTLED = "translateX(0) scale(1)";

/**
 * People Duo portrait media — Profile-style fan presentation (duplicated).
 * Embla tap protection kept; never imports ProfilePhotoHero.
 */
export default function PeopleCandidateMedia({
  source,
  activeIndex,
  onActiveIndexChange,
  withPhoto = true,
  isCurrent = false,
  className = "",
  enableTapCycle = true,
  peekDirection = "down",
  identityOverlay,
}: PeopleCandidateMediaProps) {
  const resolved = resolveProfileIdentityMedia(source);

  const photos = resolved.photos.slice(0, 3);
  const photoCount = photos.length;
  const safeIndex =
    photoCount > 0
      ? ((activeIndex % photoCount) + photoCount) % photoCount
      : 0;

  const reduceMotion = prefersPeopleMotionReduce();
  const [displayIndex, setDisplayIndex] = useState(safeIndex);
  const [frontMotion, setFrontMotion] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    if (photoCount <= 1 || reduceMotion) {
      setDisplayIndex(safeIndex);
      setFrontMotion("idle");
      return;
    }
    if (safeIndex === displayIndex) return;
    setFrontMotion("out");
    let settleTimer = 0;
    const outTimer = window.setTimeout(() => {
      setDisplayIndex(safeIndex);
      setFrontMotion("in");
      settleTimer = window.setTimeout(
        () => setFrontMotion("idle"),
        PEOPLE_PHOTO_CROSSFADE_MS
      );
    }, PEOPLE_PHOTO_CROSSFADE_MS / 2);
    return () => {
      window.clearTimeout(outTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [safeIndex, photoCount, reduceMotion, displayIndex]);

  const cycle = useCallback(() => {
    if (!enableTapCycle || photoCount <= 1 || !onActiveIndexChange) return;
    onActiveIndexChange((safeIndex + 1) % photoCount);
  }, [enableTapCycle, onActiveIndexChange, photoCount, safeIndex]);

  const initial = profileIdentityInitial(source);
  const peeks = peoplePhotoStackPeeks(photoCount, isCurrent && withPhoto);
  const interactive = enableTapCycle && photoCount > 1 && withPhoto && isCurrent;

  const tapOriginRef = useRef<{
    x: number;
    y: number;
    id: number;
  } | null>(null);

  const clearTapOrigin = useCallback(() => {
    tapOriginRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tapOriginRef.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
      };
    },
    [interactive]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive) {
        clearTapOrigin();
        return;
      }
      const origin = tapOriginRef.current;
      tapOriginRef.current = null;
      if (!origin || origin.id !== e.pointerId) return;
      const dx = Math.abs(e.clientX - origin.x);
      const dy = Math.abs(e.clientY - origin.y);
      if (
        dx > PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX ||
        dy > PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX
      ) {
        return;
      }
      e.stopPropagation();
      cycle();
    },
    [clearTapOrigin, cycle, interactive]
  );

  const frontRadiusStyle = {
    borderRadius: PEOPLE_DUO_FRONT_RADIUS,
    border: `1px solid ${PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS}`,
  } as const;
  const rearRadiusStyle = {
    borderRadius: PEOPLE_DUO_REAR_RADIUS,
    border: `1px solid ${PEOPLE_DUO_PHOTO_BORDER_REAR_CSS}`,
  } as const;

  const faceTransition = reduceMotion
    ? undefined
    : `opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}, transform ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`;

  let stack: ReactNode;

  if (!withPhoto) {
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
        style={frontRadiusStyle}
        aria-hidden
      />
    );
  } else if (resolved.kind === "photos" && photoCount > 0) {
    const frontPath = photos[displayIndex] ?? photos[safeIndex];
    const frontSrc = frontPath ? avatarDisplayUrl(frontPath) : undefined;

    const rearPaths: string[] = [];
    for (let i = 1; i < photoCount && rearPaths.length < peeks.length; i += 1) {
      const p = photos[(displayIndex + i) % photoCount];
      if (p) rearPaths.push(p);
    }

    const faceOpacity =
      reduceMotion || frontMotion === "idle"
        ? 1
        : frontMotion === "out"
          ? 0.55
          : 1;
    const faceTransform =
      reduceMotion || frontMotion === "idle"
        ? FACE_SETTLED
        : frontMotion === "out"
          ? FACE_OUT_TO
          : FACE_IN_FROM;

    stack = (
      <>
        {peeks.map((peek, i) => {
          const path = rearPaths[i];
          if (!path) return null;
          const src = avatarDisplayUrl(path);
          if (!src) return null;
          return (
            <div
              key={`peek-${path}-${peek.side}-${peek.depth}`}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-full w-full overflow-hidden bg-[var(--surface-2)] shadow-[0_6px_18px_rgba(0,0,0,0.16)]"
              style={{
                ...rearRadiusStyle,
                zIndex: peek.zIndex,
                opacity: PEOPLE_DUO_REAR_OPACITY,
                transformOrigin: peopleDuoPeekTransformOrigin(peekDirection),
                transform: peopleDuoPhotoPeekTransform(
                  peek.side,
                  peek.depth,
                  peekDirection
                ),
                transition: reduceMotion
                  ? undefined
                  : `transform ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}, opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`,
              }}
              aria-hidden
            >
              <img
                src={src}
                alt=""
                className="pointer-events-none h-full w-full object-cover object-center"
                draggable={false}
                loading="lazy"
                decoding="async"
              />
            </div>
          );
        })}
        <div
          className="absolute left-1/2 top-1/2 z-[2] h-full w-full overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
          style={{
            ...frontRadiusStyle,
            transform: `translate(-50%, -50%) rotate(${PEOPLE_DUO_FRONT_ROTATE_DEG}deg)`,
          }}
          data-people-duo-photo-frame="true"
        >
          <div
            className="absolute inset-0"
            style={{
              opacity: faceOpacity,
              transform: faceTransform,
              transition: faceTransition,
            }}
          >
            {frontSrc ? (
              <img
                src={frontSrc}
                alt=""
                className="pointer-events-none h-full w-full object-cover object-center"
                draggable={false}
                loading={isCurrent ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={isCurrent ? "high" : "auto"}
              />
            ) : (
              <EmptyFallback initial={initial} />
            )}
          </div>
          {identityOverlay}
        </div>
      </>
    );
  } else if (resolved.kind === "echo" && resolved.echoPreset) {
    const src = avatarDisplayUrl(resolved.echoPreset);
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] flex h-full w-full -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        {src ? (
          <div className={PRESET_SHELL}>
            <img
              src={src}
              alt=""
              className="pointer-events-none h-[86%] w-[86%] object-contain"
              draggable={false}
              loading={isCurrent ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ) : (
          <EmptyFallback initial={initial} />
        )}
        {identityOverlay}
      </div>
    );
  } else if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    const src = avatarDisplayUrl(resolved.primaryPhoto);
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="pointer-events-none h-full w-full object-cover object-center"
            draggable={false}
            loading={isCurrent ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={isCurrent ? "high" : "auto"}
          />
        ) : (
          <EmptyFallback initial={initial} />
        )}
        {identityOverlay}
      </div>
    );
  } else {
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        <EmptyFallback initial={initial} />
        {identityOverlay}
      </div>
    );
  }

  // Upward peeks: allow top/side bleed; clip flush at bottom so rear edges
  // cannot leak beneath the upright front card.
  const stackClipStyle =
    peekDirection === "up"
      ? ({ clipPath: "inset(-18% -14% 0% -14%)" } as const)
      : undefined;

  return (
    <div
      className={`relative h-full w-full overflow-visible ${className}`.trim()}
      style={stackClipStyle}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? clearTapOrigin : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                cycle();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Show next photo" : undefined}
    >
      {stack}
      {isCurrent && withPhoto && photoCount > 1 ? (
        <div
          className="pointer-events-none absolute inset-x-3 top-2.5 z-[3] flex gap-1"
          aria-hidden
        >
          {photos.map((photo, i) => (
            <span
              key={`${photo}-${i}`}
              className={`h-[3px] flex-1 rounded-full ${
                i === safeIndex ? "bg-white/95" : "bg-white/35"
              }`}
              style={{
                transition: reduceMotion
                  ? undefined
                  : `opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyFallback({ initial }: { initial: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)]">
      <div className="flex h-[38%] max-h-[9rem] w-[38%] max-w-[9rem] items-center justify-center rounded-full bg-[var(--brand)] font-semibold text-[var(--brand-ink)] ring-1 ring-[var(--border)]/40">
        <span className="text-[28px] leading-none">{initial}</span>
      </div>
    </div>
  );
}
