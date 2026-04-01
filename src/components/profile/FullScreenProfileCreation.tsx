import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ConfirmDialog from "../ui/ConfirmDialog";
import { softDeleteAccount } from "../../api/services/account";
import { clearAuthCache } from "../../api/services/follows";
import { clearCachedProfile } from "../../lib/profileCache";
import { clearCachedFollowCounts } from "../../lib/followCountsCache";
import { imgUrlPublic } from "../../lib/img";
import { getSupportMailto } from "../../lib/supportConfig";
import { uploadImage } from "../../api/services/mediaUpload";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

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
  const [uploading, setUploading] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [socialMediaPublic, setSocialMediaPublic] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      const usernameV = data.username ?? "";
      const bioV = data.bio ?? "";
      const avatarV = data.avatar_url ?? "";
      const ig = data.instagram_url ?? "";
      const tt = data.tiktok_url ?? "";
      const tg = data.telegram_url ?? "";
      const priv = data.is_private ?? false;
      const soc = data.social_media_public ?? false;

      setDisplayName(displayNameV);
      setUsername(usernameV);
      setOrigUsername(data.username ?? null);
      setBio(bioV);
      setAvatarUrl(avatarV);
      setInstagramUrl(ig);
      setTiktokUrl(tt);
      setTelegramUrl(tg);
      setIsPrivate(priv);
      setSocialMediaPublic(soc);

      setBaselineFromValues({
        displayName: displayNameV,
        username: usernameV,
        bio: bioV,
        avatarUrl: avatarV,
        instagramUrl: ig,
        tiktokUrl: tt,
        telegramUrl: tg,
        isPrivate: priv,
        socialMediaPublic: soc,
      });
    },
    [setBaselineFromValues]
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
            "display_name, username, bio, avatar_url, instagram_url, tiktok_url, telegram_url, member_no, is_private, social_media_public"
          )
          .eq("id", profileId)
          .maybeSingle();

        if (cancelled) return;

        if (fetchError) {
          console.error(
            "[FullScreenProfileCreation] Error fetching profile data:",
            fetchError
          );
          if (!snap) {
            setError("Failed to load profile data. Please try again.");
          }
          return;
        }

        if (data) {
          applyProfileRow(data);
        }
      } catch (e) {
        console.error(
          "[FullScreenProfileCreation] Unexpected error fetching profile:",
          e
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
  }, [open, profileId, applyProfileRow]);

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
      window.location.href
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
        window.location.href
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

  // Auto-generate username from display name on first time
  useEffect(() => {
    if (isFirstTime && displayName.trim() && !username.trim()) {
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
          socialMediaPublic
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
          "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
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
        })
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
          {/* Floating pill */}
          <div className="relative z-10 flex items-center justify-between w-[80%] max-w-[640px] rounded-full bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border border-[var(--bottom-tab-border)] py-[10px] px-4 pointer-events-auto">
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

          {/* Avatar Section — entire card triggers the same file picker as before */}
          <div className="mb-6 flex justify-center">
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
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
                setUploading(true);
                try {
                  // Get userId from session for uploadImage
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (!session?.user?.id) {
                    throw new Error("User not authenticated");
                  }
                  console.log(PROFILE_AVATAR_UPLOAD_LOG, "upload_start", {
                    userId: session.user.id,
                    bytes: file.size,
                  });
                  const result = await uploadImage(file, {
                    userId: session.user.id,
                    kind: "avatar",
                  });
                  setAvatarUrl(result);
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
                } finally {
                  setUploading(false);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            <label
              htmlFor="avatar-input"
              aria-busy={uploading}
              className="relative flex w-full max-w-[min(320px,92vw)] cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-full border border-[var(--glass-active-border)] px-8 py-5 shadow-[var(--glass-active-shadow)] transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.99] focus-within:ring-2 focus-within:ring-[var(--brand)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)]"
            >
              {/* Same “mirror” treatment as BottomTab active profile pill */}
              {imgUrlPublic(avatarUrl) ? (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    backgroundImage: `url(${imgUrlPublic(avatarUrl)})`,
                    backgroundSize: "250%",
                    backgroundPosition: "center",
                    filter: "blur(4px)",
                    opacity: 0.88,
                  }}
                  aria-hidden
                />
              ) : (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full bg-[var(--bottom-tab-active-bg)]"
                  aria-hidden
                />
              )}
              {imgUrlPublic(avatarUrl) && (
                <div
                  className="pointer-events-none absolute inset-0 z-[1] rounded-full"
                  style={{
                    backgroundColor: "var(--profile-avatar-pill-scrim)",
                  }}
                  aria-hidden
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                {imgUrlPublic(avatarUrl) ? (
                  <img
                    src={imgUrlPublic(avatarUrl)!}
                    className="pointer-events-none h-20 w-20 rounded-full border-2 border-[var(--text)] object-cover shadow-md"
                    alt=""
                  />
                ) : (
                  <div className="pointer-events-none flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--text)] bg-white/12 text-2xl shadow-md">
                    ?
                  </div>
                )}
                <span className="text-sm font-medium text-[var(--text)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                  {uploading ? "Uploading..." : "Change photo"}
                </span>
              </div>
            </label>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Display Name - Required */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Display Name *
              </label>
              <input
                className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                required
              />
            </div>

            {/* Username - Required */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Username *
              </label>
              <div className="relative">
                <input
                  className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  required
                />
                {usernameChecking && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[var(--text)]/30 border-t-[var(--text)] rounded-full animate-spin" />
                  </div>
                )}
                {usernameAvailable === true && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400">
                    ✓
                  </div>
                )}
                {usernameAvailable === false && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-400">
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
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Bio
              </label>
              <textarea
                className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] resize-none"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={160}
                placeholder="I'm too lazy to write a bio 😅"
              />
            </div>

            {/* Social Media Links */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-3">
                Social Media Links
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[var(--text)]/70 mb-1">
                    Instagram URL
                  </label>
                  <input
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="https://instagram.com/yourusername"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--text)]/70 mb-1">
                    TikTok URL
                  </label>
                  <input
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    placeholder="https://tiktok.com/@yourusername"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--text)]/70 mb-1">
                    Telegram
                  </label>
                  <input
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    value={telegramUrl}
                    onChange={(e) => setTelegramUrl(e.target.value)}
                    placeholder="@yourusername or https://t.me/yourusername"
                    maxLength={100}
                  />
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
            const result = await softDeleteAccount();
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
