import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabaseClient";
import ConfirmDialog from "../ui/ConfirmDialog";
import { deleteAccount } from "../../api/services/account";
import { deleteMyPushDevices } from "../../api/services/pushDevices";
import { clearAuthCache } from "../../api/services/follows";
import { setP2pDiscoverEnabled } from "../../api/services/pairUp";
import { clearCachedProfile } from "../../lib/profileCache";
import { clearCachedFollowCounts } from "../../lib/followCountsCache";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  AVATAR_PRESET_PREFIX,
  getAvatarPresets,
  isAvatarPresetValue,
} from "../../lib/avatarPresets";
import { getSupportMailto } from "../../lib/supportConfig";
import {
  deleteProfilePhotoIfSafe,
  deleteUncommittedProfilePhotoUpload,
  uploadPreparedProfilePhoto,
} from "../../api/services/mediaUpload";
import { preparedProfilePhotoFromExport } from "../../lib/prepareImageForUpload";
import {
  normalizeEchoPreset,
  uniqueOrderedProfilePhotos,
} from "../../lib/profilePhotos";
import { deterministicEchoPresetForIdentity } from "../../lib/echoPresetAssignment";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import AvatarCropModal from "./AvatarCropModal";
import AvatarPreviewLightbox, {
  AvatarPreviewLightboxAction,
} from "./AvatarPreviewLightbox";
import ProfilePhotosMediaManager from "./ProfilePhotosMediaManager";
import MediaAcquisitionSheet from "../create/MediaAcquisitionSheet";
import { isPlaceholderUsername } from "../../lib/profileUsername";
import { assertPlainTextAllowedForUgc } from "../../lib/ugcTextPolicy";
import HangoutNotificationExplainerModal from "../ui/HangoutNotificationExplainerModal";
import EchoPresetPickerOverlay from "./EchoPresetPickerOverlay";
import EchoVisualSelector from "./EchoVisualSelector";
import { getNativePushReceiveState } from "../../lib/explicitNativePushRegistration";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  editProfileFieldBlockClass,
  editProfileFieldFillClass,
  editProfileFieldPillClass,
  editProfileIdentityZoneClass,
  editProfileShellAtmosphereClass,
} from "../../lib/glassActionSheetStyles";
import {
  captureImageFromCamera,
  isCameraUserCancellation,
  pickImagesFromLibrary,
} from "../../lib/mediaAcquisition";
import { mapMediaUploadError } from "../../lib/mapMediaUploadError";
import { useProfilePhotoAddPipeline } from "../../hooks/useProfilePhotoAddPipeline";
import {
  IDENTITY_PROFILE_SELECT,
  publishProfileIdentityToCaches,
  type ProfileIdentityRow,
  updateProfilePhotosInDb as persistProfilePhotosInDb,
} from "../../lib/publishProfileIdentityRow";
import { normalizeSocialUrl } from "../../lib/socialLinks";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import { PiArrowsClockwise, PiCalendarBlank, PiCaretDown, PiPencilSimple, PiUser } from "react-icons/pi";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import ProfileDobWheel from "./ProfileDobWheel";
import {
  dobPartsToYmd,
  getDobPickerBounds,
  ymdToDobParts,
  type DobParts,
} from "../../lib/profileDob";
import {
  getMyProfilePrivate,
  saveMyProfilePrivate,
  type ProfileGender,
} from "../../api/services/profilePrivate";
import {
  applyAboutYouEditCancel,
  deriveAboutYouVisualState,
  formatBirthdayDisplay,
  formatDobDisplay,
  formatGenderDisplay,
  isAboutYouBirthdayMissing,
  isAboutYouGenderMissing,
  shouldConfirmAboutYouEdit,
  type AboutYouSnapshot,
} from "../../lib/profileAboutYouPresentation";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";
import { shouldApplyHydratedProfilePhotos } from "../../lib/editProfilePhotoHydration";

/** Above social sheets + photo gate; below ConfirmDialog (200) / AvatarCrop (205). */
const EDITOR_OVERLAY_Z = SOCIAL_OVERLAY_LAYER.editProfile;

const DISPLAY_NAME_MAX = 40;
const USERNAME_MAX = 24;
const BIO_MAX = 160;
const SOCIAL_URL_MAX = 300;

const GENDER_OPTIONS: { value: ProfileGender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function aboutYouFieldCardSurfaceClass(incomplete: boolean): string {
  if (!incomplete) return editProfileFieldFillClass;
  return [
    editProfileFieldFillClass,
    "border-[color-mix(in_oklab,orange_50%,var(--bottom-tab-border))]",
    "bg-[color-mix(in_oklab,orange_13%,var(--surface-2)_58%,transparent)]",
    "app-light:bg-[color-mix(in_oklab,orange_11%,var(--surface-2)_76%,var(--surface))]",
    "app-dark:bg-[color-mix(in_oklab,orange_18%,var(--surface-2)_52%,transparent)]",
  ].join(" ");
}

function aboutYouFieldIconClass(incomplete: boolean): string {
  return incomplete
    ? "h-[18px] w-[18px] shrink-0 text-[color-mix(in_oklab,orange_88%,var(--text))]"
    : "h-[18px] w-[18px] shrink-0 text-[var(--text)]/52";
}

function aboutYouFieldValueClass(incomplete: boolean, wrap = false): string {
  return [
    "mt-0.5 max-w-full text-center font-medium leading-snug",
    wrap ? "text-[11px] text-balance break-words px-0.5" : "text-[12px] truncate",
    incomplete
      ? "font-semibold text-[color-mix(in_oklab,orange_90%,var(--text))]"
      : "text-[var(--text)]",
  ].join(" ");
}

/** In-field counter: bottom-right inside the control, muted so typed text shows through. */
function FieldCharCount({
  current,
  max,
  insetClassName = "bottom-2 right-2.5",
}: {
  current: number;
  max: number;
  /** Override position (e.g. textarea needs a bit more lift from the bottom edge). */
  insetClassName?: string;
}) {
  return (
    <span
      className={[
        "pointer-events-none absolute z-[1] text-[10px] tabular-nums text-[var(--text)]/40 opacity-80",
        insetClassName,
      ].join(" ")}
      aria-live="polite"
    >
      {current} / {max}
    </span>
  );
}

/** Owl presets bundled at build time; empty picker hidden when length is 0. */
const ECHO_AVATAR_PRESETS = getAvatarPresets();

const PROFILE_PHOTO_OP_LOG = "[ProfilePhotoOp]";

function profileEditorNotifNudgeStorageKey(userId: string): string {
  return `echotoo_profile_editor_notif_nudge_dismissed_${userId}`;
}

function isEditorNotifNudgeDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(profileEditorNotifNudgeStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  profileId: string;
  isFirstTime?: boolean;
  onComplete?: () => void;
  initialProfileData?: {
    display_name: string | null;
    username: string | null;
    bio: string | null;
    avatar_url: string | null;
    profile_photos?: string[];
    echo_preset?: string | null;
    instagram_url: string | null;
    tiktok_url: string | null;
    telegram_url: string | null;
    member_no: number | null;
    is_private?: boolean | null;
    social_media_public?: boolean | null;
    p2p_discover_enabled?: boolean | null;
  };
  /** When opening from profile menu "Delete account", scroll danger zone into view (non–first-time edit only). */
  focusDeleteAccountOnMount?: boolean;
  onFocusDeleteAccountHandled?: () => void;
  /** Optional: scroll a section into view after open (completion checklist / deep link). */
  initialFocusSection?: "bio" | "social" | null;
  onInitialFocusSectionHandled?: () => void;
};

export default function FullScreenProfileCreation({
  open,
  onClose,
  profileId,
  isFirstTime = false,
  onComplete,
  initialProfileData,
  focusDeleteAccountOnMount = false,
  onFocusDeleteAccountHandled,
  initialFocusSection = null,
  onInitialFocusSectionHandled,
}: Props) {
  const navigate = useNavigate();
  const authState = useSelector((state: RootState) => state.auth);
  const user = authState?.user;
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [origUsername, setOrigUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ordered real Profile photos (max 3). Persisted immediately on change. */
  const [profilePhotos, setProfilePhotos] = useState<string[]>([]);
  /** Independent Echo companion (`preset:owl_NN`). Persisted immediately. */
  const [echoPreset, setEchoPreset] = useState<string | null>(null);
  /** DB-managed compatibility face — updated from update().select(). */
  const [compatAvatarUrl, setCompatAvatarUrl] = useState<string | null>(null);
  /** Create flow: survives duplicate empty hydrate fetches so Echo bootstrap persists. Reset when modal closes. */
  const echoBootstrapRef = useRef<{ done: boolean; value: string | null }>({
    done: false,
    value: null,
  });
  /** Shown once when create flow assigns a deterministic Echo (empty Echo + presets). */
  const [echoPickedNote, setEchoPickedNote] = useState(false);
  const [showNotifSetupCard, setShowNotifSetupCard] = useState(false);
  const [notifExplainerOpen, setNotifExplainerOpen] = useState(false);
  const [photoOpBusy, setPhotoOpBusy] = useState(false);
  const photoOpBusyRef = useRef(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [socialMediaPublic, setSocialMediaPublic] = useState(false);
  /** Discover preference — saved immediately via RPC (not deferred to Save). Default ON. */
  const [p2pDiscoverEnabled, setP2pDiscoverEnabledState] = useState(true);
  const [discoverPrefSaving, setDiscoverPrefSaving] = useState(false);
  /** Privacy block: collapsed whenever the full-screen editor opens (not persisted). */
  const [privacyAccordionOpen, setPrivacyAccordionOpen] = useState(false);
  /** Owner-only private metadata — editor-local; never on public Profile. */
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [gender, setGender] = useState<ProfileGender | null>(null);
  const [initialDateOfBirth, setInitialDateOfBirth] = useState<string | null>(
    null,
  );
  const [initialGender, setInitialGender] = useState<ProfileGender | null>(
    null,
  );
  const [privateProfileLoaded, setPrivateProfileLoaded] = useState(false);
  const [privateProfileLoadError, setPrivateProfileLoadError] = useState(false);
  const [privateProfileLoading, setPrivateProfileLoading] = useState(false);
  const [dobExpanded, setDobExpanded] = useState(false);
  /** About You explicit edit — default read-only summary until Add/Edit. */
  const [aboutYouEditMode, setAboutYouEditMode] = useState(false);
  const [showAboutYouEditConfirm, setShowAboutYouEditConfirm] = useState(false);
  /** Temporary DOB wheel state — committed only on Done. */
  const [dobPickerParts, setDobPickerParts] = useState<DobParts>(() => {
    const { minDate, maxDate } = getDobPickerBounds();
    return ymdToDobParts(null, minDate, maxDate);
  });
  const privateDobTouchedRef = useRef(false);
  const privateGenderTouchedRef = useRef(false);
  const aboutYouEditBaselineRef = useRef<AboutYouSnapshot | null>(null);
  const showAboutYouEditConfirmRef = useRef(false);
  const dobExpandedRef = useRef(false);
  const photoPreviewIndexRef = useRef<number | null>(null);
  const avatarCropOpenRef = useRef(false);
  const showDeleteConfirmRef = useRef(false);
  const showSaveConfirmRef = useRef(false);
  const showExitConfirmRef = useRef(false);
  const notifExplainerOpenRef = useRef(false);
  const mediaChooserOpenRef = useRef(false);
  const isDeletingRef = useRef(false);
  const savingRef = useRef(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  /** Replace-photo slot index when replace acquisition is active (null = none). */
  const replacePhotoIndexRef = useRef<number | null>(null);
  /** Full-screen preview index into `profilePhotos` (null = closed). */
  const [photoPreviewIndex, setPhotoPreviewIndex] = useState<number | null>(
    null,
  );
  /** Full-screen Echo picker (z-[140]); staged until Done. */
  const [echoLargePickerOpen, setEchoLargePickerOpen] = useState(false);
  const echoLargePickerOpenRef = useRef(false);
  /** Staged initial Echo when opening picker from a strip/center tap. */
  const [echoPickerInitialValue, setEchoPickerInitialValue] = useState<
    string | null
  >(null);
  const avatarCropObjectUrlRef = useRef<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [replaceMediaChooserOpen, setReplaceMediaChooserOpen] = useState(false);
  const [replaceMediaNativeBusy, setReplaceMediaNativeBusy] = useState(false);
  const deleteDangerZoneRef = useRef<HTMLDivElement>(null);
  const bioSectionRef = useRef<HTMLDivElement>(null);
  const socialSectionRef = useRef<HTMLDivElement>(null);
  /** After user types in the username field, display-name sync must not overwrite (create flow only). */
  const usernameTouchedByUserRef = useRef(false);
  const profilePhotosRef = useRef<string[]>([]);
  profilePhotosRef.current = profilePhotos;
  const echoPresetRef = useRef<string | null>(null);
  echoPresetRef.current = echoPreset;
  /** Bumps on local photo mutations so a stale open-fetch cannot clobber newer photos. */
  const photoMutationGenerationRef = useRef(0);

  const bumpPhotoMutationGeneration = useCallback(() => {
    photoMutationGenerationRef.current += 1;
  }, []);

  const applyIdentityRowToEditor = useCallback(
    (row: ProfileIdentityRow) => {
      const photos = uniqueOrderedProfilePhotos(row.profile_photos);
      const echo = normalizeEchoPreset(row.echo_preset);
      const avatar = row.avatar_url ?? null;
      bumpPhotoMutationGeneration();
      setProfilePhotos(photos);
      setEchoPreset(echo);
      setCompatAvatarUrl(avatar);
    },
    [bumpPhotoMutationGeneration],
  );
  const beginPhotoOp = useCallback(() => {
    if (photoOpBusyRef.current) return false;
    photoOpBusyRef.current = true;
    setPhotoOpBusy(true);
    return true;
  }, []);

  const endPhotoOp = useCallback(() => {
    photoOpBusyRef.current = false;
    setPhotoOpBusy(false);
  }, []);

  const photoAddPipeline = useProfilePhotoAddPipeline({
    profileId,
    userId: user?.id ?? null,
    photos: profilePhotos,
    onIdentityPublished: applyIdentityRowToEditor,
    onError: setError,
    beginPhotoOp,
    endPhotoOp,
    isPhotoOpBusy: () => photoOpBusyRef.current,
  });

  const photoAddPipelineRef = useRef(photoAddPipeline);
  photoAddPipelineRef.current = photoAddPipeline;
  const photoAddCropOpenRef = useRef(false);

  useOverlayBackgroundScrollLock(open);

  /**
   * Close replace crop UI and revoke the object URL.
   */
  const closeReplaceCropUi = useCallback(() => {
    const u = avatarCropObjectUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      avatarCropObjectUrlRef.current = null;
    }
    setAvatarCropSrc(null);
    setAvatarCropOpen(false);
  }, []);

  const resetReplacePhotoSession = useCallback(() => {
    closeReplaceCropUi();
    replacePhotoIndexRef.current = null;
  }, [closeReplaceCropUi]);

  const openReplaceCropForFile = useCallback(
    (file: File) => {
      closeReplaceCropUi();
      const url = URL.createObjectURL(file);
      avatarCropObjectUrlRef.current = url;
      setAvatarCropSrc(url);
      setAvatarCropOpen(true);
    },
    [closeReplaceCropUi],
  );

  const publishIdentityRow = useCallback(
    async (row: ProfileIdentityRow) => {
      await publishProfileIdentityToCaches(row);
      applyIdentityRowToEditor(row);
    },
    [applyIdentityRowToEditor],
  );

  const updateProfilePhotosInDb = useCallback(
    async (nextPhotos: string[]) => {
      const data = await persistProfilePhotosInDb(profileId, nextPhotos);
      applyIdentityRowToEditor(data);
      return data;
    },
    [profileId, applyIdentityRowToEditor],
  );

  const updateEchoPresetInDb = useCallback(
    async (nextEcho: string | null) => {
      const echo = normalizeEchoPreset(nextEcho);
      const { data, error: upErr } = await supabase
        .from("profiles")
        .update({ echo_preset: echo })
        .eq("id", profileId)
        .select(IDENTITY_PROFILE_SELECT)
        .maybeSingle();
      if (upErr) throw upErr;
      if (!data) throw new Error("Profile update returned no row.");
      await publishIdentityRow(data as ProfileIdentityRow);
      return data;
    },
    [profileId, publishIdentityRow],
  );

  useEffect(() => {
    if (!open) {
      photoAddPipelineRef.current.reset();
      resetReplacePhotoSession();
      setPhotoPreviewIndex(null);
      setEchoLargePickerOpen(false);
    }
  }, [open, resetReplacePhotoSession]);

  useEffect(() => {
    echoLargePickerOpenRef.current = echoLargePickerOpen;
  }, [echoLargePickerOpen]);

  useEffect(() => {
    if (open) {
      usernameTouchedByUserRef.current = false;
      setPrivacyAccordionOpen(false);
    }
  }, [open]);

  /** Load owner-only private metadata once per editor open. Does not create a row. */
  useEffect(() => {
    if (!open) {
      setDateOfBirth(null);
      setGender(null);
      setInitialDateOfBirth(null);
      setInitialGender(null);
      setPrivateProfileLoaded(false);
      setPrivateProfileLoadError(false);
      setPrivateProfileLoading(false);
      setDobExpanded(false);
      setAboutYouEditMode(false);
      setShowAboutYouEditConfirm(false);
      showAboutYouEditConfirmRef.current = false;
      aboutYouEditBaselineRef.current = null;
      privateDobTouchedRef.current = false;
      privateGenderTouchedRef.current = false;
      return;
    }

    let cancelled = false;
    privateDobTouchedRef.current = false;
    privateGenderTouchedRef.current = false;
    setPrivateProfileLoaded(false);
    setPrivateProfileLoadError(false);
    setPrivateProfileLoading(true);
    setDateOfBirth(null);
    setGender(null);
    setInitialDateOfBirth(null);
    setInitialGender(null);

    void (async () => {
      try {
        const row = await getMyProfilePrivate();
        if (cancelled) return;
        const dob = row?.date_of_birth ?? null;
        const g = row?.gender ?? null;
        setInitialDateOfBirth(dob);
        setInitialGender(g);
        if (!privateDobTouchedRef.current) setDateOfBirth(dob);
        if (!privateGenderTouchedRef.current) setGender(g);
        setPrivateProfileLoaded(true);
        setPrivateProfileLoadError(false);
      } catch (e) {
        if (cancelled) return;
        console.warn(
          "[FullScreenProfileCreation] private profile load failed",
          e,
        );
        setPrivateProfileLoaded(false);
        setPrivateProfileLoadError(true);
        toast.error("Couldn't load date of birth / gender");
      } finally {
        if (!cancelled) setPrivateProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    showAboutYouEditConfirmRef.current = showAboutYouEditConfirm;
  }, [showAboutYouEditConfirm]);

  useEffect(() => {
    dobExpandedRef.current = dobExpanded;
  }, [dobExpanded]);

  useEffect(() => {
    photoPreviewIndexRef.current = photoPreviewIndex;
  }, [photoPreviewIndex]);

  useEffect(() => {
    photoAddCropOpenRef.current = photoAddPipeline.cropOpen;
  }, [photoAddPipeline.cropOpen]);

  useEffect(() => {
    avatarCropOpenRef.current = avatarCropOpen;
  }, [avatarCropOpen]);

  useEffect(() => {
    showDeleteConfirmRef.current = showDeleteConfirm;
  }, [showDeleteConfirm]);

  useEffect(() => {
    showSaveConfirmRef.current = showSaveConfirm;
  }, [showSaveConfirm]);

  useEffect(() => {
    showExitConfirmRef.current = showExitConfirm;
  }, [showExitConfirm]);

  useEffect(() => {
    notifExplainerOpenRef.current = notifExplainerOpen;
  }, [notifExplainerOpen]);

  useEffect(() => {
    mediaChooserOpenRef.current =
      photoAddPipeline.mediaChooserOpen || replaceMediaChooserOpen;
  }, [photoAddPipeline.mediaChooserOpen, replaceMediaChooserOpen]);

  useEffect(() => {
    isDeletingRef.current = isDeleting;
  }, [isDeleting]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) {
      echoBootstrapRef.current = { done: false, value: null };
      setEchoPickedNote(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user?.id || !isNativeApp()) {
      setShowNotifSetupCard(false);
      return;
    }
    if (isEditorNotifNudgeDismissed(user.id)) {
      setShowNotifSetupCard(false);
      return;
    }
    let cancelled = false;
    void getNativePushReceiveState().then(({ ui }) => {
      if (!cancelled) setShowNotifSetupCard(ui !== "granted");
    });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  const dismissNotifSetupCard = useCallback(() => {
    if (user?.id) {
      try {
        localStorage.setItem(profileEditorNotifNudgeStorageKey(user.id), "1");
      } catch {
        /* ignore */
      }
    }
    setShowNotifSetupCard(false);
  }, [user?.id]);

  useEffect(() => {
    if (!open || !focusDeleteAccountOnMount) return;
    if (isFirstTime) {
      onFocusDeleteAccountHandled?.();
      return;
    }
    const t = window.setTimeout(() => {
      deleteDangerZoneRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      onFocusDeleteAccountHandled?.();
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, focusDeleteAccountOnMount, isFirstTime, onFocusDeleteAccountHandled]);

  /** Completion checklist / deep link: scroll Bio or Social into view (no forced keyboard). */
  useEffect(() => {
    if (!open || !initialFocusSection) return;
    if (focusDeleteAccountOnMount) {
      onInitialFocusSectionHandled?.();
      return;
    }
    const target =
      initialFocusSection === "bio"
        ? bioSectionRef.current
        : socialSectionRef.current;
    const t = window.setTimeout(() => {
      target?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      onInitialFocusSectionHandled?.();
    }, 220);
    return () => window.clearTimeout(t);
  }, [
    open,
    initialFocusSection,
    focusDeleteAccountOnMount,
    onInitialFocusSectionHandled,
  ]);

  /** Feed selected/captured Files into the replace-photo crop → upload pipeline. */
  const beginReplaceFilesForCrop = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (replacePhotoIndexRef.current == null) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", {
          reason: "no_replace_session",
        });
        setError("Couldn't replace this photo. Please try again.");
        return;
      }

      const imageFiles = files.filter(
        (f) => f.type.startsWith("image/") || !f.type,
      );
      if (imageFiles.length === 0) {
        setError("Please choose an image file.");
        return;
      }

      setError(null);
      openReplaceCropForFile(imageFiles[0]!);
    },
    [openReplaceCropForFile],
  );

  const openAddPhotosPicker = useCallback(() => {
    if (photoOpBusyRef.current || photoAddPipelineRef.current.busy) {
      console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", { reason: "busy" });
      setError("Another photo update is in progress. Please wait.");
      return;
    }
    const opened = photoAddPipelineRef.current.openAddPhotos();
    if (opened && !isNativeApp()) {
      avatarFileInputRef.current?.click();
    }
  }, []);

  const openReplacePhotoPicker = useCallback((index: number) => {
    if (photoOpBusyRef.current || photoAddPipelineRef.current.busy) {
      console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", { reason: "busy" });
      setError("Another photo update is in progress. Please wait.");
      return;
    }
    if (index < 0 || index >= profilePhotosRef.current.length) return;
    replacePhotoIndexRef.current = index;
    if (isNativeApp()) {
      setReplaceMediaChooserOpen(true);
      return;
    }
    avatarFileInputRef.current?.click();
  }, []);

  const handleReplacePhotoLibrary = useCallback(async () => {
    setReplaceMediaChooserOpen(false);
    if (replacePhotoIndexRef.current == null) return;

    setReplaceMediaNativeBusy(true);
    try {
      const { files, selectedCount, failedCount } = await pickImagesFromLibrary({
        maxCount: 1,
      });
      if (selectedCount > 0 && files.length === 0) {
        toast.error("Couldn't read the selected photos.");
        return;
      }
      if (failedCount > 0 && files.length > 0) {
        toast.error("Couldn't read 1 selected photo.");
      }
      if (files.length) {
        beginReplaceFilesForCrop(files);
      } else if (selectedCount <= 0) {
        resetReplacePhotoSession();
      }
    } catch (error) {
      if (!isCameraUserCancellation(error)) {
        console.error(
          "[FullScreenProfileCreation] gallery pick failed",
          error,
        );
        toast.error("Couldn't open your photo library. Please try again.");
      }
      resetReplacePhotoSession();
    } finally {
      setReplaceMediaNativeBusy(false);
    }
  }, [beginReplaceFilesForCrop, resetReplacePhotoSession]);

  const handleReplacePhotoCamera = useCallback(async () => {
    setReplaceMediaChooserOpen(false);
    if (replacePhotoIndexRef.current == null) return;

    setReplaceMediaNativeBusy(true);
    try {
      const { file, readFailed } = await captureImageFromCamera();
      if (readFailed) {
        toast.error("Couldn't read the captured photo.");
        resetReplacePhotoSession();
        return;
      }
      if (file) {
        beginReplaceFilesForCrop([file]);
      } else {
        resetReplacePhotoSession();
      }
    } catch (error) {
      if (!isCameraUserCancellation(error)) {
        console.error(
          "[FullScreenProfileCreation] camera capture failed",
          error,
        );
        toast.error("Couldn't open the camera. Please try again.");
      }
      resetReplacePhotoSession();
    } finally {
      setReplaceMediaNativeBusy(false);
    }
  }, [beginReplaceFilesForCrop, resetReplacePhotoSession]);

  const handleReplaceCropCancel = useCallback(() => {
    resetReplacePhotoSession();
  }, [resetReplacePhotoSession]);

  const handleReplaceCropCancelRef = useRef(handleReplaceCropCancel);
  handleReplaceCropCancelRef.current = handleReplaceCropCancel;

  const handleReplaceCropConfirm = useCallback(
    async (croppedFile: File) => {
      const replaceIndex = replacePhotoIndexRef.current;
      if (replaceIndex == null) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", {
          reason: "no_replace_intent",
        });
        setError("Couldn't replace this photo. Please try again.");
        resetReplacePhotoSession();
        return;
      }

      if (!beginPhotoOp()) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", { reason: "busy" });
        setError("Another photo update is in progress. Please wait.");
        return;
      }

      closeReplaceCropUi();
      replacePhotoIndexRef.current = null;

      setError(null);
      let uploadedPath: string | null = null;
      let authUserId: string | null = null;

      try {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        if (!authSession?.user?.id) {
          throw new Error("User not authenticated");
        }
        authUserId = authSession.user.id;

        const prepared = preparedProfilePhotoFromExport(croppedFile);
        uploadedPath = await uploadPreparedProfilePhoto(prepared, {
          userId: authUserId,
        });

        const current = profilePhotosRef.current;
        const idx = replaceIndex;
        if (idx < 0 || idx >= current.length) {
          throw new Error("That photo slot is no longer available.");
        }
        const removedOld = current[idx] ?? null;
        const next = [...current];
        next[idx] = uploadedPath;
        const uniqueNext = uniqueOrderedProfilePhotos(next);

        // Guard open-fetch hydration once the photo array is about to change.
        bumpPhotoMutationGeneration();

        try {
          await updateProfilePhotosInDb(uniqueNext);
        } catch (dbErr) {
          if (uploadedPath && authUserId) {
            const cleanup = await deleteUncommittedProfilePhotoUpload({
              userId: authUserId,
              uploadedPath,
            });
            if (!cleanup.deleted && !cleanup.skipped) {
              console.warn(
                PROFILE_PHOTO_OP_LOG,
                "uncommitted_cleanup_failed",
                cleanup,
              );
            }
          }
          throw dbErr;
        }

        if (removedOld) {
          const cleanup = await deleteProfilePhotoIfSafe({
            userId: authUserId,
            removedPhoto: removedOld,
            remainingPhotos: uniqueNext,
          });
          if (!cleanup.deleted && !cleanup.skipped) {
            console.warn(
              PROFILE_PHOTO_OP_LOG,
              "old_photo_cleanup_failed",
              cleanup,
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(PROFILE_PHOTO_OP_LOG, "failed", { message: msg });
        setError(mapMediaUploadError(err, "avatar"));
      } finally {
        endPhotoOp();
      }
    },
    [
      beginPhotoOp,
      bumpPhotoMutationGeneration,
      closeReplaceCropUi,
      endPhotoOp,
      resetReplacePhotoSession,
      updateProfilePhotosInDb,
    ],
  );

  const handleRemovePhoto = useCallback(
    async (index: number) => {
      if (!beginPhotoOp()) return;
      setError(null);
      const current = profilePhotosRef.current;
      if (index < 0 || index >= current.length) {
        endPhotoOp();
        return;
      }
      const removed = current[index]!;
      const next = uniqueOrderedProfilePhotos(
        current.filter((_, i) => i !== index),
      );

      // Guard open-fetch hydration before any await (local mutation in flight).
      bumpPhotoMutationGeneration();

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) throw new Error("User not authenticated");

        await updateProfilePhotosInDb(next);
        setPhotoPreviewIndex((prev) => {
          if (prev == null) return null;
          if (prev === index) return null;
          if (prev > index) return prev - 1;
          return prev;
        });
        const cleanup = await deleteProfilePhotoIfSafe({
          userId,
          removedPhoto: removed,
          remainingPhotos: next,
        });
        if (!cleanup.deleted && !cleanup.skipped) {
          console.warn(PROFILE_PHOTO_OP_LOG, "remove_cleanup_failed", cleanup);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Could not remove photo.";
        setError(msg);
      } finally {
        endPhotoOp();
      }
    },
    [
      beginPhotoOp,
      bumpPhotoMutationGeneration,
      endPhotoOp,
      updateProfilePhotosInDb,
    ],
  );

  const handleReorderPhotos = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (!beginPhotoOp()) return;
      setError(null);
      const previous = [...profilePhotosRef.current];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= previous.length ||
        toIndex >= previous.length
      ) {
        endPhotoOp();
        return;
      }
      const current = [...previous];
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved!);
      const next = uniqueOrderedProfilePhotos(current);

      // Optimistic parent order so props match the manager's dropped layout.
      bumpPhotoMutationGeneration();
      setProfilePhotos(next);
      profilePhotosRef.current = next;

      try {
        await updateProfilePhotosInDb(next);
      } catch (err: unknown) {
        setProfilePhotos(previous);
        profilePhotosRef.current = previous;
        const msg =
          err instanceof Error ? err.message : "Could not reorder photos.";
        setError(msg);
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        endPhotoOp();
      }
    },
    [
      beginPhotoOp,
      bumpPhotoMutationGeneration,
      endPhotoOp,
      updateProfilePhotosInDb,
    ],
  );

  const handleSelectEcho = useCallback(
    async (fullPresetValue: string) => {
      if (!beginPhotoOp()) return;
      setError(null);
      setEchoLargePickerOpen(false);
      try {
        await updateEchoPresetInDb(fullPresetValue);
        setEchoPickedNote(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not update Echo.";
        setError(msg);
      } finally {
        endPhotoOp();
      }
    },
    [beginPhotoOp, endPhotoOp, updateEchoPresetInDb],
  );

  const openEchoPicker = useCallback(
    (initialPresetValue?: string) => {
      if (photoOpBusyRef.current) return;
      const fallback =
        (echoPreset && isAvatarPresetValue(echoPreset) ? echoPreset : null) ??
        (ECHO_AVATAR_PRESETS[0]
          ? `${AVATAR_PRESET_PREFIX}${ECHO_AVATAR_PRESETS[0].id}`
          : null);
      setEchoPickerInitialValue(initialPresetValue ?? fallback);
      setEchoLargePickerOpen(true);
    },
    [echoPreset],
  );

  /** Snapshot for dirty detection — only updated on hydrate / after successful save */
  type Baseline = {
    displayName: string;
    username: string;
    bio: string;
    instagramUrl: string;
    tiktokUrl: string;
    telegramUrl: string;
    isPrivate: boolean;
    socialMediaPublic: boolean;
  };
  const baselineRef = useRef<Baseline | null>(null);

  const setBaselineFromValues = useCallback((b: Baseline) => {
    baselineRef.current = { ...b };
  }, []);

  /** Latest props snapshot — read inside hydrate effect only (do not put initialProfileData in effect deps). */
  const initialProfileDataRef = useRef(initialProfileData);
  initialProfileDataRef.current = initialProfileData;

  const applyProfileRow = useCallback(
    (
      data: {
        display_name: string | null;
        username: string | null;
        bio: string | null;
        avatar_url: string | null;
        profile_photos?: string[] | null;
        echo_preset?: string | null;
        instagram_url: string | null;
        tiktok_url: string | null;
        telegram_url: string | null;
        is_private?: boolean | null;
        social_media_public?: boolean | null;
        p2p_discover_enabled?: boolean | null;
      },
      options?: { applyPhotos?: boolean },
    ) => {
      const applyPhotos = options?.applyPhotos !== false;
      const displayNameV = data.display_name ?? "";
      const rawUsername = data.username ?? "";
      const clearPlaceholder =
        isFirstTime && isPlaceholderUsername(data.username);
      const usernameV = clearPlaceholder ? "" : rawUsername;
      const origForAvailability = clearPlaceholder
        ? null
        : data.username ?? null;
      const bioV = data.bio ?? "";

      const photos = uniqueOrderedProfilePhotos(data.profile_photos);
      let echo = normalizeEchoPreset(data.echo_preset);
      let nextCompat = (data.avatar_url ?? "").trim() || null;
      let showEchoNote = false;

      // First-time create only: assign a deterministic Echo when none exists yet.
      // Existing users with photos + null Echo keep an empty Echo state (no silent assign).
      // Skip bootstrap when preserving local photos after a mutation (stale empty fetch).
      const photoCountForEchoBootstrap = applyPhotos
        ? photos.length
        : profilePhotosRef.current.length;
      if (
        isFirstTime &&
        !echo &&
        photoCountForEchoBootstrap === 0 &&
        ECHO_AVATAR_PRESETS.length > 0
      ) {
        if (!echoBootstrapRef.current.done) {
          const identityKey = (user?.id ?? "").trim();
          const presetVal =
            (identityKey
              ? deterministicEchoPresetForIdentity(identityKey)
              : null) ??
            `${AVATAR_PRESET_PREFIX}${ECHO_AVATAR_PRESETS[0]!.id}`;
          echoBootstrapRef.current = { done: true, value: presetVal };
          echo = presetVal;
          showEchoNote = true;
          void (async () => {
            try {
              await updateEchoPresetInDb(presetVal);
            } catch (e) {
              console.warn(
                "[FullScreenProfileCreation] first-time Echo bootstrap failed",
                e,
              );
            }
          })();
        } else {
          echo = normalizeEchoPreset(echoBootstrapRef.current.value);
        }
      } else if (applyPhotos) {
        echoBootstrapRef.current = { done: false, value: null };
      }

      if (!nextCompat) {
        nextCompat =
          (applyPhotos ? photos[0] : profilePhotosRef.current[0]) ?? echo;
      }

      const ig = data.instagram_url ?? "";
      const tt = data.tiktok_url ?? "";
      const tg = data.telegram_url ?? "";
      const priv = data.is_private ?? false;
      const soc = data.social_media_public ?? false;
      const discoverOn = data.p2p_discover_enabled !== false;

      setDisplayName(displayNameV);
      setUsername(usernameV);
      setOrigUsername(origForAvailability);
      setBio(bioV);
      if (applyPhotos) {
        setProfilePhotos(photos);
      }
      setEchoPreset(echo);
      setCompatAvatarUrl(nextCompat);
      setEchoPickedNote(showEchoNote);
      setInstagramUrl(ig);
      setTiktokUrl(tt);
      setTelegramUrl(tg);
      setIsPrivate(priv);
      setSocialMediaPublic(soc);
      setP2pDiscoverEnabledState(discoverOn);

      setBaselineFromValues({
        displayName: displayNameV,
        username: usernameV,
        bio: bioV,
        instagramUrl: ig,
        tiktokUrl: tt,
        telegramUrl: tg,
        isPrivate: priv,
        socialMediaPublic: soc,
      });
    },
    [isFirstTime, setBaselineFromValues, updateEchoPresetInDb, user?.id],
  );

  useEffect(() => {
    // New editor session / account: never carry photo dirty generation across.
    photoMutationGenerationRef.current = 0;
    if (!open) {
      baselineRef.current = null;
    }
    return () => {
      photoMutationGenerationRef.current = 0;
    };
  }, [open, profileId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setError(null);
      const snap = initialProfileDataRef.current;
      const generationAtFetchStart = photoMutationGenerationRef.current;

      /** Pre-fill display name from auth user_metadata when profile row has no display_name (e.g. Apple). */
      const maybeHydrateDisplayFromAuthMetadata = async () => {
        if (cancelled) return;
        const b = baselineRef.current;
        if (!b || b.displayName.trim()) return;
        const { data: sess } = await supabase.auth.getSession();
        if (cancelled) return;
        const meta = String(
          sess?.session?.user?.user_metadata?.full_name ?? "",
        ).trim();
        if (!meta) return;
        setDisplayName(meta);
        setBaselineFromValues({ ...b, displayName: meta });
      };

      if (snap) {
        const applySnapPhotos = shouldApplyHydratedProfilePhotos(
          0,
          photoMutationGenerationRef.current,
        );
        applyProfileRow(
          {
            display_name: snap.display_name,
            username: snap.username,
            bio: snap.bio,
            avatar_url: snap.avatar_url,
            profile_photos: snap.profile_photos,
            echo_preset: snap.echo_preset,
            instagram_url: snap.instagram_url,
            tiktok_url: snap.tiktok_url,
            telegram_url: snap.telegram_url,
            is_private: snap.is_private,
            social_media_public: snap.social_media_public,
            p2p_discover_enabled: snap.p2p_discover_enabled,
          },
          { applyPhotos: applySnapPhotos },
        );
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select(
            "display_name, username, bio, avatar_url, profile_photos, echo_preset, instagram_url, tiktok_url, telegram_url, member_no, is_private, social_media_public, p2p_discover_enabled",
          )
          .eq("id", profileId)
          .maybeSingle();

        if (cancelled) return;

        if (fetchError) {
          console.error(
            "[FullScreenProfileCreation] Error fetching profile data:",
            fetchError,
          );
          if (!snap) {
            setError("Failed to load profile data. Please try again.");
            return;
          }
          await maybeHydrateDisplayFromAuthMetadata();
          return;
        }

        if (data) {
          const applyPhotos = shouldApplyHydratedProfilePhotos(
            generationAtFetchStart,
            photoMutationGenerationRef.current,
          );
          applyProfileRow(data, { applyPhotos });
        }

        await maybeHydrateDisplayFromAuthMetadata();
      } catch (e) {
        console.error(
          "[FullScreenProfileCreation] Unexpected error fetching profile:",
          e,
        );
        if (!cancelled && !snap) {
          setError("Failed to load profile data. Please try again.");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, profileId, applyProfileRow, isFirstTime, setBaselineFromValues]);

  const isPublicDirty = useCallback(() => {
    const b = baselineRef.current;
    if (!b) return false;
    return (
      displayName.trim() !== b.displayName.trim() ||
      username.trim() !== b.username.trim() ||
      bio.trim() !== b.bio.trim() ||
      instagramUrl.trim() !== b.instagramUrl.trim() ||
      tiktokUrl.trim() !== b.tiktokUrl.trim() ||
      telegramUrl.trim() !== b.telegramUrl.trim() ||
      isPrivate !== b.isPrivate ||
      socialMediaPublic !== b.socialMediaPublic
    );
  }, [
    displayName,
    username,
    bio,
    instagramUrl,
    tiktokUrl,
    telegramUrl,
    isPrivate,
    socialMediaPublic,
  ]);

  const isPrivateDirty = useCallback(() => {
    const canTrustOrTouched =
      privateProfileLoaded ||
      privateDobTouchedRef.current ||
      privateGenderTouchedRef.current;
    if (!canTrustOrTouched) return false;
    return (
      dateOfBirth !== initialDateOfBirth || gender !== initialGender
    );
  }, [
    privateProfileLoaded,
    dateOfBirth,
    initialDateOfBirth,
    gender,
    initialGender,
  ]);

  const isDirty = useCallback(() => {
    return isPublicDirty() || isPrivateDirty();
  }, [isPublicDirty, isPrivateDirty]);

  const enterAboutYouEditMode = useCallback(() => {
    aboutYouEditBaselineRef.current = { dateOfBirth, gender };
    setAboutYouEditMode(true);
  }, [dateOfBirth, gender]);

  const cancelAboutYouEditMode = useCallback(() => {
    const baseline = aboutYouEditBaselineRef.current;
    if (baseline) {
      const restored = applyAboutYouEditCancel(baseline, {
        dateOfBirth: initialDateOfBirth,
        gender: initialGender,
      });
      setDateOfBirth(restored.dateOfBirth);
      setGender(restored.gender);
      privateDobTouchedRef.current = restored.dobTouched;
      privateGenderTouchedRef.current = restored.genderTouched;
    }
    setDobExpanded(false);
    setAboutYouEditMode(false);
  }, [initialDateOfBirth, initialGender]);

  const requestAboutYouEdit = useCallback(() => {
    if (shouldConfirmAboutYouEdit(dateOfBirth, gender)) {
      showAboutYouEditConfirmRef.current = true;
      setShowAboutYouEditConfirm(true);
      return;
    }
    enterAboutYouEditMode();
  }, [dateOfBirth, gender, enterAboutYouEditMode]);

  const dismissAboutYouEditConfirm = useCallback(() => {
    showAboutYouEditConfirmRef.current = false;
    setShowAboutYouEditConfirm(false);
  }, []);

  const confirmAboutYouEdit = useCallback(() => {
    dismissAboutYouEditConfirm();
    enterAboutYouEditMode();
  }, [dismissAboutYouEditConfirm, enterAboutYouEditMode]);

  const aboutYouVisualState = deriveAboutYouVisualState(dateOfBirth, gender);
  const aboutYouComplete = aboutYouVisualState === "complete";
  const birthdayMissing = isAboutYouBirthdayMissing(dateOfBirth);
  const genderMissing = isAboutYouGenderMissing(gender);

  const skipPopstateRef = useRef(false);
  const isDirtyFnRef = useRef(isDirty);
  isDirtyFnRef.current = isDirty;
  const prevOpenRef = useRef(false);

  const dismissExitConfirm = useCallback(() => {
    showExitConfirmRef.current = false;
    setShowExitConfirm(false);
  }, []);

  const openExitConfirm = useCallback(() => {
    showExitConfirmRef.current = true;
    setShowExitConfirm(true);
  }, []);

  const requestClose = useCallback(() => {
    if (!isDirty()) {
      onClose();
      return;
    }
    openExitConfirm();
  }, [isDirty, onClose, openExitConfirm]);

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const restoreEditProfileHistory = useCallback(() => {
    window.history.pushState(
      { editProfileModal: true } as const,
      "",
      window.location.href,
    );
  }, []);

  /**
   * Topmost nested UI consumes browser/Android back first.
   * @param restoreHistory Re-push synthetic editor history after popstate consumption.
   */
  const consumeEditProfileBack = useCallback(
    (restoreHistory: boolean) => {
      const pushIfNeeded = () => {
        if (restoreHistory) restoreEditProfileHistory();
      };

      if (photoPreviewIndexRef.current != null) {
        setPhotoPreviewIndex(null);
        pushIfNeeded();
        return;
      }

      if (photoAddCropOpenRef.current) {
        photoAddPipelineRef.current.cancelCrop();
        pushIfNeeded();
        return;
      }

      if (avatarCropOpenRef.current) {
        handleReplaceCropCancelRef.current();
        pushIfNeeded();
        return;
      }

      if (showDeleteConfirmRef.current) {
        if (!isDeletingRef.current) {
          showDeleteConfirmRef.current = false;
          setShowDeleteConfirm(false);
        }
        pushIfNeeded();
        return;
      }

      if (showSaveConfirmRef.current) {
        if (!savingRef.current) {
          showSaveConfirmRef.current = false;
          setShowSaveConfirm(false);
        }
        pushIfNeeded();
        return;
      }

      if (showAboutYouEditConfirmRef.current) {
        showAboutYouEditConfirmRef.current = false;
        setShowAboutYouEditConfirm(false);
        pushIfNeeded();
        return;
      }

      if (showExitConfirmRef.current) {
        if (!savingRef.current) {
          dismissExitConfirm();
        }
        pushIfNeeded();
        return;
      }

      if (notifExplainerOpenRef.current) {
        setNotifExplainerOpen(false);
        pushIfNeeded();
        return;
      }

      if (mediaChooserOpenRef.current) {
        if (photoAddPipelineRef.current.mediaChooserOpen) {
          photoAddPipelineRef.current.closeMediaChooser();
        }
        setReplaceMediaChooserOpen(false);
        if (!avatarCropOpenRef.current) {
          replacePhotoIndexRef.current = null;
        }
        pushIfNeeded();
        return;
      }

      if (echoLargePickerOpenRef.current) {
        setEchoLargePickerOpen(false);
        pushIfNeeded();
        return;
      }

      if (dobExpandedRef.current) {
        setDobExpanded(false);
        pushIfNeeded();
        return;
      }

      requestCloseRef.current();
      if (isDirtyFnRef.current()) {
        pushIfNeeded();
      }
    },
    [dismissExitConfirm, restoreEditProfileHistory],
  );

  /** Push a history entry while open so browser/capacitor “back” can be intercepted. */
  useEffect(() => {
    if (!open) return;
    window.history.pushState(
      { editProfileModal: true } as const,
      "",
      window.location.href,
    );

    const onPopState = () => {
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false;
        return;
      }
      consumeEditProfileBack(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open, consumeEditProfileBack]);

  /** Android hardware back → same priority chain as popstate (no history restore). */
  useEffect(() => {
    if (!open) return;
    return subscribeAndroidHardwareBack(() => {
      consumeEditProfileBack(false);
    });
  }, [open, consumeEditProfileBack]);

  /** Remove the synthetic history entry when the modal closes intentionally (not via popstate). */
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      const st = window.history.state as { editProfileModal?: boolean } | null;
      if (st?.editProfileModal) {
        skipPopstateRef.current = true;
        window.history.back();
      }
    }
  }, [open]);

  // Auto-generate username from display name on first time (not after manual username edits)
  useEffect(() => {
    if (
      isFirstTime &&
      displayName.trim() &&
      !username.trim() &&
      !usernameTouchedByUserRef.current
    ) {
      generateUsernameFromDisplayName(displayName.trim());
    }
  }, [displayName, isFirstTime, username]);

  const generateUsernameFromDisplayName = async (name: string) => {
    if (!name) return;

    // Align with persistProviderProfileDefaults: compact tokens first ("Ben 10" → ben10).
    const normalized = name.trim().toLowerCase();
    let baseUsername = normalized
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9_]/g, "");
    if (baseUsername.length < 3) {
      const firstWord = normalized.split(/\s+/).filter(Boolean)[0] ?? "";
      baseUsername = firstWord.replace(/[^a-z0-9_]/g, "");
    }
    if (baseUsername.length < 3) {
      baseUsername = normalized.replace(/[^a-z0-9_]/g, "");
    }
    if (!baseUsername) return;
    baseUsername = baseUsername.slice(0, USERNAME_MAX);

    let finalUsername = baseUsername;
    let counter = 1;

    // Check if username is available and add numbers if needed
    while (counter <= 9999) {
      try {
        const { data: taken } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", finalUsername)
          .neq("id", profileId)
          .limit(1);

        if (!taken || taken.length === 0) {
          setUsername(finalUsername);
          setUsernameAvailable(true);
          break;
        }

        finalUsername = `${baseUsername}${counter}`;
        counter++;
      } catch (e) {
        break;
      }
    }
  };

  // Check username availability
  const checkUsername = async (username: string) => {
    if (!username.trim() || username === origUsername) {
      setUsernameAvailable(null);
      return;
    }

    setUsernameChecking(true);
    try {
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username.trim())
        .neq("id", profileId)
        .limit(1);

      setUsernameAvailable(taken?.length === 0);
    } catch (e) {
      setUsernameAvailable(null);
    } finally {
      setUsernameChecking(false);
    }
  };

  // Debounced username check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkUsername(username);
    }, 500);
    return () => clearTimeout(timer);
  }, [username, origUsername]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const publicDirty = isPublicDirty();
    const privateDirty = isPrivateDirty();
    let publicSaveSucceeded = false;
    let privateSaveSucceeded = false;

    try {
      // Required field validation (always — Save needs a valid identity)
      if (!displayName.trim()) {
        throw new Error("Display name is required.");
      }
      if (!username.trim()) {
        throw new Error("Username is required.");
      }

      // Username uniqueness check
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username.trim())
        .neq("id", profileId)
        .limit(1);

      if ((taken?.length ?? 0) > 0) {
        throw new Error("That username is already taken.");
      }

      assertPlainTextAllowedForUgc(displayName.trim(), "default");
      assertPlainTextAllowedForUgc(username.trim(), "username");
      assertPlainTextAllowedForUgc(bio.trim(), "default");
      const rawIg = instagramUrl.trim();
      const rawTt = tiktokUrl.trim();
      const rawTg = telegramUrl.trim();
      const normIg = normalizeSocialUrl("instagram", instagramUrl);
      const normTt = normalizeSocialUrl("tiktok", tiktokUrl);
      const normTg = normalizeSocialUrl("telegram", telegramUrl);
      if (normIg) assertPlainTextAllowedForUgc(normIg, "default");
      else if (rawIg) assertPlainTextAllowedForUgc(rawIg, "default");
      if (normTt) assertPlainTextAllowedForUgc(normTt, "default");
      else if (rawTt) assertPlainTextAllowedForUgc(rawTt, "default");
      if (normTg) assertPlainTextAllowedForUgc(normTg, "default");
      else if (rawTg) assertPlainTextAllowedForUgc(rawTg, "default");

      // First-time create always persists public identity; otherwise only when public dirty.
      const needsPublicSave = publicDirty || isFirstTime;

      if (needsPublicSave) {
        // Update profile text/social fields only — identity photos/Echo persist immediately.
        // Do NOT write avatar_url; DB trigger owns it from profile_photos / echo_preset.
        const patch: Record<string, unknown> = {
          display_name: displayName.trim(),
          username: username.trim(),
          bio: bio.trim() || "I'm too lazy to write a bio 😅",
          instagram_url: normIg,
          tiktok_url: normTt,
          telegram_url: normTg,
        };
        if (origUsername !== username.trim()) {
          patch.last_username_change_at = new Date().toISOString();
        }

        const { data: updatedProfile, error: upErr } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", profileId)
          .select(IDENTITY_PROFILE_SELECT)
          .maybeSingle();

        if (upErr) throw upErr;

        // Update privacy settings using the dedicated function (handles auto-approve logic)
        const { updateProfilePrivacy } = await import(
          "../../api/services/follows"
        );
        try {
          const privacyError = await updateProfilePrivacy(
            profileId,
            isPrivate,
            socialMediaPublic,
          );
          if (privacyError.error) {
            console.error(
              "Error updating privacy settings:",
              privacyError.error,
            );
          }
        } catch (privacyErr) {
          console.error("Exception updating privacy settings:", privacyErr);
        }

        try {
          localStorage.setItem(`onboarded_${profileId}`, "1");
        } catch {}

        try {
          if (displayName) localStorage.setItem("my_display_name", displayName);
          if (username) localStorage.setItem("my_username", username.trim());
        } catch {}

        const { getCachedProfile, setCachedProfile } = await import(
          "../../lib/profileCache"
        );

        const existing = getCachedProfile(profileId);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authUserId = session?.user?.id ?? existing?.user_id ?? null;

        let profilePayload: {
          id: string;
          user_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          profile_photos: string[];
          echo_preset: string | null;
          bio: string | null;
          xp: number | null;
          member_no: number | null;
          instagram_url: string | null;
          tiktok_url: string | null;
          telegram_url: string | null;
          is_private: boolean | null;
          social_media_public: boolean | null;
        } | null = null;

        if (updatedProfile) {
          profilePayload = {
            ...updatedProfile,
            profile_photos: uniqueOrderedProfilePhotos(
              updatedProfile.profile_photos,
            ),
            echo_preset: normalizeEchoPreset(updatedProfile.echo_preset),
            avatar_url: updatedProfile.avatar_url ?? null,
            member_no: updatedProfile.member_no ?? null,
            is_private: updatedProfile.is_private ?? null,
            social_media_public: updatedProfile.social_media_public ?? null,
          };
          setProfilePhotos(profilePayload.profile_photos);
          setEchoPreset(profilePayload.echo_preset);
          setCompatAvatarUrl(profilePayload.avatar_url);
        } else if (authUserId) {
          profilePayload = {
            id: profileId,
            user_id: authUserId,
            username: username.trim(),
            display_name: displayName.trim(),
            bio: bio.trim() || "I'm too lazy to write a bio 😅",
            avatar_url: compatAvatarUrl,
            profile_photos: profilePhotosRef.current,
            echo_preset: echoPresetRef.current,
            xp: existing?.xp ?? 0,
            member_no: existing?.member_no ?? null,
            instagram_url: instagramUrl.trim() || null,
            tiktok_url: tiktokUrl.trim() || null,
            telegram_url: telegramUrl.trim() || null,
            is_private: isPrivate,
            social_media_public: socialMediaPublic,
          };
        }

        if (profilePayload) {
          setCachedProfile(profilePayload as any);

          const { setCachedAvatar, preloadAvatar } = await import(
            "../../lib/avatarCache"
          );
          if (profilePayload.avatar_url) {
            setCachedAvatar(profilePayload.user_id, profilePayload.avatar_url);
            preloadAvatar(profilePayload.avatar_url);
            try {
              localStorage.setItem("my_avatar_url", profilePayload.avatar_url);
            } catch {
              /* ignore */
            }
          }
        }

        clearCachedFollowCounts(profileId);

        window.dispatchEvent(
          new CustomEvent("profile:updated", {
            detail: { id: profileId, profile: profilePayload },
          }),
        );

        setBaselineFromValues({
          displayName: displayName.trim(),
          username: username.trim(),
          bio: bio.trim() || "I'm too lazy to write a bio 😅",
          instagramUrl: normIg || "",
          tiktokUrl: normTt || "",
          telegramUrl: normTg || "",
          isPrivate,
          socialMediaPublic,
        });
        publicSaveSucceeded = true;
      }

      if (privateDirty) {
        try {
          const savedPrivate = await saveMyProfilePrivate({
            date_of_birth: dateOfBirth,
            gender,
          });
          setDateOfBirth(savedPrivate.date_of_birth);
          setGender(savedPrivate.gender);
          setInitialDateOfBirth(savedPrivate.date_of_birth);
          setInitialGender(savedPrivate.gender);
          setPrivateProfileLoaded(true);
          setPrivateProfileLoadError(false);
          privateDobTouchedRef.current = false;
          privateGenderTouchedRef.current = false;
          setAboutYouEditMode(false);
          setDobExpanded(false);
          setShowAboutYouEditConfirm(false);
          showAboutYouEditConfirmRef.current = false;
          aboutYouEditBaselineRef.current = null;
          privateSaveSucceeded = true;
        } catch (privateErr: unknown) {
          const msg =
            privateErr instanceof Error
              ? privateErr.message
              : "Failed to save date of birth / gender.";
          throw new Error(msg);
        }
      }

      onClose();

      if (isFirstTime && onComplete) {
        onComplete();
      }
    } catch (e: unknown) {
      // If public succeeded before private failed, public baseline is already updated.
      // Private remains dirty for retry. Do not close.
      const message =
        e instanceof Error ? e.message : "Something went wrong.";
      if (publicSaveSucceeded && privateDirty && !privateSaveSucceeded) {
        setError(
          message && message !== "Something went wrong."
            ? message
            : "Profile saved, but private details failed.",
        );
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    displayName.trim() && username.trim() && usernameAvailable !== false;

  if (!open) return null;

  const echoPickerOpenable =
    ECHO_AVATAR_PRESETS.length > 0 && !photoOpBusy && !photoAddPipeline.busy;

  const photoBusy = photoOpBusy || photoAddPipeline.busy;
  const isAddCropActive = photoAddPipeline.cropOpen;
  const mediaChooserOpen =
    photoAddPipeline.mediaChooserOpen || replaceMediaChooserOpen;

  return createPortal(
    <div className={`fixed inset-0 ${EDITOR_OVERLAY_Z}`}>
      <div
        className={editProfileShellAtmosphereClass}
        aria-hidden
      />
      <div className="relative flex h-full flex-col">
        {/* Header - fixed at top, gradient (solid at top → transparent) theme-aware, content scrolls behind */}
        <div
          className="fixed left-0 right-0 top-0 z-30 flex flex-col items-center px-4 pt-[calc(8px+env(safe-area-inset-top,0px))] pb-3 pointer-events-none"
          style={{
            minHeight: "calc(52px + 8px + env(safe-area-inset-top, 0px))",
            background: "var(--gradient-from-top)",
          }}
        >
          {/* Floating pill — create flow centers title; edit keeps title + Cancel */}
          <div
            className={[
              "relative z-10 flex w-full max-w-[640px] items-center rounded-full",
              "border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)]",
              "px-4 py-[10px] backdrop-blur-[var(--glass-blur)] pointer-events-auto",
              isFirstTime ? "justify-center" : "justify-between",
            ].join(" ")}
          >
            <span className="text-base font-semibold text-[var(--text)]">
              {isFirstTime ? "Create Your Profile" : "Edit Profile"}
            </span>
            {!isFirstTime && (
              <button
                type="button"
                className="text-sm text-[var(--text)]/70 hover:text-[var(--text)] transition-colors"
                onClick={requestClose}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {photoBusy ? (
          <div
            className="pointer-events-none fixed inset-x-0 z-[35] flex justify-center px-3"
            style={{
              top: "calc(52px + 12px + env(safe-area-inset-top, 0px))",
            }}
            role="status"
            aria-live="polite"
            aria-busy
          >
            <div
              className={[
                "flex max-w-[min(640px,calc(100%-1.5rem))] items-center gap-2 rounded-full border border-[var(--brand)]/50",
                "bg-[var(--glass-bg)] px-3 py-1.5 shadow-[0_2px_14px_rgba(0,0,0,0.1)]",
                "backdrop-blur-[var(--glass-blur)]",
              ].join(" ")}
            >
              <span
                className="inline-block size-3 shrink-0 rounded-full border-2 border-[var(--brand)]/35 border-t-[var(--brand)] animate-spin"
                aria-hidden
              />
              <span className="text-[11px] font-medium leading-none text-[var(--text)]/90">
                Processing photos…
              </span>
            </div>
          </div>
        ) : null}

        {/* Content - z-0 keeps scroll/composited children below fixed header/footer (z-30) */}
        <div className="relative z-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-[calc(7rem+var(--safe-area-bottom-layout))]">
          <div className="mx-auto w-full max-w-[640px] px-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}

          {isFirstTime ? (
            <div className="mb-5 mx-auto w-full max-w-[min(360px,92vw)] px-1 text-center">
              <p className="mb-1.5 text-sm font-semibold leading-snug text-[var(--text)]">
                Welcome to EchoToo <span aria-hidden>🦉</span>
              </p>
              <p className="text-[13px] leading-snug text-[var(--text)]/75">
                It&apos;s pronounced &quot;Echo Too&quot; BTW. Create your
                profile and start discovering hangouts, experiences, and ideas
                worth sharing.
              </p>
            </div>
          ) : null}

          <input
            ref={avatarFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-hidden
            onChange={(e) => {
              // Snapshot File objects first — FileList may be live and empty after clear.
              const files = Array.from(e.target.files ?? []);
              (e.target as HTMLInputElement).value = "";
              if (files.length === 0) return;
              if (replacePhotoIndexRef.current != null) {
                beginReplaceFilesForCrop(files);
              } else {
                photoAddPipelineRef.current.acceptWebFiles(files);
              }
            }}
          />

          {echoPickedNote && isFirstTime ? (
            <p className="mb-2.5 text-center text-[12px] leading-snug text-[var(--text)]/60">
              We picked an Echo for you — change it anytime.
            </p>
          ) : null}

          <div className={editProfileIdentityZoneClass}>
            <ProfilePhotosMediaManager
              photos={profilePhotos}
              busy={photoBusy}
              onAddPhotos={openAddPhotosPicker}
              onRemove={(index) => void handleRemovePhoto(index)}
              onReorder={(from, to) => void handleReorderPhotos(from, to)}
              onOpenFullscreen={(index) => setPhotoPreviewIndex(index)}
            />

            <EchoVisualSelector
              echoPreset={echoPreset}
              disabled={!echoPickerOpenable}
              onOpenPicker={openEchoPicker}
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Display Name - Required */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Display Name *
              </label>
              <div className="relative">
                <input
                  className={`${editProfileFieldPillClass} pr-14 font-medium`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={DISPLAY_NAME_MAX}
                  required
                />
                <FieldCharCount
                  current={displayName.length}
                  max={DISPLAY_NAME_MAX}
                />
              </div>
            </div>

            {/* Username - Required */}
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Username *
              </label>
              <div className="relative">
                <input
                  className={`${editProfileFieldPillClass} pr-14 font-medium`}
                  value={username}
                  onChange={(e) => {
                    usernameTouchedByUserRef.current = true;
                    setUsername(e.target.value);
                  }}
                  maxLength={USERNAME_MAX}
                  required
                />
                <FieldCharCount current={username.length} max={USERNAME_MAX} />
                {usernameChecking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text)]/30 border-t-[var(--text)]" />
                  </div>
                )}
                {usernameAvailable === true && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 transform text-green-400">
                    ✓
                  </div>
                )}
                {usernameAvailable === false && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 transform text-red-400">
                    ✗
                  </div>
                )}
              </div>
              {usernameAvailable === false && (
                <p className="mt-1 text-sm text-red-400">
                  Username is already taken
                </p>
              )}
            </div>

            {/* Bio - Optional */}
            <div ref={bioSectionRef}>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Bio
              </label>
              <div className="relative">
                <textarea
                  className={`${editProfileFieldBlockClass} resize-none pb-7 pr-12`}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={BIO_MAX}
                  placeholder="I'm too lazy to write a bio 😅"
                />
                <FieldCharCount
                  current={bio.length}
                  max={BIO_MAX}
                  insetClassName="bottom-3.5 right-2.5"
                />
              </div>
            </div>

            {/* Private metadata — owner-only; staged until Save */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text)]">
                  About you
                </p>
                {aboutYouEditMode ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={cancelAboutYouEditMode}
                    className="shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--text)]/70 transition-colors hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:opacity-50"
                    aria-label="Cancel editing about you"
                  >
                    Cancel
                  </button>
                ) : !privateProfileLoading ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={requestAboutYouEdit}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:opacity-50"
                    aria-label="Edit About you"
                  >
                    <span
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                        aboutYouComplete
                          ? "border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_62%,transparent)] app-light:bg-[color-mix(in_oklab,var(--surface-2)_78%,var(--surface))] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_48%,transparent)]"
                          : "border border-[color-mix(in_oklab,var(--brand-ink)_14%,var(--brand))] bg-[var(--brand)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
                      ].join(" ")}
                      aria-hidden
                    >
                      <PiPencilSimple
                        className={
                          aboutYouComplete
                            ? "h-[14px] w-[14px] text-[var(--text)]/45"
                            : "h-[15px] w-[15px] text-[var(--brand-ink)]"
                        }
                        aria-hidden
                      />
                    </span>
                  </button>
                ) : null}
              </div>
              {privateProfileLoading ? (
                <p className="text-[12px] text-[var(--text)]/50">Loading…</p>
              ) : null}
              {privateProfileLoadError ? (
                <p className="text-[12px] text-red-400/90">
                  Couldn&apos;t load private details. You can still edit your
                  profile.
                </p>
              ) : null}

              {!aboutYouEditMode ? (
                <div
                  className="grid min-w-0 grid-cols-2 gap-2.5"
                  aria-label="About you summary"
                >
                  <div
                    className={[
                      "flex min-h-[76px] min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-2.5 text-center",
                      aboutYouFieldCardSurfaceClass(birthdayMissing),
                    ].join(" ")}
                  >
                    <PiCalendarBlank
                      className={aboutYouFieldIconClass(birthdayMissing)}
                      aria-hidden
                    />
                    <p className="mt-1 text-[10px] font-medium leading-none text-[var(--text)]/60">
                      Birthday
                    </p>
                    <p className={aboutYouFieldValueClass(birthdayMissing)}>
                      {formatBirthdayDisplay(dateOfBirth)}
                    </p>
                  </div>
                  <div
                    className={[
                      "flex min-h-[76px] min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-2.5 text-center",
                      aboutYouFieldCardSurfaceClass(genderMissing),
                    ].join(" ")}
                  >
                    <PiUser
                      className={aboutYouFieldIconClass(genderMissing)}
                      aria-hidden
                    />
                    <p className="mt-1 text-[10px] font-medium leading-none text-[var(--text)]/60">
                      Gender
                    </p>
                    <p
                      className={aboutYouFieldValueClass(
                        genderMissing,
                        gender === "prefer_not_to_say",
                      )}
                    >
                      {formatGenderDisplay(gender)}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={[
                      "w-full overflow-hidden transition-[border-radius] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                      editProfileFieldFillClass,
                      dobExpanded ? "rounded-[20px]" : "rounded-[18px]",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                        dobExpanded
                          ? "grid-rows-[0fr] opacity-0"
                          : "grid-rows-[1fr] opacity-100",
                      ].join(" ")}
                      aria-hidden={dobExpanded}
                    >
                      <div
                        className={[
                          "min-h-0 overflow-hidden",
                          dobExpanded ? "pointer-events-none" : "",
                        ].join(" ")}
                      >
                        <button
                          id="profile-dob-trigger"
                          type="button"
                          disabled={saving}
                          aria-expanded={dobExpanded}
                          onClick={() => {
                            const { minDate, maxDate } = getDobPickerBounds();
                            setDobPickerParts(
                              ymdToDobParts(dateOfBirth, minDate, maxDate),
                            );
                            setDobExpanded(true);
                          }}
                          className="flex w-full min-h-[40px] items-center justify-between gap-2 px-4 py-2 text-left text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)] disabled:opacity-50"
                          aria-label={
                            dateOfBirth
                              ? `Date of birth ${formatDobDisplay(dateOfBirth)}`
                              : "Date of birth"
                          }
                        >
                          <span
                            className={
                              dateOfBirth
                                ? "truncate text-[14px] font-medium"
                                : "truncate text-[14px] text-[var(--text)]/55"
                            }
                          >
                            {dateOfBirth
                              ? formatDobDisplay(dateOfBirth)
                              : "Date of birth"}
                          </span>
                          <PiCaretDown
                            className="h-4 w-4 shrink-0 text-[var(--text)]/45"
                            aria-hidden
                          />
                        </button>
                      </div>
                    </div>

                    <div
                      className={[
                        "grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                        dobExpanded
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0",
                      ].join(" ")}
                      aria-hidden={!dobExpanded}
                    >
                      <div
                        className={[
                          "min-h-0 overflow-hidden",
                          !dobExpanded ? "pointer-events-none" : "",
                        ].join(" ")}
                      >
                        <div className="px-2.5 pb-2.5 pt-2">
                          <ProfileDobWheel
                            value={dobPickerParts}
                            onChange={setDobPickerParts}
                            active={dobExpanded}
                          />
                          <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setDobExpanded(false)}
                              className="flex min-h-[32px] min-w-0 items-center gap-1 text-left text-[12px] font-medium text-[var(--text)]/70"
                              aria-label="Collapse date of birth"
                            >
                              <span className="truncate">Date of birth</span>
                              <PiCaretDown
                                className="h-3.5 w-3.5 shrink-0 rotate-180 text-[var(--text)]/45"
                                aria-hidden
                              />
                            </button>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!dateOfBirth || saving}
                                onClick={() => {
                                  privateDobTouchedRef.current = true;
                                  setDateOfBirth(null);
                                  setDobExpanded(false);
                                }}
                                className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--glass-bg)_70%,transparent)] px-3 text-[12px] font-semibold text-[var(--text)]/75 disabled:opacity-35"
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  privateDobTouchedRef.current = true;
                                  setDateOfBirth(dobPartsToYmd(dobPickerParts));
                                  setDobExpanded(false);
                                }}
                                className="inline-flex h-8 items-center justify-center rounded-full bg-[var(--brand)] px-3.5 text-[12px] font-semibold text-[var(--brand-ink)] disabled:opacity-50"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-0.5">
                    <span
                      className="mb-1.5 block text-xs text-[var(--text)]/70"
                      id="profile-gender-label"
                    >
                      Gender
                    </span>
                    <div
                      role="group"
                      aria-labelledby="profile-gender-label"
                      className={[
                        "flex h-9 w-full min-w-0 overflow-hidden rounded-full p-0.5",
                        editProfileFieldFillClass,
                      ].join(" ")}
                    >
                      {GENDER_OPTIONS.map((opt) => {
                        const selected = gender === opt.value;
                        const flex =
                          opt.value === "prefer_not_to_say"
                            ? "flex-[1.7]"
                            : "flex-1";
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={saving}
                            aria-pressed={selected}
                            onClick={() => {
                              privateGenderTouchedRef.current = true;
                              setGender((prev) =>
                                prev === opt.value ? null : opt.value,
                              );
                            }}
                            className={[
                              flex,
                              "min-w-0 truncate rounded-full px-1.5 text-[11px] font-semibold leading-none transition-[background-color,color,box-shadow,opacity] duration-200 ease-out disabled:opacity-50 sm:text-[12px]",
                              selected
                                ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                                : "bg-transparent text-[var(--text)]/70 hover:text-[var(--text)]/90",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {showNotifSetupCard ? (
              <div
                className={`mb-6 overflow-hidden rounded-2xl p-3.5 shadow-sm ${editProfileFieldFillClass}`}
                role="region"
                aria-label="Notification setup suggestion"
              >
                <h3 className="text-[13px] font-semibold leading-tight text-[var(--text)]">
                  Stay in the loop
                </h3>
                <p className="mt-1.5 text-[12px] leading-snug text-[var(--text)]/75">
                  Get notified about invites, activity, and saved hangouts.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-[var(--brand)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--brand-ink)] transition-opacity hover:opacity-90"
                    onClick={() => setNotifExplainerOpen(true)}
                  >
                    Allow notifications
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)]/55 px-3.5 py-1.5 text-[11px] font-semibold text-[var(--text)]/85 transition-colors hover:bg-[var(--surface)]/75"
                    onClick={dismissNotifSetupCard}
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : null}

            {/* Social media */}
            <div ref={socialSectionRef} className="mt-6">
              <label className="mb-3 block text-sm font-medium text-[var(--text)]">
                Social media
              </label>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--text)]/70">
                    Instagram
                  </label>
                  <div className="relative">
                    <img
                      src="/instagram-icon.svg"
                      alt=""
                      className="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 opacity-85"
                      aria-hidden
                    />
                    <input
                      className={`${editProfileFieldPillClass} pl-10 pr-16`}
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      placeholder="@username or instagram.com/username"
                      maxLength={SOCIAL_URL_MAX}
                    />
                    <FieldCharCount
                      current={instagramUrl.length}
                      max={SOCIAL_URL_MAX}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--text)]/70">
                    TikTok
                  </label>
                  <div className="relative">
                    <img
                      src="/Tiktok-icon.svg"
                      alt=""
                      className="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 opacity-85"
                      aria-hidden
                    />
                    <input
                      className={`${editProfileFieldPillClass} pl-10 pr-16`}
                      value={tiktokUrl}
                      onChange={(e) => setTiktokUrl(e.target.value)}
                      placeholder="@username or tiktok.com/@username"
                      maxLength={SOCIAL_URL_MAX}
                    />
                    <FieldCharCount
                      current={tiktokUrl.length}
                      max={SOCIAL_URL_MAX}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[var(--text)]/70">
                    Telegram
                  </label>
                  <div className="relative">
                    <img
                      src="/Telegram-icon.svg"
                      alt=""
                      className="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 opacity-85"
                      aria-hidden
                    />
                    <input
                      className={`${editProfileFieldPillClass} pl-10 pr-16`}
                      value={telegramUrl}
                      onChange={(e) => setTelegramUrl(e.target.value)}
                      placeholder="@username or t.me/username"
                      maxLength={SOCIAL_URL_MAX}
                    />
                    <FieldCharCount
                      current={telegramUrl.length}
                      max={SOCIAL_URL_MAX}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy Settings — collapsed by default; not persisted */}
            <div className="mt-6 border-t border-[var(--border)]/40 pt-4">
              <button
                type="button"
                id="privacy-settings-heading"
                className="flex w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--text)]/[0.04] hover:text-[var(--text)]"
                aria-expanded={privacyAccordionOpen}
                aria-controls="privacy-settings-panel"
                onClick={() => setPrivacyAccordionOpen((v) => !v)}
              >
                <span>Privacy settings</span>
                <PiCaretDown
                  size={18}
                  className={`shrink-0 text-[var(--text)]/50 transition-transform duration-200 ${
                    privacyAccordionOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>
              <p className="mb-1 mt-0 text-[11px] leading-snug text-[var(--text)]/55">
                Control who can see your profile and social links.
              </p>

              {privacyAccordionOpen ? (
                <div
                  id="privacy-settings-panel"
                  role="region"
                  aria-labelledby="privacy-settings-heading"
                  className="mt-3 space-y-4"
                >
                  {/* Private Account Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[var(--text)] mb-1">
                        Private Account
                      </div>
                      <div className="text-xs text-[var(--text)]/70">
                        When private, only approved followers can see your posts
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newIsPrivate = !isPrivate;
                        setIsPrivate(newIsPrivate);
                        // When enabling private account, default social media toggle to ON
                        if (newIsPrivate && !socialMediaPublic) {
                          setSocialMediaPublic(true);
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isPrivate ? "bg-[var(--brand)]" : "bg-[var(--text)]/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isPrivate ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Show Social Media Links Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[var(--text)] mb-1">
                        {isPrivate
                          ? "Show Social Media Links"
                          : "Show Social Media Links"}
                      </div>
                      <div className="text-xs text-[var(--text)]/70">
                        {isPrivate
                          ? "Allow everyone to see your social links, even if account is private"
                          : "Social media links are always visible on public accounts"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSocialMediaPublic(!socialMediaPublic)}
                      disabled={!isPrivate}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        !isPrivate
                          ? "bg-[var(--text)]/10 opacity-50 cursor-not-allowed"
                          : socialMediaPublic
                          ? "bg-[var(--brand)]"
                          : "bg-[var(--text)]/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          socialMediaPublic ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Discover (People) — immediate RPC, not Save */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-3">
                      <div className="text-sm font-medium text-[var(--text)] mb-1">
                        {peopleUiCopy.profileDiscoverTitle}
                      </div>
                      <div className="text-xs text-[var(--text)]/70">
                        {peopleUiCopy.profileDiscoverBody}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={discoverPrefSaving}
                      aria-pressed={p2pDiscoverEnabled}
                      aria-label={peopleUiCopy.profileDiscoverTitle}
                      onClick={() => {
                        const next = !p2pDiscoverEnabled;
                        setP2pDiscoverEnabledState(next);
                        setDiscoverPrefSaving(true);
                        void setP2pDiscoverEnabled(next)
                          .then((confirmed) => {
                            setP2pDiscoverEnabledState(confirmed);
                            toast.success(
                              confirmed
                                ? peopleUiCopy.discoverToggleOnSuccess
                                : peopleUiCopy.discoverToggleOffSuccess
                            );
                          })
                          .catch(() => {
                            setP2pDiscoverEnabledState(!next);
                            toast.error(peopleUiCopy.discoverToggleError);
                          })
                          .finally(() => {
                            setDiscoverPrefSaving(false);
                          });
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                        p2pDiscoverEnabled
                          ? "bg-[var(--brand)]"
                          : "bg-[var(--text)]/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          p2pDiscoverEnabled
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Help & Support - Play Store compliance */}
            {!isFirstTime && (
              <div className="mt-4 border-t border-[var(--border)]/40 pt-4">
                <a
                  href={getSupportMailto()}
                  className="text-sm text-[var(--brand)] hover:underline"
                >
                  Help & Support
                </a>
              </div>
            )}

            {/* Danger zone - only when editing (not first-time) */}
            {!isFirstTime && (
              <div
                ref={deleteDangerZoneRef}
                className="mt-4 border-t border-[var(--border)]/40 pt-4"
              >
                <label className="block text-sm font-medium text-[var(--text)] mb-3">
                  Danger zone
                </label>
                <p className="text-xs text-[var(--text)]/70 mb-3">
                  This will remove your profile from the app and sign you out.
                </p>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    showDeleteConfirmRef.current = true;
                    setShowDeleteConfirm(true);
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Delete Account
                </button>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Footer - fixed at bottom, gradient (solid at bottom → transparent) theme-aware */}
        <div
          className="fixed left-0 right-0 bottom-0 z-30 flex flex-col items-center border-t border-[var(--border)]/25 px-4 pb-[calc(8px+var(--safe-area-bottom-layout))] pt-4 pointer-events-none"
          style={{ background: "var(--gradient-from-bottom)" }}
        >
          <div className="pointer-events-auto w-full max-w-[640px]">
            <button
              className="w-full py-2.5 px-6 rounded-full bg-[var(--brand)] text-[var(--brand-ink)] font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              disabled={!canSave || saving}
              onClick={() => {
                if (!isFirstTime) {
                  showSaveConfirmRef.current = true;
                  setShowSaveConfirm(true);
                } else {
                  save();
                }
              }}
            >
              {saving
                ? "Saving..."
                : isFirstTime
                ? "Create Profile"
                : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {echoLargePickerOpen && ECHO_AVATAR_PRESETS.length > 0 ? (
        <EchoPresetPickerOverlay
          open
          onClose={() => setEchoLargePickerOpen(false)}
          presets={ECHO_AVATAR_PRESETS}
          initialPresetValue={
            echoPickerInitialValue &&
            isAvatarPresetValue(echoPickerInitialValue)
              ? echoPickerInitialValue
              : echoPreset && isAvatarPresetValue(echoPreset)
                ? echoPreset
                : `${AVATAR_PRESET_PREFIX}${ECHO_AVATAR_PRESETS[0]!.id}`
          }
          onSelectPreset={(full) => {
            void handleSelectEcho(full);
          }}
        />
      ) : null}

      <AvatarCropModal
        open={isAddCropActive || avatarCropOpen}
        imageSrc={
          isAddCropActive ? photoAddPipeline.cropImageSrc : avatarCropSrc
        }
        mode="profilePhoto"
        onCancel={
          isAddCropActive
            ? photoAddPipeline.cancelCrop
            : handleReplaceCropCancel
        }
        onConfirm={
          isAddCropActive
            ? photoAddPipeline.confirmCrop
            : handleReplaceCropConfirm
        }
      />

      {isNativeApp() ? (
        <MediaAcquisitionSheet
          open={mediaChooserOpen}
          onClose={() => {
            if (photoAddPipeline.mediaChooserOpen) {
              photoAddPipeline.closeMediaChooser();
            }
            setReplaceMediaChooserOpen(false);
            if (!avatarCropOpenRef.current) {
              replacePhotoIndexRef.current = null;
            }
          }}
          onPhotoLibrary={() => {
            if (photoAddPipeline.mediaChooserOpen) {
              void photoAddPipeline.chooseLibrary();
            } else {
              void handleReplacePhotoLibrary();
            }
          }}
          onCamera={() => {
            if (photoAddPipeline.mediaChooserOpen) {
              void photoAddPipeline.captureCamera();
            } else {
              void handleReplacePhotoCamera();
            }
          }}
          busy={
            photoAddPipeline.mediaNativeBusy || replaceMediaNativeBusy
          }
          portalClassName={SOCIAL_OVERLAY_LAYER.editProfileAcquisition}
        />
      ) : null}

      {photoPreviewIndex != null &&
      profilePhotos[photoPreviewIndex] != null ? (
        <AvatarPreviewLightbox
          open
          variant="portrait"
          src={
            avatarDisplayUrl(profilePhotos[photoPreviewIndex]!) ??
            profilePhotos[photoPreviewIndex]!
          }
          alt={`Profile photo ${photoPreviewIndex + 1}`}
          onClose={() => setPhotoPreviewIndex(null)}
          actions={
            <AvatarPreviewLightboxAction
              label="Replace"
              icon={<PiArrowsClockwise className="h-5 w-5" aria-hidden />}
              disabled={photoBusy}
              onClick={() => {
                const idx = photoPreviewIndex;
                setPhotoPreviewIndex(null);
                if (idx != null) openReplacePhotoPicker(idx);
              }}
            />
          }
        />
      ) : null}

      {/* Save Changes Confirmation */}
      <ConfirmDialog
        open={showAboutYouEditConfirm}
        onClose={dismissAboutYouEditConfirm}
        onConfirm={confirmAboutYouEdit}
        title="Update About you?"
        message="Birthday and gender are already set. Do you want to update them?"
        cancelLabel="Cancel"
        confirmLabel="Update"
        confirmVariant="primary"
        higherZIndex
      />

      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => {
          if (!saving) {
            showSaveConfirmRef.current = false;
            setShowSaveConfirm(false);
          }
        }}
        onConfirm={async () => {
          showSaveConfirmRef.current = false;
          setShowSaveConfirm(false);
          await save();
        }}
        title="Save Changes?"
        message="Are you sure you want to save these changes to your profile?"
        cancelLabel="Cancel"
        confirmLabel="Save Changes"
        confirmVariant="primary"
        isLoading={saving}
        higherZIndex
      />

      <HangoutNotificationExplainerModal
        open={notifExplainerOpen}
        onOpenChange={(next) => {
          setNotifExplainerOpen(next);
          if (!next && user?.id) {
            void getNativePushReceiveState().then(({ ui }) => {
              if (ui === "granted") setShowNotifSetupCard(false);
            });
          }
        }}
        mode="manual"
      />

      <ConfirmDialog
        open={showExitConfirm}
        onClose={() => {
          if (!saving) dismissExitConfirm();
        }}
        onConfirm={async () => {
          dismissExitConfirm();
          await save();
        }}
        title="Save changes?"
        message="You have unsaved changes. Save now, keep editing, or discard and lose your staged edits."
        cancelLabel="Keep editing"
        secondaryLabel="Discard"
        secondaryVariant="dangerSoft"
        onSecondary={() => {
          dismissExitConfirm();
          onClose();
        }}
        confirmLabel="Save"
        confirmVariant="primary"
        isLoading={saving}
        higherZIndex
      />

      {/* Delete Account Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => {
          if (!isDeleting) {
            showDeleteConfirmRef.current = false;
            setShowDeleteConfirm(false);
          }
        }}
        onConfirm={async () => {
          if (isDeleting) return;
          setIsDeleting(true);
          setError(null);
          try {
            const result = await deleteAccount();
            if (!result.success) {
              setError(result.error);
              setShowDeleteConfirm(false);
              setIsDeleting(false);
              return;
            }
            setShowDeleteConfirm(false);
            clearAuthCache();
            clearCachedProfile(profileId);
            clearCachedFollowCounts(profileId);
            try {
              localStorage.removeItem("my_profile_id");
            } catch {}
            onClose();
            navigate("/");
            await deleteMyPushDevices();
            await supabase.auth.signOut();
          } catch (e: any) {
            setError(e?.message || "Failed to delete account");
            setShowDeleteConfirm(false);
            setIsDeleting(false);
          }
        }}
        title="Delete account"
        message="Are you sure you want to delete your account? This action will remove your profile from the app and sign you out."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        isLoading={isDeleting}
        higherZIndex
      />
    </div>,
    document.body,
  );
}
