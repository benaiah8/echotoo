import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PiCamera, PiImages } from "react-icons/pi";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { normalizeProfilePhotos } from "../../lib/profilePhotos";
import {
  deriveInitialCycleIndex,
  deriveCycleIndexAfterPhotoAdd,
  deriveNavigationDotOffsetY,
  deriveQuickSetupPresentation,
  deriveSlotDotPresentation,
  quickSetupSlotAriaLabel,
} from "../../lib/profilePhotoQuickSetupPresentation";
import {
  buildProfilePhotoCycleItems,
  buildProfilePhotoStackItems,
  computeRearPeekItems,
  peekTransform,
  prefersReducedMotion,
  profilePhotoStackItemKey,
  PROFILE_PHOTO_STACK_EASE,
  PROFILE_PHOTO_STACK_IN_FROM,
  PROFILE_PHOTO_STACK_OUT_TO,
  PROFILE_PHOTO_STACK_SETTLED,
  PROFILE_PHOTO_STACK_TRANSITION_MS,
  type ProfilePhotoStackItem,
} from "../../lib/profilePhotoStackPresentation";
import { useProfilePhotoAddPipeline } from "../../hooks/useProfilePhotoAddPipeline";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import MediaAcquisitionSheet from "../create/MediaAcquisitionSheet";
import AvatarCropModal from "./AvatarCropModal";

const SWIPE_COMMIT_PX = 44;

export type ProfilePhotoQuickSetupProps = {
  profileId: string;
  userId: string;
  photos: string[];
  onPhotosChanged?: (photos: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string | null) => void;
  disabled?: boolean;
  className?: string;
  acquisitionPortalClassName?: string;
  /** Compact floating layout for ProfilePhotoPromptOverlay. */
  compact?: boolean;
};

type FaceSnapshot =
  | {
      key: string;
      kind: "photo";
      path: string;
      src: string;
      slot: number;
    }
  | { key: string; kind: "add"; slot: number };

function snapshotFromItem(item: ProfilePhotoStackItem | null): FaceSnapshot {
  if (!item) return { key: "empty", kind: "add", slot: 0 };
  if (item.kind === "add") {
    return { key: profilePhotoStackItemKey(item), kind: "add", slot: item.slot };
  }
  const src = avatarDisplayUrl(item.path);
  if (!src) {
    return { key: profilePhotoStackItemKey(item), kind: "add", slot: item.slot };
  }
  return {
    key: profilePhotoStackItemKey(item),
    kind: "photo",
    path: item.path,
    src,
    slot: item.slot,
  };
}

const STACK_SIZING_STYLE: CSSProperties = {
  width: "min(64vw, 37dvh, 16.25rem)",
  maxWidth: "16.25rem",
};

/** Reserve space below card for floating + (half protrudes below aspect box). */
const STACK_BELOW_RESERVE = "pb-[1.375rem]";

const STACK_AMBIENT_SHADOW =
  "shadow-[0_20px_48px_rgba(0,0,0,0.52)] app-light:shadow-[0_18px_40px_rgba(0,0,0,0.16)]";

const FRONT_CARD =
  "absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 " +
  "overflow-hidden rounded-[1.15rem] border bg-[var(--surface)] touch-manipulation " +
  "app-dark:border-white/20 app-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)] " +
  "app-light:border-[color-mix(in_oklab,var(--text)_16%,var(--border))] " +
  "app-light:shadow-[0_10px_26px_rgba(0,0,0,0.16)]";

const REAR_CARD =
  "pointer-events-none absolute left-1/2 top-1/2 z-[1] h-full w-full overflow-hidden " +
  "rounded-[1.05rem] border bg-[var(--surface-2)] opacity-[0.82] " +
  "transition-[transform,opacity] duration-[280ms] ease-out " +
  "motion-reduce:transition-none " +
  "app-dark:border-white/16 app-dark:shadow-[0_8px_20px_rgba(0,0,0,0.4)] " +
  "app-light:border-[var(--border)]/50 app-light:shadow-[0_6px_16px_rgba(0,0,0,0.1)]";

const EMPTY_SURFACE =
  "relative flex h-full w-full flex-col items-center justify-center " +
  "app-dark:bg-[#c4beb4] app-dark:text-[#141414] " +
  "app-light:bg-[color-mix(in_oklab,#6b7280_26%,var(--surface-2)_74%)] app-light:text-[var(--text)]";

const EMPTY_SOURCE_TILE =
  "flex w-[6.5rem] min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 " +
  "border border-[color-mix(in_oklab,#141414_20%,transparent)] bg-transparent " +
  "app-light:border-[color-mix(in_oklab,var(--text)_16%,var(--border))] " +
  "touch-manipulation transition active:scale-[0.97] disabled:opacity-45";

const EMPTY_SOURCE_ICON =
  "flex h-9 w-9 items-center justify-center rounded-full " +
  "bg-[#141414] text-[#f5f0e8] shadow-[0_3px_10px_rgba(0,0,0,0.4)] " +
  "app-light:bg-[var(--brand-ink)] app-light:text-[var(--brand)]";

const FACE_LAYER =
  "absolute inset-0 will-change-[opacity,transform] " +
  "motion-reduce:!transition-none motion-reduce:!transform-none";

const DEFAULT_ACQUISITION_PORTAL = "z-[130]";

export type ProfilePhotoQuickSetupHandle = {
  consumeBack: () => boolean;
};

function slotDotClassName(dot: ReturnType<typeof deriveSlotDotPresentation>): string {
  if (dot.isCurrent) {
    if (dot.isPrimary) {
      return "h-1.5 w-4 rounded-full bg-[var(--brand)]";
    }
    return [
      "h-1.5 w-4 rounded-full",
      "app-dark:bg-white/90",
      "app-light:bg-[var(--text)]/68",
    ].join(" ");
  }
  if (dot.isPrimary) {
    return "h-1.5 w-1.5 rounded-full bg-[var(--brand)]";
  }
  if (dot.filled) {
    return [
      "h-1.5 w-1.5 rounded-full",
      "app-dark:bg-white/42",
      "app-light:bg-[var(--text)]/32",
    ].join(" ");
  }
  return [
    "h-1.5 w-1.5 rounded-full border bg-transparent",
    "app-dark:border-white/52",
    "app-light:border-[var(--text)]/24",
  ].join(" ");
}

const ProfilePhotoQuickSetup = forwardRef<
  ProfilePhotoQuickSetupHandle,
  ProfilePhotoQuickSetupProps
>(function ProfilePhotoQuickSetup(
  {
    profileId,
    userId,
    photos: photosProp,
    onPhotosChanged,
    onBusyChange,
    onError,
    disabled = false,
    className,
    acquisitionPortalClassName = DEFAULT_ACQUISITION_PORTAL,
    compact = false,
  },
  ref,
) {
  const normalizedPhotos = useMemo(
    () => normalizeProfilePhotos(photosProp),
    [photosProp],
  );
  const presentation = useMemo(
    () => deriveQuickSetupPresentation(normalizedPhotos.length),
    [normalizedPhotos.length],
  );

  const photoAddPipeline = useProfilePhotoAddPipeline({
    profileId,
    userId,
    photos: normalizedPhotos,
    onPhotosChanged,
    onError,
  });

  const photoAddPipelineRef = useRef(photoAddPipeline);
  photoAddPipelineRef.current = photoAddPipeline;

  useImperativeHandle(
    ref,
    () => ({
      consumeBack: () => {
        const pipeline = photoAddPipelineRef.current;
        if (pipeline.cropOpen) {
          pipeline.cancelCrop();
          return true;
        }
        if (pipeline.mediaChooserOpen) {
          pipeline.closeMediaChooser();
          return true;
        }
        return false;
      },
    }),
    [],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const prevPhotoCountRef = useRef(normalizedPhotos.length);

  const stackItems = useMemo(
    () => buildProfilePhotoStackItems(normalizedPhotos),
    [normalizedPhotos],
  );
  const cycleItems = useMemo(
    () => buildProfilePhotoCycleItems(normalizedPhotos),
    [normalizedPhotos],
  );

  const [cycleIndex, setCycleIndex] = useState(() =>
    deriveInitialCycleIndex(normalizedPhotos.length),
  );

  const [incomingFace, setIncomingFace] = useState<FaceSnapshot>(() => {
    const items = buildProfilePhotoCycleItems(normalizedPhotos);
    const initialIndex = deriveInitialCycleIndex(normalizedPhotos.length);
    return snapshotFromItem(items[initialIndex] ?? null);
  });
  const [outgoingFace, setOutgoingFace] = useState<FaceSnapshot | null>(null);
  const [crossfadeActive, setCrossfadeActive] = useState(false);
  const faceRef = useRef<FaceSnapshot>(incomingFace);
  const transitionGenRef = useRef(0);
  const mountedFaceRef = useRef(false);

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onBusyChange?.(photoAddPipeline.busy);
  }, [photoAddPipeline.busy, onBusyChange]);

  useEffect(() => {
    setCycleIndex((i) =>
      cycleItems.length === 0 ? 0 : Math.min(i, cycleItems.length - 1),
    );
  }, [cycleItems.length]);

  useEffect(() => {
    if (normalizedPhotos.length > prevPhotoCountRef.current) {
      setCycleIndex(deriveCycleIndexAfterPhotoAdd(normalizedPhotos.length));
    }
    prevPhotoCountRef.current = normalizedPhotos.length;
  }, [normalizedPhotos.length]);

  const safeCycle =
    cycleItems.length === 0
      ? 0
      : Math.min(cycleIndex, cycleItems.length - 1);
  const activeItem = cycleItems[safeCycle] ?? null;
  const activeKey = activeItem ? profilePhotoStackItemKey(activeItem) : "empty";
  const currentSlot = activeItem?.slot ?? 0;
  const frontIsPhoto = activeItem?.kind === "photo";

  useEffect(() => {
    const next = snapshotFromItem(activeItem);
    const prev = faceRef.current;

    if (!mountedFaceRef.current) {
      mountedFaceRef.current = true;
      faceRef.current = next;
      setIncomingFace(next);
      setOutgoingFace(null);
      setCrossfadeActive(false);
      return;
    }

    if (prev.key === next.key) {
      faceRef.current = next;
      setIncomingFace(next);
      return;
    }

    const gen = ++transitionGenRef.current;

    if (prefersReducedMotion()) {
      faceRef.current = next;
      setIncomingFace(next);
      setOutgoingFace(null);
      setCrossfadeActive(false);
      return;
    }

    setOutgoingFace(prev);
    setIncomingFace(next);
    setCrossfadeActive(false);
    faceRef.current = next;

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (gen !== transitionGenRef.current) return;
        setCrossfadeActive(true);
      });
    });

    const disposeTimer = window.setTimeout(() => {
      if (gen !== transitionGenRef.current) return;
      setOutgoingFace(null);
      setCrossfadeActive(false);
    }, PROFILE_PHOTO_STACK_TRANSITION_MS);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(disposeTimer);
    };
  }, [activeKey, activeItem]);

  const rearItems = useMemo(
    () => computeRearPeekItems(stackItems, activeItem),
    [stackItems, activeItem],
  );

  const canCycle = cycleItems.length > 1;
  const addBlocked =
    disabled || photoAddPipeline.busy || !photoAddPipeline.canAdd;

  const openAddFlow = useCallback(() => {
    if (addBlocked) return;
    photoAddPipeline.openAddPhotos({ preferChooser: true });
  }, [addBlocked, photoAddPipeline]);

  const beginDirectAddSession = useCallback((): boolean => {
    if (addBlocked) return false;
    return photoAddPipeline.openAddPhotos();
  }, [addBlocked, photoAddPipeline]);

  const openDirectCamera = useCallback(() => {
    if (!beginDirectAddSession()) return;
    if (isNativeApp()) {
      void photoAddPipeline.captureCamera();
      return;
    }
    cameraInputRef.current?.click();
  }, [beginDirectAddSession, photoAddPipeline]);

  const openDirectGallery = useCallback(() => {
    if (!beginDirectAddSession()) return;
    if (isNativeApp()) {
      void photoAddPipeline.chooseLibrary();
      return;
    }
    fileInputRef.current?.click();
  }, [beginDirectAddSession, photoAddPipeline]);

  const openWebGalleryPicker = useCallback(() => {
    photoAddPipeline.setMediaChooserOpen(false);
    fileInputRef.current?.click();
  }, [photoAddPipeline]);

  const openWebCameraPicker = useCallback(() => {
    photoAddPipeline.setMediaChooserOpen(false);
    cameraInputRef.current?.click();
  }, [photoAddPipeline]);

  const cycleNext = useCallback(() => {
    if (!canCycle) return;
    setCycleIndex((i) => (i + 1) % cycleItems.length);
  }, [canCycle, cycleItems.length]);

  const cyclePrev = useCallback(() => {
    if (!canCycle) return;
    setCycleIndex(
      (i) => (i - 1 + cycleItems.length) % cycleItems.length,
    );
  }, [canCycle, cycleItems.length]);

  const onFrontTap = useCallback(() => {
    cycleNext();
  }, [cycleNext]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || !canCycle) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < SWIPE_COMMIT_PX || Math.abs(dx) < Math.abs(dy)) return;

      if (dx < 0) cycleNext();
      else cyclePrev();
    },
    [canCycle, cycleNext, cyclePrev],
  );

  const onPointerCancel = useCallback(() => {
    swipeStartRef.current = null;
  }, []);

  const faceTransitionStyle: CSSProperties = {
    transitionProperty: "opacity, transform",
    transitionDuration: `${PROFILE_PHOTO_STACK_TRANSITION_MS}ms`,
    transitionTimingFunction: PROFILE_PHOTO_STACK_EASE,
  };

  const renderAddSpinner = (inverted = false) => (
    <span
      className={[
        "inline-block size-5 animate-spin rounded-full border-2",
        inverted
          ? "border-white/30 border-t-white"
          : "border-[var(--brand-ink)]/30 border-t-[var(--brand-ink)]",
      ].join(" ")}
      aria-hidden
    />
  );

  const renderEmptySlotVisual = (showInlineAdd: boolean) => (
    <div className={EMPTY_SURFACE}>
      {showInlineAdd ? (
        <div className="flex flex-col items-center gap-3 px-2">
          <button
            type="button"
            disabled={addBlocked}
            onClick={(e) => {
              e.stopPropagation();
              openDirectCamera();
            }}
            className={EMPTY_SOURCE_TILE}
            aria-label="Take photo"
          >
            {photoAddPipeline.busy ? (
              renderAddSpinner(true)
            ) : (
              <>
                <span className={EMPTY_SOURCE_ICON} aria-hidden>
                  <PiCamera className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="text-[11px] font-semibold leading-tight text-[#141414] app-light:text-[var(--text)]">
                  Take photo
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={addBlocked}
            onClick={(e) => {
              e.stopPropagation();
              openDirectGallery();
            }}
            className={EMPTY_SOURCE_TILE}
            aria-label="Choose from gallery"
          >
            {photoAddPipeline.busy ? (
              renderAddSpinner(true)
            ) : (
              <>
                <span className={EMPTY_SOURCE_ICON} aria-hidden>
                  <PiImages className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="text-center text-[11px] font-semibold leading-tight text-[#141414] app-light:text-[var(--text)]">
                  Choose from gallery
                </span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderFaceContent = (face: FaceSnapshot) => {
    if (face.kind === "photo") {
      return (
        <img
          src={face.src}
          alt={quickSetupSlotAriaLabel(
            { kind: "photo", path: face.path, slot: face.slot },
            normalizedPhotos.length,
          )}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      );
    }
    const showInlineAdd =
      compact && presentation.canAdd && !frontIsPhoto && face.kind === "add";
    return renderEmptySlotVisual(showInlineAdd);
  };

  const renderStackAddControl = () => {
    if (!compact || !presentation.canAdd) {
      return null;
    }

    const visible = frontIsPhoto;
    const degrees = Math.max(0, Math.min(1, presentation.plusRingRatio)) * 360;
    const ringTrack = "color-mix(in oklab, #141414 55%, transparent)";

    return (
      <button
        type="button"
        disabled={addBlocked || !visible}
        onClick={(e) => {
          e.stopPropagation();
          openAddFlow();
        }}
        aria-label={presentation.addAriaLabel}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        className={[
          "absolute bottom-0 left-1/2 z-[4] flex h-11 w-11 -translate-x-1/2 translate-y-[calc(50%-6px)]",
          "items-center justify-center rounded-full p-[4px]",
          "touch-manipulation transition active:scale-[0.96] disabled:opacity-45",
          "shadow-[0_6px_18px_rgba(0,0,0,0.55)]",
          "app-light:shadow-[0_5px_16px_rgba(0,0,0,0.32)]",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        style={{
          background: `conic-gradient(var(--brand) 0deg ${degrees}deg, ${ringTrack} ${degrees}deg 360deg)`,
        }}
      >
        <span
          className={[
            "flex h-[34px] w-[34px] items-center justify-center rounded-full",
            "bg-[#141414] ring-1 ring-[var(--brand)]/90",
            "app-light:bg-[var(--brand-ink)]",
          ].join(" ")}
        >
          {photoAddPipeline.busy ? (
            renderAddSpinner(true)
          ) : (
            <span
              className="text-[18px] font-bold leading-none text-[var(--brand)]"
              aria-hidden
            >
              +
            </span>
          )}
        </span>
      </button>
    );
  };

  const isCrossfading = outgoingFace != null;

  return (
    <div
      className={[
        "mx-auto flex w-full max-w-full min-w-0 flex-col items-center",
        className ?? "",
      ].join(" ")}
    >
      <div
        className={["relative mx-auto min-w-0 rounded-[1.2rem]", STACK_AMBIENT_SHADOW].join(
          " ",
        )}
        style={STACK_SIZING_STYLE}
      >
        <div className="relative w-full overflow-visible">
          <div
            className={[
              "relative mx-auto aspect-[4/5] w-full max-w-full overflow-visible",
              compact ? STACK_BELOW_RESERVE : "",
            ].join(" ")}
          >
            {rearItems.map(({ item, side }, depth) => (
              <div
                key={profilePhotoStackItemKey(item)}
                aria-hidden
                className={REAR_CARD}
                style={{ transform: peekTransform(side, depth) }}
              >
                {item.kind === "photo" ? (
                  (() => {
                    const src = avatarDisplayUrl(item.path);
                    return src ? (
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <span className="block h-full w-full bg-[var(--surface-2)]" />
                    );
                  })()
                ) : (
                  <div className={EMPTY_SURFACE} />
                )}
              </div>
            ))}

            <div
              role={canCycle ? "button" : undefined}
              tabIndex={canCycle ? 0 : undefined}
              onClick={canCycle ? onFrontTap : undefined}
              onKeyDown={
                canCycle
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onFrontTap();
                      }
                    }
                  : undefined
              }
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              aria-label={
                activeItem
                  ? quickSetupSlotAriaLabel(activeItem, normalizedPhotos.length)
                  : "Photo slot"
              }
              className={[
                FRONT_CARD,
                canCycle ? "cursor-pointer active:scale-[0.995]" : "cursor-default",
              ].join(" ")}
            >
              {outgoingFace ? (
                <div
                  aria-hidden
                  className={FACE_LAYER}
                  style={{
                    ...faceTransitionStyle,
                    zIndex: 1,
                    opacity: crossfadeActive ? 0 : 1,
                    transform: crossfadeActive
                      ? PROFILE_PHOTO_STACK_OUT_TO
                      : PROFILE_PHOTO_STACK_SETTLED,
                  }}
                >
                  {renderFaceContent(outgoingFace)}
                </div>
              ) : null}
              <div
                className={FACE_LAYER}
                style={{
                  ...faceTransitionStyle,
                  zIndex: 2,
                  opacity: isCrossfading ? (crossfadeActive ? 1 : 0) : 1,
                  transform: isCrossfading
                    ? crossfadeActive
                      ? PROFILE_PHOTO_STACK_SETTLED
                      : PROFILE_PHOTO_STACK_IN_FROM
                    : PROFILE_PHOTO_STACK_SETTLED,
                }}
              >
                {renderFaceContent(incomingFace)}
              </div>
            </div>

            {renderStackAddControl()}
          </div>
        </div>
      </div>

      {compact ? (
        <div
          className="relative mx-auto mt-4 h-6 w-[3.75rem]"
          role="tablist"
          aria-label="Photo slots"
        >
          {stackItems.map((item, i) => {
            const dot = deriveSlotDotPresentation(
              i,
              currentSlot,
              item.kind === "photo",
            );
            const dotLabel = quickSetupSlotAriaLabel(
              item,
              normalizedPhotos.length,
            );
            return (
              <button
                key={profilePhotoStackItemKey(item)}
                type="button"
                role="tab"
                aria-selected={dot.isCurrent}
                aria-label={dotLabel}
                onClick={() => setCycleIndex(i)}
                className="absolute top-0 flex h-5 w-5 items-center justify-center touch-manipulation"
                style={{
                  left: `${i * 20}px`,
                  transform: `translateY(${deriveNavigationDotOffsetY(i)}px)`,
                }}
              >
                <span
                  className={[
                    "transition-all duration-200",
                    slotDotClassName(dot),
                  ].join(" ")}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          (e.target as HTMLInputElement).value = "";
          if (files.length === 0) return;
          photoAddPipeline.acceptWebFiles(files);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          (e.target as HTMLInputElement).value = "";
          if (files.length === 0) return;
          photoAddPipeline.acceptWebFiles(files);
        }}
      />

      <MediaAcquisitionSheet
        variant="profilePhoto"
        open={photoAddPipeline.mediaChooserOpen}
        onClose={photoAddPipeline.closeMediaChooser}
        onTakePhoto={() => {
          if (isNativeApp()) {
            void photoAddPipeline.captureCamera();
            return;
          }
          openWebCameraPicker();
        }}
        onPhotoLibrary={() => {
          if (isNativeApp()) {
            void photoAddPipeline.chooseLibrary();
            return;
          }
          openWebGalleryPicker();
        }}
        busy={photoAddPipeline.mediaNativeBusy}
        portalClassName={acquisitionPortalClassName}
      />

      <AvatarCropModal
        open={photoAddPipeline.cropOpen}
        imageSrc={photoAddPipeline.cropImageSrc}
        mode="profilePhoto"
        onCancel={photoAddPipeline.cancelCrop}
        onConfirm={photoAddPipeline.confirmCrop}
      />
    </div>
  );
});

export default ProfilePhotoQuickSetup;
