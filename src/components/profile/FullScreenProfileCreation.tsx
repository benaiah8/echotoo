import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabaseClient";
import { uploadToCloudinary } from "../../api/services/cloudinaryUpload";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

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

const rotatingWords = [
  "fun",
  "wellness",
  "learning",
  "community",
  "connection",
];

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
  const [userNumber, setUserNumber] = useState<number>(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isWordVisible, setIsWordVisible] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [socialMediaPublic, setSocialMediaPublic] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    
    // Pre-populate immediately with initialProfileData if available (instant)
    if (initialProfileData) {
      console.log("[FullScreenProfileCreation] Using initial profile data for instant pre-population");
      setDisplayName(initialProfileData.display_name ?? "");
      setUsername(initialProfileData.username ?? "");
      setOrigUsername(initialProfileData.username ?? null);
      setBio(initialProfileData.bio ?? "");
      setAvatarUrl(initialProfileData.avatar_url ?? "");
      setInstagramUrl(initialProfileData.instagram_url ?? "");
      setTiktokUrl(initialProfileData.tiktok_url ?? "");
      setTelegramUrl(initialProfileData.telegram_url ?? "");
      setUserNumber(initialProfileData.member_no ?? 0);
      setIsPrivate(initialProfileData.is_private ?? false);
      setSocialMediaPublic(initialProfileData.social_media_public ?? false);
    }
    
    // Fetch fresh data in background to ensure we have the latest
    (async () => {
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select(
            "display_name, username, bio, avatar_url, instagram_url, tiktok_url, telegram_url, member_number, is_private, social_media_public"
          )
          .eq("id", profileId)
          .maybeSingle();
        
        if (fetchError) {
          console.error("[FullScreenProfileCreation] Error fetching profile data:", fetchError);
          // Don't show error to user if we have initialProfileData (they can still edit)
          if (!initialProfileData) {
            setError("Failed to load profile data. Please try again.");
          }
          return;
        }
        
        // Update with fresh data (only if different from initial data or if no initial data)
        if (data) {
          setDisplayName(data.display_name ?? "");
          setUsername(data.username ?? "");
          setOrigUsername(data.username ?? null);
          setBio(data.bio ?? "");
          setAvatarUrl(data.avatar_url ?? "");
          setInstagramUrl(data.instagram_url ?? "");
          setTiktokUrl(data.tiktok_url ?? "");
          setTelegramUrl(data.telegram_url ?? "");
          setUserNumber(data.member_number ?? 0);
          setIsPrivate(data.is_private ?? false);
          setSocialMediaPublic(data.social_media_public ?? false);
        }
      } catch (e) {
        console.error("[FullScreenProfileCreation] Unexpected error fetching profile:", e);
        if (!initialProfileData) {
          setError("Failed to load profile data. Please try again.");
        }
      }
    })();
  }, [open, profileId, initialProfileData]);

  // Word rotation effect
  useEffect(() => {
    if (!isFirstTime) return;

    const interval = setInterval(() => {
      setIsWordVisible(false);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
        setIsWordVisible(true);
      }, 300);
    }, 2000);

    return () => clearInterval(interval);
  }, [isFirstTime]);

  // Auto-generate username from display name on first time
  useEffect(() => {
    if (isFirstTime && displayName.trim() && !username.trim()) {
      generateUsernameFromDisplayName(displayName.trim());
    }
  }, [displayName, isFirstTime, username]);

  const generateUsernameFromDisplayName = async (name: string) => {
    if (!name) return;

    // Create base username from display name (lowercase, no spaces, only alphanumeric)
    const baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, "");
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
  }, [username]);

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
      const { updateProfilePrivacy } = await import("../../api/services/follows");
      try {
        const privacyError = await updateProfilePrivacy(profileId, isPrivate, socialMediaPublic);
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

      // [OPTIMIZATION: Phase 1 - Cache] Update cache immediately with new data (prevents "Sign in" message)
      // Why: Shows updated profile data instantly, including privacy settings, without flicker
      const { setCachedProfile } = await import("../../lib/profileCache");
      const { getViewerId } = await import("../../api/services/follows");
      const viewerId = await getViewerId();
      
      if (viewerId) {
        // Fetch the updated profile to get all fields (including xp, member_no, privacy settings, etc.)
        const { data: updatedProfile } = await supabase
          .from("profiles")
          .select("id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public")
          .eq("id", profileId)
          .single();
        
        if (updatedProfile) {
          // [OPTIMIZATION: Phase 1 - Cache] Update cache immediately with fresh data including privacy settings
          // Why: Instant display of updated privacy status, prevents flicker
          setCachedProfile({
            ...updatedProfile,
            member_no: updatedProfile.member_no ?? null,
            is_private: updatedProfile.is_private ?? null,
            social_media_public: updatedProfile.social_media_public ?? null,
          } as any);
          
          // Update avatar cache
          const { setCachedAvatar, preloadAvatar } = await import("../../lib/avatarCache");
          if (updatedProfile.avatar_url) {
            setCachedAvatar(updatedProfile.user_id, updatedProfile.avatar_url);
            preloadAvatar(updatedProfile.avatar_url);
          }
        }
      }

      // Tell the rest of the app to refresh this profile
      window.dispatchEvent(
        new CustomEvent("profile:updated", { detail: { id: profileId } })
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
        {/* Header */}
        <div className="flex items-center justify-center p-4 border-b border-[var(--border)] relative">
          <div className="text-lg font-semibold">
            {isFirstTime ? "Create Your Profile" : "Edit Profile"}
          </div>
          {!isFirstTime && (
            <button
              className="absolute right-4 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
              onClick={onClose}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Welcome Message for First Time Users */}
          {isFirstTime && (
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold mb-2">Welcome!</h1>
              <div className="text-sm text-[var(--text)]/80">
                The only place you need when you go out
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Avatar Section */}
          <div className="mb-6">
            <div className="flex items-center justify-center mb-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  className="w-20 h-20 rounded-full object-cover border-2 border-[var(--text)]"
                  alt=""
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-white/12 flex items-center justify-center text-2xl border-2 border-[var(--text)]">
                  ?
                </div>
              )}
            </div>

            <div className="flex justify-center">
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
                  if (file.size > 5 * 1024 * 1024) {
                    setError("Max image size is 5MB.");
                    return;
                  }
                  setError(null);
                  setUploading(true);
                  try {
                    const url = await uploadToCloudinary(file);
                    setAvatarUrl(url);
                  } catch (err: any) {
                    setError(err?.message || "Upload failed.");
                  } finally {
                    setUploading(false);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
              <label
                htmlFor="avatar-input"
                className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer hover:bg-[var(--surface-2)]/90 transition"
              >
                {uploading ? "Uploading..." : "Change Photo"}
              </label>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Display Name - Required */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Display Name *
              </label>
              <input
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                  className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                      isPrivate
                        ? "bg-[var(--brand)]"
                        : "bg-[var(--text)]/20"
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
                      {isPrivate ? "Show Social Media Links" : "Show Social Media Links"}
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
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <button
            className="w-full py-3 rounded-lg bg-[var(--brand)] text-[var(--brand-ink)] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            disabled={!canSave || saving}
            onClick={() => {
              if (!isFirstTime) {
                setShowSaveConfirm(true);
              } else {
                save(); // No confirmation for first-time users
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
      
      {/* Save Confirmation Modal */}
      {showSaveConfirm && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-[var(--surface)]/80"
            onClick={() => setShowSaveConfirm(false)}
          />
          <div className="relative bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 max-w-sm w-full mx-4 z-[61]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
              Save Changes?
            </h3>
            <p className="text-sm text-[var(--text)]/70 mb-4">
              Are you sure you want to save these changes to your profile?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSaveConfirm(false);
                  save();
                }}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
