import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ConfirmDialog from "../ui/ConfirmDialog";
import { deleteAccount } from "../../api/services/account";
import { deleteMyPushDevices } from "../../api/services/pushDevices";
import { clearAuthCache } from "../../api/services/follows";
import { clearCachedProfile } from "../../lib/profileCache";
import { clearCachedFollowCounts } from "../../lib/followCountsCache";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  AVATAR_PRESET_PREFIX,
  getAvatarPresets,
  isAvatarPresetValue,
} from "../../lib/avatarPresets";
import { getSupportMailto } from "../../lib/supportConfig";
import { uploadImage } from "../../api/services/mediaUpload";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import AvatarCropModal from "./AvatarCropModal";
import { isPlaceholderUsername } from "../../lib/profileUsername";

const DISPLAY_NAME_MAX = 40;
const USERNAME_MAX = 24;
const BIO_MAX = 160;
const SOCIAL_URL_MAX = 300;

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

type AvatarMode = "photo" | "echo";

const PROFILE_AVATAR_UPLOAD_LOG = "[ProfileAvatarUpload]";

function mapProfileAvatarUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("not authenticated")) return msg;
  if (msg.includes("Supabase Storage")) return msg;
  return "Could not prepare image. Try a different photo.";
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
    instagram_url: string | null;
    tiktok_url: string | null;
    telegram_url: string | null;
    member_no: number | null;
    is_private?: boolean | null;
    social_media_public?: boolean | null;
  };
};

export default function FullScreenProfileCreation({
  open,
  onClose,
  profileId,
  isFirstTime = false,
  onComplete,
  initialProfileData,
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
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  /** Create flow: survives duplicate empty hydrate fetches so random Echo persists. Reset when modal closes. */
  const echoBootstrapRef = useRef<{ done: boolean; value: string | null }>({
    done: false,
    value: null,
  });
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("photo");
  /** Shown once when create flow assigns a random preset (empty avatar + presets). */
  const [echoPickedNote, setEchoPickedNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [socialMediaPublic, setSocialMediaPublic] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const avatarCropObjectUrlRef = useRef<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  /** After user types in the username field, display-name sync must not overwrite (create flow only). */
  const usernameTouchedByUserRef = useRef(false);

  const revokeAvatarCropObjectUrl = useCallback(() => {
    const u = avatarCropObjectUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      avatarCropObjectUrlRef.current = null;
    }
    setAvatarCropSrc(null);
    setAvatarCropOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      revokeAvatarCropObjectUrl();
    }
  }, [open, revokeAvatarCropObjectUrl]);

  useEffect(() => {
    if (open) {
      usernameTouchedByUserRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      echoBootstrapRef.current = { done: false, value: null };
      setEchoPickedNote(false);
    }
  }, [open]);

  const handleCroppedAvatarConfirm = useCallback(
    async (croppedFile: File) => {
      setError(null);
      setUploading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error("User not authenticated");
        }
        console.log(PROFILE_AVATAR_UPLOAD_LOG, "upload_start", {
          userId: session.user.id,
          bytes: croppedFile.size,
        });
        const result = await uploadImage(croppedFile, {
          userId: session.user.id,
          kind: "avatar",
        });
        setAvatarUrl(result);
        echoBootstrapRef.current = { done: false, value: null };
        setAvatarMode("photo");
        setEchoPickedNote(false);
        revokeAvatarCropObjectUrl();
        console.log(PROFILE_AVATAR_UPLOAD_LOG, "success");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const phase = msg.includes("Supabase Storage")
          ? "upload"
          : msg.includes("not authenticated")
          ? "auth"
          : "preparation_or_unknown";
        console.warn(PROFILE_AVATAR_UPLOAD_LOG, "failed", {
          phase,
          message: msg,
        });
        setError(mapProfileAvatarUploadError(err));
        revokeAvatarCropObjectUrl();
      } finally {
        setUploading(false);
      }
    },
    [revokeAvatarCropObjectUrl],
  );

  /** Snapshot for dirty detection — only updated on hydrate / after successful save */
  type Baseline = {
    displayName: string;
    username: string;
    bio: string;
    avatarUrl: string;
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
    (data: {
      display_name: string | null;
      username: string | null;
      bio: string | null;
      avatar_url: string | null;
      instagram_url: string | null;
      tiktok_url: string | null;
      telegram_url: string | null;
      is_private?: boolean | null;
      social_media_public?: boolean | null;
    }) => {
      const displayNameV = data.display_name ?? "";
      const rawUsername = data.username ?? "";
      const clearPlaceholder =
        isFirstTime && isPlaceholderUsername(data.username);
      const usernameV = clearPlaceholder ? "" : rawUsername;
      const origForAvailability = clearPlaceholder
        ? null
        : data.username ?? null;
      const bioV = data.bio ?? "";
      const trimmedIncoming = (data.avatar_url ?? "").trim();

      let nextAvatar: string;
      let nextMode: AvatarMode;

      if (trimmedIncoming) {
        echoBootstrapRef.current = { done: false, value: null };
        nextAvatar = trimmedIncoming;
        nextMode = isAvatarPresetValue(trimmedIncoming) ? "echo" : "photo";
        setEchoPickedNote(false);
      } else {
        if (isFirstTime && ECHO_AVATAR_PRESETS.length > 0) {
          if (!echoBootstrapRef.current.done) {
            const pick =
              ECHO_AVATAR_PRESETS[
                Math.floor(Math.random() * ECHO_AVATAR_PRESETS.length)
              ];
            const presetVal = `${AVATAR_PRESET_PREFIX}${pick.id}`;
            echoBootstrapRef.current = { done: true, value: presetVal };
            nextAvatar = presetVal;
            nextMode = "echo";
            setEchoPickedNote(true);
          } else {
            nextAvatar = echoBootstrapRef.current.value ?? "";
            nextMode = isAvatarPresetValue(nextAvatar) ? "echo" : "photo";
          }
        } else {
          echoBootstrapRef.current = { done: false, value: null };
          nextAvatar = "";
          nextMode = "photo";
          setEchoPickedNote(false);
        }
      }

      const ig = data.instagram_url ?? "";
      const tt = data.tiktok_url ?? "";
      const tg = data.telegram_url ?? "";
      const priv = data.is_private ?? false;
      const soc = data.social_media_public ?? false;

      setDisplayName(displayNameV);
      setUsername(usernameV);
      setOrigUsername(origForAvailability);
      setBio(bioV);
      setAvatarUrl(nextAvatar);
      setAvatarMode(nextMode);
      setInstagramUrl(ig);
      setTiktokUrl(tt);
      setTelegramUrl(tg);
      setIsPrivate(priv);
      setSocialMediaPublic(soc);

      setBaselineFromValues({
        displayName: displayNameV,
        username: usernameV,
        bio: bioV,
        avatarUrl: nextAvatar,
        instagramUrl: ig,
        tiktokUrl: tt,
        telegramUrl: tg,
        isPrivate: priv,
        socialMediaPublic: soc,
      });
    },
    [isFirstTime, setBaselineFromValues],
  );

  useEffect(() => {
    if (!open) {
      baselineRef.current = null;
      return;
    }

    let cancelled = false;

    const run = async () => {
      setError(null);
      const snap = initialProfileDataRef.current;

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
        applyProfileRow({
          display_name: snap.display_name,
          username: snap.username,
          bio: snap.bio,
          avatar_url: snap.avatar_url,
          instagram_url: snap.instagram_url,
          tiktok_url: snap.tiktok_url,
          telegram_url: snap.telegram_url,
          is_private: snap.is_private,
          social_media_public: snap.social_media_public,
        });
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select(
            "display_name, username, bio, avatar_url, instagram_url, tiktok_url, telegram_url, member_no, is_private, social_media_public",
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
          applyProfileRow(data);
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
  }, [open, profileId, applyProfileRow, isFirstTime]);

  const isDirty = useCallback(() => {
    const b = baselineRef.current;
    if (!b) return false;
    return (
      displayName.trim() !== b.displayName.trim() ||
      username.trim() !== b.username.trim() ||
      bio.trim() !== b.bio.trim() ||
      (avatarUrl || "") !== (b.avatarUrl || "") ||
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
    avatarUrl,
    instagramUrl,
    tiktokUrl,
    telegramUrl,
    isPrivate,
    socialMediaPublic,
  ]);

  const skipPopstateRef = useRef(false);
  const isDirtyFnRef = useRef(isDirty);
  isDirtyFnRef.current = isDirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prevOpenRef = useRef(false);

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
      if (!isDirtyFnRef.current()) {
        onCloseRef.current();
        return;
      }
      setShowExitConfirm(true);
      window.history.pushState(
        { editProfileModal: true } as const,
        "",
        window.location.href,
      );
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

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

  const requestClose = useCallback(() => {
    if (!isDirty()) {
      onClose();
      return;
    }
    setShowExitConfirm(true);
  }, [isDirty, onClose]);

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

    // Prefer first word of display name (e.g. "John Smith" → "john"), then slugify
    const firstWord = name.trim().split(/\s+/)[0] ?? "";
    let baseUsername = firstWord.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!baseUsername) {
      // Fallback: full display name if first token has no usable latin chars
      baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    if (!baseUsername) return;

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
    try {
      // Required field validation
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

      // Username cooldown removed - users can change username anytime for now

      // Update profile (excluding privacy settings - handled separately)
      const patch: any = {
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim() || "I'm too lazy to write a bio 😅",
        avatar_url: avatarUrl,
        instagram_url: instagramUrl.trim() || null,
        tiktok_url: tiktokUrl.trim() || null,
        telegram_url: telegramUrl.trim() || null,
      };
      if (origUsername !== username.trim()) {
        patch.last_username_change_at = new Date().toISOString();
      }

      const { error: upErr } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", profileId);

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
          console.error("Error updating privacy settings:", privacyError.error);
          // Don't fail the save if privacy update fails, but log it
        }
      } catch (privacyErr) {
        console.error("Exception updating privacy settings:", privacyErr);
        // Don't fail the save if privacy update fails
      }

      // Mark as onboarded
      try {
        localStorage.setItem(`onboarded_${profileId}`, "1");
      } catch {}

      // Update local caches
      try {
        if (avatarUrl) localStorage.setItem("my_avatar_url", avatarUrl);
        if (displayName) localStorage.setItem("my_display_name", displayName);
        if (username) localStorage.setItem("my_username", username.trim());
      } catch {}

      const { getCachedProfile, setCachedProfile } = await import(
        "../../lib/profileCache"
      );

      const { data: updatedProfile } = await supabase
        .from("profiles")
        .select(
          "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public",
        )
        .eq("id", profileId)
        .maybeSingle();

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
          member_no: updatedProfile.member_no ?? null,
          is_private: updatedProfile.is_private ?? null,
          social_media_public: updatedProfile.social_media_public ?? null,
        };
      } else if (authUserId) {
        profilePayload = {
          id: profileId,
          user_id: authUserId,
          username: username.trim(),
          display_name: displayName.trim(),
          bio: bio.trim() || "I'm too lazy to write a bio 😅",
          avatar_url: avatarUrl,
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
        }
      }

      // Invalidate follow counts so OwnProfilePage won't show stale counts on first render
      clearCachedFollowCounts(profileId);

      window.dispatchEvent(
        new CustomEvent("profile:updated", {
          detail: { id: profileId, profile: profilePayload },
        }),
      );

      // Close the modal
      onClose();

      // DON'T navigate away - stay on profile page
      // If first time, call onComplete to trigger onboarding flow
      if (isFirstTime && onComplete) {
        onComplete();
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    displayName.trim() && username.trim() && usernameAvailable !== false;

  if (!open) return null;

  const avatarPreviewUrl = avatarDisplayUrl(avatarUrl);
  const echoPickerInteractive =
    avatarMode === "echo" && ECHO_AVATAR_PRESETS.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)]">
      <div className="flex flex-col h-full">
        {/* Header - fixed at top, gradient (solid at top → transparent) theme-aware, content scrolls behind */}
        <div
          className="fixed left-0 right-0 top-0 z-30 flex flex-col items-center pt-[calc(8px+env(safe-area-inset-top,0px))] pb-3 pointer-events-none"
          style={{
            minHeight: "calc(52px + 8px + env(safe-area-inset-top, 0px))",
            background: "var(--gradient-from-top)",
          }}
        >
          {/* Floating pill — create flow centers title; edit keeps title + Cancel */}
          <div
            className={[
              "relative z-10 flex w-[80%] max-w-[640px] items-center rounded-full",
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

        {/* Content - z-0 keeps scroll/composited children below fixed header/footer (z-30) */}
        <div className="relative z-0 flex-1 min-h-0 overflow-y-auto p-4 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-[calc(7rem+var(--safe-area-bottom-layout))]">
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

          {/* Profile image: single unified card (preview + toggle + Echo row) */}
          <div className="mb-6 w-full">
            {echoPickedNote && isFirstTime ? (
              <p className="mb-2.5 text-center text-[12px] leading-snug text-[var(--text)]/60">
                We picked an Echo for you — change it anytime.
              </p>
            ) : null}

            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  setError("Please choose an image file.");
                  return;
                }
                console.log(PROFILE_AVATAR_UPLOAD_LOG, "selection_ok", {
                  name: file.name,
                  bytes: file.size,
                  type: file.type,
                });
                setError(null);
                revokeAvatarCropObjectUrl();
                const url = URL.createObjectURL(file);
                avatarCropObjectUrlRef.current = url;
                setAvatarCropSrc(url);
                setAvatarCropOpen(true);
                (e.target as HTMLInputElement).value = "";
              }}
            />

            <div
              aria-busy={uploading}
              className={[
                "relative w-full overflow-hidden rounded-[34px] border border-[var(--border)] sm:rounded-[40px]",
                "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-sm",
              ].join(" ")}
            >
              {avatarPreviewUrl ? (
                <div
                  className="pointer-events-none absolute inset-0 rounded-[34px] sm:rounded-[40px]"
                  style={{
                    backgroundImage: `url(${avatarPreviewUrl})`,
                    backgroundSize: "240%",
                    backgroundPosition: "center",
                    filter: "blur(4px)",
                    opacity: 0.58,
                  }}
                  aria-hidden
                />
              ) : (
                <div
                  className="pointer-events-none absolute inset-0 rounded-[34px] bg-[var(--surface-2)]/30 sm:rounded-[40px]"
                  aria-hidden
                />
              )}
              {avatarPreviewUrl ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[1] rounded-[34px] sm:rounded-[40px]"
                  style={{
                    backgroundColor: "var(--profile-avatar-pill-scrim)",
                    opacity: 0.86,
                  }}
                  aria-hidden
                />
              ) : null}

              <div className="relative z-10 flex flex-col items-stretch px-2 pb-2 pt-7 sm:px-4 sm:pt-8">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    className="mx-auto mb-5 h-20 w-20 rounded-full border-2 border-[var(--text)]/85 object-cover shadow-sm"
                    alt=""
                  />
                ) : (
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--text)]/70 bg-black/15 text-xl font-medium text-[var(--text)]/90 shadow-sm">
                    ?
                  </div>
                )}

                <div
                  className={[
                    "self-center inline-flex max-w-[min(100%,296px)] gap-px rounded-full border-2 border-[var(--border)]",
                    "bg-[var(--surface-2)]/55 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                    "ring-1 ring-[var(--text)]/[0.07]",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className={[
                      "min-h-[30px] min-w-[7.75rem] flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-[31px]",
                      avatarMode === "photo"
                        ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm"
                        : "text-[var(--text)]/70 hover:bg-[var(--surface)]/40 hover:text-[var(--text)]/90",
                    ].join(" ")}
                    disabled={uploading}
                    onClick={() => {
                      setAvatarMode("photo");
                      avatarFileInputRef.current?.click();
                    }}
                  >
                    {uploading ? "Uploading…" : "Upload photo"}
                  </button>
                  <button
                    type="button"
                    className={[
                      "min-h-[30px] min-w-[7.75rem] flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-[31px]",
                      avatarMode === "echo"
                        ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-sm"
                        : "text-[var(--text)]/70 hover:bg-[var(--surface)]/40 hover:text-[var(--text)]/90",
                    ].join(" ")}
                    disabled={ECHO_AVATAR_PRESETS.length === 0 || uploading}
                    onClick={() => setAvatarMode("echo")}
                  >
                    Choose Echo
                  </button>
                </div>

                {/* Brand-tint fade — separates toggle from Echo row */}
                <div
                  role="presentation"
                  className="my-4 h-px w-full shrink-0 bg-gradient-to-r from-transparent via-[var(--brand)]/40 to-transparent"
                  aria-hidden
                />

                {ECHO_AVATAR_PRESETS.length > 0 ? (
                  <div
                    aria-disabled={!echoPickerInteractive}
                    className={[
                      "w-full min-w-0 shrink-0",
                      "rounded-[999px] border-2 border-[var(--border)]",
                      "bg-[var(--surface-2)]/42 p-1.5",
                      "backdrop-blur-[var(--glass-blur)] ring-1 ring-[var(--text)]/[0.06]",
                      echoPickerInteractive
                        ? "opacity-100"
                        : "pointer-events-none opacity-[0.42] saturate-[0.82]",
                    ].join(" ")}
                  >
                    {/*
                     * Outer p-1.5: even inset from rail border.
                     * Inner rounded + overflow-hidden masks scrollport so owls don’t shear on a vertical edge.
                     */}
                    <div className="min-w-0 overflow-hidden rounded-[999px]">
                      <div
                        className={[
                          "flex w-full min-w-0 items-center gap-1.5",
                          "min-h-[2.5rem] overflow-x-auto overflow-y-hidden rounded-[999px]",
                          "px-1.5 py-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]",
                        ].join(" ")}
                      >
                      {ECHO_AVATAR_PRESETS.map((preset) => {
                        const value = `${AVATAR_PRESET_PREFIX}${preset.id}`;
                        const selected =
                          isAvatarPresetValue(avatarUrl) && avatarUrl === value;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            disabled={!echoPickerInteractive}
                            aria-disabled={!echoPickerInteractive}
                            aria-label={`Echo ${preset.id}`}
                            aria-pressed={selected}
                            className={[
                              "relative h-[34px] w-[34px] shrink-0 rounded-full disabled:opacity-65",
                              "overflow-hidden transition-opacity",
                              "box-border outline-none",
                              selected
                                ? "border-2 border-[var(--brand)]"
                                : "border border-[var(--border)] opacity-92 hover:opacity-100",
                              echoPickerInteractive
                                ? ""
                                : "cursor-not-allowed hover:opacity-92",
                            ].join(" ")}
                            onClick={() => {
                              if (!echoPickerInteractive) return;
                              setAvatarUrl(value);
                            }}
                          >
                            <img
                              src={preset.url}
                              alt=""
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 pr-14 text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 pr-14 text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
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
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Bio
              </label>
              <div className="relative">
                <textarea
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 pb-7 pr-12 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
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

            {/* Social Media Links */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-3">
                Social Media Links
              </label>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--text)]/70">
                    Instagram URL
                  </label>
                  <div className="relative">
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 pr-16 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/yourusername"
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
                    TikTok URL
                  </label>
                  <div className="relative">
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 pr-16 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                      value={tiktokUrl}
                      onChange={(e) => setTiktokUrl(e.target.value)}
                      placeholder="https://tiktok.com/@yourusername"
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
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 pr-16 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                      value={telegramUrl}
                      onChange={(e) => setTelegramUrl(e.target.value)}
                      placeholder="@yourusername or https://t.me/yourusername"
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

            {/* Privacy Settings */}
            <div className="pt-4 border-t border-[var(--border)]">
              <label className="block text-sm font-medium text-[var(--text)] mb-3">
                Privacy
              </label>

              <div className="space-y-4">
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
              </div>
            </div>

            {/* Help & Support - Play Store compliance */}
            {!isFirstTime && (
              <div className="pt-4 mt-4 border-t border-[var(--border)]">
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
              <div className="pt-4 mt-4 border-t border-[var(--border)]">
                <label className="block text-sm font-medium text-[var(--text)] mb-3">
                  Danger zone
                </label>
                <p className="text-xs text-[var(--text)]/70 mb-3">
                  This will remove your profile from the app and sign you out.
                </p>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-4 py-2 rounded-lg border border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Delete Account
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer - fixed at bottom, gradient (solid at bottom → transparent) theme-aware */}
        <div
          className="fixed left-0 right-0 bottom-0 z-30 flex flex-col items-center pb-[calc(8px+var(--safe-area-bottom-layout))] pt-4 pointer-events-none"
          style={{ background: "var(--gradient-from-bottom)" }}
        >
          <div className="w-[80%] max-w-[640px] pointer-events-auto">
            <button
              className="w-full py-2.5 px-6 rounded-full bg-[var(--brand)] text-[var(--brand-ink)] font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              disabled={!canSave || saving}
              onClick={() => {
                if (!isFirstTime) {
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

      <AvatarCropModal
        open={avatarCropOpen}
        imageSrc={avatarCropSrc}
        onCancel={revokeAvatarCropObjectUrl}
        onConfirm={handleCroppedAvatarConfirm}
      />

      {/* Save Changes Confirmation */}
      <ConfirmDialog
        open={showSaveConfirm}
        onClose={() => !saving && setShowSaveConfirm(false)}
        onConfirm={async () => {
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

      <ConfirmDialog
        open={showExitConfirm}
        onClose={() => !saving && setShowExitConfirm(false)}
        onConfirm={async () => {
          setShowExitConfirm(false);
          await save();
        }}
        title="Leave without saving?"
        message="You have unsaved changes. Save now, keep editing, or discard and lose your changes."
        cancelLabel="Cancel"
        secondaryLabel="Discard"
        secondaryVariant="dangerSoft"
        onSecondary={() => {
          setShowExitConfirm(false);
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
        onClose={() => !isDeleting && setShowDeleteConfirm(false)}
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
    </div>
  );
}
