import { useState } from "react";
import { PiCopy, PiShareFat } from "react-icons/pi";
import toast from "react-hot-toast";
import BottomDrawer from "../ui/BottomDrawer";

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

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(shareData)
      ) {
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
    <BottomDrawer
      open={isOpen}
      onClose={onClose}
      title="Share Profile"
      maxHeight="40vh"
    >
      {/* Profile URL Display - smaller and simpler */}
      <div className="mb-4 p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
        <p className="text-xs text-[var(--text)]/60 break-all">{profileUrl}</p>
      </div>

      {/* Share Options - side by side */}
      <div className="flex gap-2">
        {/* Copy Link Button - Yellow */}
        <button
          onClick={handleCopyLink}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90 transition font-semibold text-xs"
        >
          <PiCopy size={16} />
          <span>{copied ? "Copied!" : "Copy Link"}</span>
        </button>

        {/* Web Share / Share Button - Border only */}
        <button
          onClick={handleWebShare}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)] transition font-semibold text-xs"
        >
          <PiShareFat size={16} />
          <span>
            {typeof navigator.share === "function" ? "Share" : "Copy"}
          </span>
        </button>
      </div>
    </BottomDrawer>
  );
}
