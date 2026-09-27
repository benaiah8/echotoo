/**
 * Media source chooser — Library + Photo + Video (PASS B.1).
 * Flat Add media surface; no Camera submenu.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PiCamera, PiFilmStrip, PiImages, PiInfoFill, PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import {
  glassActionSheetIconWrapClass,
  glassActionSheetRoundedBlockClass,
  glassPeoplePanelClass,
} from "../../lib/glassActionSheetStyles";
import CreateVideoRequirementsInfo from "./CreateVideoRequirementsInfo";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Unified library picker (images + video). */
  onLibrary?: () => void;
  /** @deprecated Profile flow — maps to onLibrary */
  onPhotoLibrary?: () => void;
  /** Native take photo. */
  onTakePhoto?: () => void;
  /** Native record video. */
  onRecordVideo?: () => void;
  /** Legacy profile camera (photo only). */
  onCamera?: () => void;
  busy?: boolean;
  showCamera?: boolean;
  portalClassName?: string;
  /** Profile photo prompt — Take photo / Choose from gallery only. */
  variant?: "default" | "profilePhoto";
};

/** Hit ~40px; visual circle ~28px. */
const closeBtnClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text)]/70 transition hover:bg-[var(--text)]/8 active:scale-[0.96]";

const closeVisualClass =
  "flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[var(--border)]/60";

const mediaChooserTileClass = [
  glassActionSheetRoundedBlockClass,
  "min-h-[4.25rem] transition-[transform,background-color,box-shadow,border-color]",
  "hover:bg-[var(--glass-active-bg)] active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

/** Profile-photo chooser: compact bottom tiles (variant="profilePhoto" only). */
const PROFILE_PHOTO_SOURCE_TILE_STYLE = {
  width: "clamp(7rem, 29vw, 8.25rem)",
  height: "clamp(7.5rem, 32vw, 8.75rem)",
} as const;

const profilePhotoSourceTileClass = [
  "flex flex-col items-center justify-center gap-2 rounded-xl px-2 py-3",
  "border touch-manipulation transition active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-45",
  "app-dark:bg-[#c4beb4] app-dark:text-[#141414]",
  "app-dark:border-[color-mix(in_oklab,#141414_16%,transparent)]",
  "app-dark:shadow-[0_4px_14px_rgba(0,0,0,0.3)]",
  "app-light:bg-[color-mix(in_oklab,var(--text)_14%,var(--surface)_86%)]",
  "app-light:text-[var(--text)]",
  "app-light:border-[color-mix(in_oklab,var(--text)_16%,var(--border))]",
  "app-light:shadow-[0_3px_12px_rgba(0,0,0,0.14)]",
].join(" ");

const profilePhotoSourceIconClass = [
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
  "app-dark:bg-[#141414] app-dark:text-[#f5f0e8]",
  "app-dark:shadow-[0_2px_8px_rgba(0,0,0,0.32)]",
  "app-light:bg-[var(--brand-ink)] app-light:text-[var(--brand)]",
  "app-light:shadow-[0_2px_6px_rgba(0,0,0,0.22)]",
].join(" ");

const PROFILE_PHOTO_CHOOSER_BOTTOM =
  "calc(var(--safe-area-bottom-layout) + clamp(1.25rem, 5vw, 2rem))";

const profilePhotoChooserFrostClass = [
  "pointer-events-none absolute inset-0",
  "app-dark:bg-[rgba(0,0,0,0.36)]",
  "app-light:bg-[color-mix(in_oklab,var(--bg)_58%,white)]",
].join(" ");

const PROFILE_PHOTO_CHOOSER_FROST_STYLE = {
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
} as const;

const profilePhotoCancelClass = [
  "mb-3 min-h-[32px] px-2 text-[12px] font-medium text-[var(--text)]/48",
  "underline-offset-2 transition hover:text-[var(--text)]/68 hover:underline",
  "touch-manipulation active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
].join(" ");

export default function MediaAcquisitionSheet({
  open,
  onClose,
  onLibrary,
  onPhotoLibrary,
  onTakePhoto,
  onRecordVideo,
  onCamera,
  busy = false,
  showCamera = true,
  portalClassName,
  variant = "default",
}: Props) {
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const libraryHandler = onLibrary ?? onPhotoLibrary ?? (() => {});
  const cameraHandler = onTakePhoto ?? onCamera ?? (() => {});
  const hasSeparatePhotoVideo = Boolean(onTakePhoto && onRecordVideo);
  const legacyCameraOnly = Boolean(onCamera && !hasSeparatePhotoVideo);

  useEffect(() => {
    if (!open) setRequirementsOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || variant !== "profilePhoto") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, variant]);

  useOverlayBackgroundScrollLock(open && variant === "profilePhoto");

  if (variant === "profilePhoto") {
    if (typeof document === "undefined" || !open) return null;

    return createPortal(
      <div
        className={[
          "fixed inset-0 flex items-end justify-center px-4 pt-6 overscroll-none",
          portalClassName ?? "z-[145]",
        ].join(" ")}
        style={{ paddingBottom: PROFILE_PHOTO_CHOOSER_BOTTOM }}
        role="dialog"
        aria-modal="true"
        aria-label="Choose photo source"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={profilePhotoChooserFrostClass}
          style={PROFILE_PHOTO_CHOOSER_FROST_STYLE}
          aria-hidden
        />
        <div className="relative z-10 flex w-full max-w-[19.5rem] flex-col items-center">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Cancel"
            className={profilePhotoCancelClass}
          >
            Cancel
          </button>
          <div className="flex w-full items-stretch justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                cameraHandler();
              }}
              aria-label="Take photo"
              className={profilePhotoSourceTileClass}
              style={PROFILE_PHOTO_SOURCE_TILE_STYLE}
            >
              <span className={profilePhotoSourceIconClass} aria-hidden>
                <PiCamera className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight">
                Take photo
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                libraryHandler();
              }}
              aria-label="Choose from gallery"
              className={profilePhotoSourceTileClass}
              style={PROFILE_PHOTO_SOURCE_TILE_STYLE}
            >
              <span className={profilePhotoSourceIconClass} aria-hidden>
                <PiImages className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight">
                Choose from
                <br />
                gallery
              </span>
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <BottomDrawer
        open={open}
        onClose={onClose}
        transparentSheet
        backdropVariant="strong"
        shrinkSheetToContent
        showCloseButton={false}
        maxHeight="min(48vh, 360px)"
        portalClassName={portalClassName}
        contentClassName="px-4 pt-1"
      >
        <div
          className={`${glassPeoplePanelClass} mx-auto flex w-full max-w-lg flex-col`}
          data-add-media-sheet
          role="dialog"
          aria-modal="true"
          aria-label="Add media"
        >
          <div className="flex shrink-0 items-center gap-1.5 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <p
                className="truncate text-[14px] font-semibold tracking-tight text-[var(--text)]"
                data-add-media-title
              >
                Add media
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRequirementsOpen(true)}
                aria-label="Video requirements"
                data-video-requirements-info
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-[0.96] disabled:opacity-40"
              >
                <PiInfoFill
                  className="h-[18px] w-[18px] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] app-light:text-[var(--brand-ink)] app-light:drop-shadow-none"
                  aria-hidden
                />
              </button>
            </div>
            <button
              type="button"
              className={closeBtnClass}
              aria-label="Close"
              data-add-media-close
              onClick={onClose}
            >
              <span className={closeVisualClass} aria-hidden>
                <PiX className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>

          <div
            className="flex min-w-0 items-stretch gap-2 px-3 pb-3"
            data-add-media-actions
          >
            <button
              type="button"
              disabled={busy}
              onClick={libraryHandler}
              aria-label="Choose from library"
              data-media-source="library"
              className={`${mediaChooserTileClass} flex min-w-0 flex-[2] items-center gap-2.5 px-3 py-2.5 text-left`}
            >
              <span
                className={`${glassActionSheetIconWrapClass} h-9 w-9 shrink-0`}
                aria-hidden
              >
                <PiImages className="h-[18px] w-[18px]" strokeWidth={1.35} />
              </span>
              <span className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold leading-tight text-[var(--text)]">
                  Library
                </span>
                <span className="truncate text-[10px] font-medium leading-snug text-[var(--text)]/52 app-dark:text-white/48">
                  Photos or video
                </span>
              </span>
            </button>

            {showCamera && hasSeparatePhotoVideo ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTakePhoto?.()}
                  aria-label="Photo"
                  data-media-source="photo"
                  className={`${mediaChooserTileClass} flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-center`}
                >
                  <span
                    className={`${glassActionSheetIconWrapClass} h-9 w-9 shrink-0`}
                    aria-hidden
                  >
                    <PiCamera className="h-[18px] w-[18px]" strokeWidth={1.35} />
                  </span>
                  <span className="text-[10px] font-semibold leading-none text-[var(--text)]">
                    Photo
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRecordVideo?.()}
                  aria-label="Video"
                  data-media-source="video"
                  className={`${mediaChooserTileClass} flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-center`}
                >
                  <span
                    className={`${glassActionSheetIconWrapClass} h-9 w-9 shrink-0`}
                    aria-hidden
                  >
                    <PiFilmStrip className="h-[18px] w-[18px]" strokeWidth={1.35} />
                  </span>
                  <span className="text-[10px] font-semibold leading-none text-[var(--text)]">
                    Video
                  </span>
                </button>
              </>
            ) : null}

            {showCamera && legacyCameraOnly ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onCamera?.()}
                aria-label="Camera"
                data-media-source="camera"
                className={`${mediaChooserTileClass} flex min-w-[4.75rem] max-w-[32%] flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-center`}
              >
                <span
                  className={`${glassActionSheetIconWrapClass} h-10 w-10 shrink-0`}
                  aria-hidden
                >
                  <PiCamera className="h-[22px] w-[22px]" strokeWidth={1.35} />
                </span>
                <span className="text-[11px] font-semibold leading-none text-[var(--text)]">
                  Camera
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </BottomDrawer>
      <CreateVideoRequirementsInfo
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
      />
    </>
  );
}
