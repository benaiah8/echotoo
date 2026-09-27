import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { PiPencilSimple } from "react-icons/pi";
import ProfilePhotoQuickSetup, {
  type ProfilePhotoQuickSetupHandle,
} from "./ProfilePhotoQuickSetup";
import FullScreenProfileCreation from "./FullScreenProfileCreation";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { preloadImages } from "../../lib/imageOptimization";
import { normalizeProfilePhotos } from "../../lib/profilePhotos";
import { getCachedProfile } from "../../lib/profileCache";
import {
  canCloseProfilePhotoPrompt,
  canFireProfilePhotoPromptContinue,
  deriveProfilePhotoPromptCta,
  deriveProfilePhotoPromptSentenceParts,
} from "../../lib/profilePhotoPromptOverlayPresentation";
import { markPairUpPhotoPromptBackHandled } from "../../lib/pairUpPhotoPromptStore";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";

/** Default root portal z-index (below Pair Up mount at social photoGate). */
const DEFAULT_OVERLAY_Z = "z-[120]";
const DEFAULT_ACQUISITION_PORTAL = "z-[135]";

export type ProfilePhotoPromptOverlayProps = {
  open: boolean;
  profileId: string;
  userId: string;
  photos: string[];
  title: string;
  description?: string;
  onPhotosChanged: (photos: string[]) => void;
  onContinue: () => void;
  onClose: () => void;
  continueLabel?: string;
  continueAnywayLabel?: string;
  /** Root portal z-index class (default z-[120]). Social gate uses SOCIAL_OVERLAY_LAYER.photoGate. */
  overlayClassName?: string;
  /** MediaAcquisitionSheet portal z-index (default z-[135]). */
  acquisitionPortalClassName?: string;
};

const prominentCtaClass =
  "flex min-h-[44px] items-center justify-center rounded-full px-7 py-1.5 " +
  "text-[13px] font-semibold transition " +
  "bg-white text-[#141414] shadow-[0_0_16px_color-mix(in_oklab,var(--brand)_28%,transparent)] " +
  "app-light:bg-[var(--brand-ink)] app-light:text-[var(--brand)] " +
  "hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 touch-manipulation";

const mediumCtaClass =
  "flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border)]/55 " +
  "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] px-6 py-1.5 text-[13px] font-medium " +
  "text-[var(--text)] shadow-[0_0_14px_color-mix(in_oklab,var(--brand)_24%,transparent)] transition " +
  "hover:bg-[var(--text)]/5 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 touch-manipulation";

const subtleCtaClass =
  "flex min-h-[44px] items-center justify-center rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--text)]/48 " +
  "underline-offset-2 transition hover:text-[var(--text)]/68 hover:underline " +
  "disabled:pointer-events-none disabled:opacity-40 touch-manipulation";

/**
 * Minimal floating photo encouragement — no outer card; backdrop + floating stack.
 */
export default function ProfilePhotoPromptOverlay({
  open,
  profileId,
  userId,
  photos,
  onPhotosChanged,
  onContinue,
  onClose,
  continueLabel,
  continueAnywayLabel,
  overlayClassName = DEFAULT_OVERLAY_Z,
  acquisitionPortalClassName = DEFAULT_ACQUISITION_PORTAL,
}: ProfilePhotoPromptOverlayProps) {
  const quickSetupRef = useRef<ProfilePhotoQuickSetupHandle>(null);
  const continueFiredRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  const onCloseRef = useRef(onClose);
  onContinueRef.current = onContinue;
  onCloseRef.current = onClose;

  const [localPhotos, setLocalPhotos] = useState(() =>
    normalizeProfilePhotos(photos),
  );
  const [busy, setBusy] = useState(false);
  /** Bumps after Edit Profile to remount QuickSetup with cache-synced photos. */
  const [sessionGeneration, setSessionGeneration] = useState(0);
  /** Suspend prompt UI while Edit Profile is open; pending store intent retained by parent. */
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  useOverlayBackgroundScrollLock(open && !editProfileOpen);

  useEffect(() => {
    if (!open) return;
    const urls = localPhotos
      .map((path) => avatarDisplayUrl(path))
      .filter((url): url is string => Boolean(url));
    if (urls.length > 0) {
      void preloadImages(urls);
    }
  }, [open, localPhotos]);

  const syncPhotosFromCache = useCallback(() => {
    const cached = getCachedProfile(profileId);
    if (!cached) return;
    const next = normalizeProfilePhotos(cached.profile_photos);
    setLocalPhotos(next);
    onPhotosChanged(next);
  }, [onPhotosChanged, profileId]);

  useEffect(() => {
    if (!editProfileOpen) return;
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id && detail.id !== profileId) return;
      syncPhotosFromCache();
    };
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, [editProfileOpen, profileId, syncPhotosFromCache]);

  const photoCount = localPhotos.length;
  const cta = useMemo(
    () =>
      deriveProfilePhotoPromptCta(photoCount, {
        continueLabel,
        continueAnywayLabel,
      }),
    [photoCount, continueLabel, continueAnywayLabel],
  );

  const sentenceParts = useMemo(
    () => deriveProfilePhotoPromptSentenceParts(photoCount),
    [photoCount],
  );

  const handlePhotosChanged = useCallback(
    (next: string[]) => {
      const normalized = normalizeProfilePhotos(next);
      setLocalPhotos(normalized);
      onPhotosChanged(normalized);
    },
    [onPhotosChanged],
  );

  const consumeNestedBack = useCallback((): boolean => {
    return quickSetupRef.current?.consumeBack() ?? false;
  }, []);

  const requestClose = useCallback(() => {
    if (!canCloseProfilePhotoPrompt(busy)) return;
    onCloseRef.current();
  }, [busy]);

  const handleContinue = useCallback(() => {
    if (!canFireProfilePhotoPromptContinue(busy) || continueFiredRef.current) {
      return;
    }
    continueFiredRef.current = true;
    onContinueRef.current();
    onCloseRef.current();
  }, [busy]);

  const handleBackPriority = useCallback(() => {
    if (editProfileOpen) return;
    if (consumeNestedBack()) {
      markPairUpPhotoPromptBackHandled();
      return;
    }
    if (!canCloseProfilePhotoPrompt(busy)) return;
    markPairUpPhotoPromptBackHandled();
    onCloseRef.current();
  }, [busy, consumeNestedBack, editProfileOpen]);

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      requestClose();
    },
    [requestClose],
  );

  const handleEditProfileClose = useCallback(() => {
    syncPhotosFromCache();
    setEditProfileOpen(false);
    setSessionGeneration((g) => g + 1);
  }, [syncPhotosFromCache]);

  useEffect(() => {
    if (!open || editProfileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      handleBackPriority();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editProfileOpen, handleBackPriority]);

  useEffect(() => {
    if (!open || editProfileOpen) return;
    return subscribeAndroidHardwareBack(handleBackPriority);
  }, [open, editProfileOpen, handleBackPriority]);

  if (typeof document === "undefined" || !open) return null;

  const continueDisabled = !canFireProfilePhotoPromptContinue(busy);
  const continueClass =
    cta.continueStyle === "primary"
      ? prominentCtaClass
      : cta.continueStyle === "medium"
        ? mediumCtaClass
        : subtleCtaClass;

  return createPortal(
    <>
      {!editProfileOpen ? (
        <div
          className={`fixed inset-0 ${overlayClassName} flex items-center justify-center px-4 py-6`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-photo-prompt-title"
          onClick={handleBackdropClick}
          style={{
            backgroundColor: "color-mix(in oklab, var(--bg) 12%, transparent)",
            backdropFilter: "blur(11px)",
            WebkitBackdropFilter: "blur(11px)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 app-dark:block app-light:hidden"
            aria-hidden
            style={{
              background: [
                "radial-gradient(ellipse 90% 72% at 50% 46%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 42%, transparent 78%)",
                "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.42) 36%, rgba(0,0,0,0.42) 64%, transparent 100%)",
              ].join(", "),
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 app-light:block app-dark:hidden"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 86% 66% at 50% 46%, color-mix(in oklab, var(--bg) 68%, var(--text) 14%) 0%, transparent 74%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              maskImage:
                "radial-gradient(ellipse 74% 60% at 50% 46%, black 20%, transparent 74%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 74% 60% at 50% 46%, black 20%, transparent 74%)",
            }}
          />
          <div className="relative z-10 flex w-full max-w-[min(320px,90vw)] flex-col items-center pointer-events-none">
            <p
              id="profile-photo-prompt-title"
              className="pointer-events-auto max-w-[18rem] text-center text-[14px] font-medium leading-snug text-[var(--text)]"
            >
              {sentenceParts.accent ? (
                <>
                  <span className="text-[var(--brand)]">
                    {sentenceParts.accent}
                  </span>
                  {sentenceParts.rest}
                </>
              ) : null}
            </p>

            <ProfilePhotoQuickSetup
              key={sessionGeneration}
              ref={quickSetupRef}
              profileId={profileId}
              userId={userId}
              photos={localPhotos}
              onPhotosChanged={handlePhotosChanged}
              onBusyChange={setBusy}
              acquisitionPortalClassName={acquisitionPortalClassName}
              compact
              className="pointer-events-auto mt-5 w-full"
            />

            <div className="pointer-events-auto mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                className={continueClass}
                disabled={continueDisabled}
                aria-label={cta.primaryLabel}
                onClick={handleContinue}
              >
                {cta.primaryLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditProfileOpen(true)}
                aria-label="Edit profile"
                className={[
                  "inline-flex min-h-[44px] items-center gap-1 rounded-full px-2.5 py-1.5",
                  "text-[11px] font-medium text-[var(--text)]/42",
                  "transition hover:text-[var(--text)]/68 active:scale-[0.98]",
                  "disabled:pointer-events-none disabled:opacity-40 touch-manipulation",
                ].join(" ")}
              >
                <PiPencilSimple className="h-3.5 w-3.5" aria-hidden />
                Edit profile
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editProfileOpen ? (
        <FullScreenProfileCreation
          open
          profileId={profileId}
          onClose={handleEditProfileClose}
          onComplete={handleEditProfileClose}
        />
      ) : null}
    </>,
    document.body,
  );
}
