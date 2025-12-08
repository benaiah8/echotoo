import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { uploadToCloudinary } from "../../api/services/cloudinaryUpload";

type Props = {
  open: boolean;
  onClose: () => void;
  profileId: string;
};

export default function EditProfileModal({ open, onClose, profileId }: Props) {
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

  useEffect(() => {
    if (!open) return;
    (async () => {
      setError(null);
      const { data } = await supabase
        .from("profiles")
        .select(
          "display_name, username, bio, avatar_url, instagram_url, tiktok_url, telegram_url"
        )
        .eq("id", profileId)
        .maybeSingle();
      setDisplayName(data?.display_name ?? "");
      setUsername(data?.username ?? "");
      setOrigUsername(data?.username ?? null);
      setBio(data?.bio ?? "");
      setAvatarUrl(data?.avatar_url ?? "");
      setInstagramUrl(data?.instagram_url ?? "");
      setTiktokUrl(data?.tiktok_url ?? "");
      setTelegramUrl(data?.telegram_url ?? "");
    })();
  }, [open, profileId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // 1) Username uniqueness (case-insensitive)
      if (!username.trim()) throw new Error("Username is required.");
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", username.trim())
        .neq("id", profileId)
        .limit(1);

      if ((taken?.length ?? 0) > 0) {
        throw new Error("That username is already taken.");
      }

      // 2) Username cooldown (60 days)
      if (origUsername && origUsername !== username.trim()) {
        const { data: me } = await supabase
          .from("profiles")
          .select("last_username_change_at")
          .eq("id", profileId)
          .maybeSingle();
        const last = me?.last_username_change_at
          ? new Date(me.last_username_change_at)
          : null;
        const now = new Date();
        const daysSince = last
          ? (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
          : 999;

        if (daysSince < 60) {
          const left = Math.ceil(60 - daysSince);
          throw new Error(
            `You can change your username again in ~${left} day(s).`
          );
        }
      }

      // 3) Update
      const patch: any = {
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim(),
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
      onClose();

      // Mark as onboarded so /u/me does not reopen the modal after saving
      try {
        localStorage.setItem(`onboarded_${profileId}`, "1");
      } catch {}

      // Update local caches used by BottomTab (do this before we broadcast)
      try {
        if (avatarUrl) localStorage.setItem("my_avatar_url", avatarUrl);
        if (displayName) localStorage.setItem("my_display_name", displayName);
        if (username) localStorage.setItem("my_username", username.trim());
      } catch {}

      // Tell the rest of the app to refresh this profile (ProfilePage listener will refetch)
      window.dispatchEvent(
        new CustomEvent("profile:updated", { detail: { id: profileId } })
      );

      // Scrub ?edit=1 and soft-refresh (data will re-fetch via listeners)
      setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("edit");
          const clean =
            url.pathname +
            (url.searchParams.toString() ? `?${url.searchParams}` : "");
          window.history.replaceState({}, "", clean);
        } catch {}
        // If you prefer a hard reload instead, uncomment:
        // window.location.reload();
      }, 0);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[var(--surface)]/60"
        onClick={onClose}
      />
      <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Edit profile</div>
          <button className="text-xs text-[var(--text)]/70" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="mb-3 text-[12px] text-red-300">{error}</div>}

        {/* Avatar row */}
        <div className="flex items-center justify-between rounded-xl p-3 border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-3">
            {/* preview */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                className="w-12 h-12 rounded-full object-cover"
                alt=""
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/12 flex items-center justify-center text-sm">
                ?
              </div>
            )}
            <div className="text-xs text-[var(--text)]/70">
              Profile photo
              {uploading && <span className="ml-2 opacity-70">Uploading…</span>}
            </div>
          </div>

          {/* button + hidden input */}
          <div>
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
                  // Cloudinary helper should return a URL string (adjust if your API differs)
                  const url = await uploadToCloudinary(file);
                  setAvatarUrl(url);
                } catch (err: any) {
                  setError(err?.message || "Upload failed.");
                } finally {
                  setUploading(false);
                  // reset input so selecting the same file again still triggers change
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            <label
              htmlFor="avatar-input"
              className="px-3 py-1.5 rounded-xl text-xs border border-[var(--border)] bg-[var(--surface)] cursor-pointer"
            >
              Change photo
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs text-[var(--text)]/70">
            Display name
            <input
              className="ui-input mt-1 font-medium"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
          </label>

          <label className="text-xs text-[var(--text)]/70">
            Username
            <input
              className="ui-input mt-1 font-medium"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
            />
          </label>

          <label className="text-xs text-[var(--text)]/70">
            Bio
            <textarea
              className="ui-input mt-1"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={160}
              placeholder="something something bio something! 🎉"
            />
          </label>

          {/* Social Media Links */}
          <div className="mt-2">
            <div className="text-xs text-[var(--text)]/70 mb-2">
              Social Media Links
            </div>

            <label className="text-xs text-[var(--text)]/70">
              Instagram URL
              <input
                className="ui-input mt-1"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://instagram.com/yourusername"
                maxLength={100}
              />
            </label>

            <label className="text-xs text-[var(--text)]/70">
              TikTok URL
              <input
                className="ui-input mt-1"
                value={tiktokUrl}
                onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://tiktok.com/@yourusername"
                maxLength={100}
              />
            </label>

            <label className="text-xs text-[var(--text)]/70">
              Telegram
              <input
                className="ui-input mt-1"
                value={telegramUrl}
                onChange={(e) => setTelegramUrl(e.target.value)}
                placeholder="@yourusername or https://t.me/yourusername"
                maxLength={100}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="ui-btn flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ui-btn ui-btn--primary flex-1"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
