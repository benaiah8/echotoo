import { useState } from "react";
import { MdShare, MdClose, MdPersonAdd } from "react-icons/md";
import { FaInstagram } from "react-icons/fa";
import InstagramStoryGenerator from "./InstagramStoryGenerator";
import toast from "react-hot-toast";

interface ShareDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postType: "experience" | "hangout";
  caption: string | null;
  postImageUrl?: string | null;
  creatorName?: string;
  creatorHandle?: string;
  creatorAvatarUrl?: string | null;
  onInvite?: () => void; // NEW: callback for invite action
}

export default function ShareDrawer({
  isOpen,
  onClose,
  postId,
  postType,
  caption,
  postImageUrl,
  creatorName,
  creatorHandle,
  creatorAvatarUrl,
  onInvite,
}: ShareDrawerProps) {
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);

  if (!isOpen) return null;

  const handleInvite = () => {
    if (onInvite) {
      onInvite();
      onClose();
    }
  };

  const handleCopyLink = async () => {
    try {
      const postUrl = window.location.href;
      await navigator.clipboard.writeText(postUrl);
      toast.success("Link copied to clipboard!");
      onClose();
    } catch (error) {
      console.error("Error copying link:", error);
      toast.error("Failed to copy link");
    }
  };

  const handleWebShare = async () => {
    try {
      const postUrl = window.location.href;
      const shareData = {
        title: `Check out this ${postType === "hangout" ? "hangout" : "experience"}`,
        url: postUrl,
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
    <>
      <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={onClose}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" />

        {/* Drawer */}
        <div
          className="relative w-full max-w-md bg-[var(--bg)] rounded-t-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-bold text-[var(--text)]">Share</h2>
            <button
              onClick={onClose}
              className="p-2 text-[var(--text)]/60 hover:text-[var(--text)] transition"
            >
              <MdClose size={24} />
            </button>
          </div>

          {/* Share Options */}
          <div className="p-4">
            <div className="flex gap-4">
              {/* Instagram Stories - Large button on left */}
              <button
                onClick={() => setShowStoryGenerator(true)}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition text-white flex-1"
              >
                <FaInstagram size={32} />
                <span className="font-semibold text-sm">Instagram Stories</span>
              </button>

              {/* Share and Invite - Stacked on right */}
              <div className="flex flex-col gap-2 flex-1">
                {/* Share button */}
                <button
                  onClick={handleWebShare}
                  className="flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 transition border border-[var(--border)]"
                >
                  <MdShare size={24} className="text-[var(--text)]" />
                  <span className="font-semibold text-xs text-[var(--text)]">
                    {typeof navigator.share === "function" ? "Share" : "Copy Link"}
                  </span>
                </button>

                {/* Invite button */}
                {onInvite && (
                  <button
                    onClick={handleInvite}
                    className="flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-xl bg-yellow-500 hover:bg-yellow-600 transition text-black"
                  >
                    <MdPersonAdd size={24} />
                    <span className="font-semibold text-xs">Invite</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instagram Story Generator */}
      {showStoryGenerator && (
        <InstagramStoryGenerator
          caption={caption || `Check out this ${postType}!`}
          postImageUrl={postImageUrl}
          postId={postId}
          postType={postType}
          creatorName={creatorName}
          creatorHandle={creatorHandle}
          creatorAvatarUrl={creatorAvatarUrl}
          onClose={() => setShowStoryGenerator(false)}
        />
      )}
    </>
  );
}

