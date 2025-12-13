import { useState } from "react";
import { MdShare, MdContentCopy } from "react-icons/md";
import toast from "react-hot-toast";

interface ShareProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileUrl: string;
  profileName?: string | null;
}

export default function ShareProfileModal({
  isOpen,
  onClose,
  profileUrl,
  profileName,
}: ShareProfileModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success("Profile link copied to clipboard!");
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Error copying link:", error);
      toast.error("Failed to copy link");
    }
  };

  const handleWebShare = async () => {
    try {
      const shareData = {
        title: profileName
          ? `Check out ${profileName}'s profile`
          : "Check out this profile",
        url: profileUrl,
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        onClose();
      } else {
        // Fallback to copy
        handleCopyLink();
      }
    } catch (error) {
      console.error("Error sharing:", error);
      // Fallback to copy
      handleCopyLink();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--surface)]/60" />

      {/* Modal - matching FollowListDrawer style */}
      <div
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)] p-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - matching FollowListDrawer */}
        <div className="flex items-center justify-between pb-2">
          <div className="text-sm font-semibold text-[var(--text)]">
            Share Profile
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text)]/70 hover:text-[var(--text)] transition"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* Profile URL Display - smaller and simpler */}
        <div className="mb-3 p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text)]/60 break-all">{profileUrl}</p>
        </div>

        {/* Share Options - side by side */}
        <div className="flex gap-2">
          {/* Copy Link Button - Yellow */}
          <button
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90 transition font-semibold text-xs"
          >
            <MdContentCopy size={16} />
            <span>{copied ? "Copied!" : "Copy Link"}</span>
          </button>

          {/* Web Share / Share Button - Border only */}
          <button
            onClick={handleWebShare}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)] transition font-semibold text-xs"
          >
            <MdShare size={16} />
            <span>{typeof navigator.share === "function" ? "Share" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

