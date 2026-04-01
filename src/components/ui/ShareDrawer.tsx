import { useState } from "react";
import { PiInstagramLogo, PiShareFat, PiUserPlus } from "react-icons/pi";
import InstagramStoryGenerator from "./InstagramStoryGenerator";
import BottomDrawer from "./BottomDrawer";
import toast from "react-hot-toast";
import { sharePost } from "../../api/services/shares";

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
  /** Hangout meta for story date line */
  selectedDates?: string[] | null;
  isRecurring?: boolean | null;
  recurrenceDays?: string[] | null;
}

/**
 * [PHASE 3.1] Migrated to BottomDrawer for consistency and proper z-index
 * Why: Fixes z-index issue (was z-[90], now z-[100]), matches RSVPListDrawer pattern
 * Features: Frosted glass styling, proper backdrop, safe area handling
 */
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
  selectedDates,
  isRecurring,
  recurrenceDays,
}: ShareDrawerProps) {
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);

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

      // Track share when link is copied successfully
      try {
        await sharePost(postId);
      } catch (shareError) {
        // Fail silently - don't break copy action if share tracking fails
        console.error("Error tracking share:", shareError);
      }

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
        title: `Check out this ${
          postType === "hangout" ? "hangout" : "experience"
        }`,
        url: postUrl,
      };

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);

        // Track share when Web Share API succeeds
        try {
          await sharePost(postId);
        } catch (shareError) {
          // Fail silently - don't break share action if share tracking fails
          console.error("Error tracking share:", shareError);
        }

        onClose();
      } else {
        // Fallback to copy
        handleCopyLink();
      }
    } catch (error) {
      // User cancelled share - don't track
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error sharing:", error);
      // Fallback to copy
      handleCopyLink();
    }
  };

  return (
    <>
      <BottomDrawer
        open={isOpen}
        onClose={onClose}
        title="Share"
        maxHeight="auto"
      >
        {/* Compact rows; pt/pb so actions breathe below header and above drawer bottom (drawer adds safe area + 1rem) */}
        <div className="flex flex-col gap-2 px-5 pt-3 pb-6 sm:px-6">
          <div
            className={`grid gap-2 ${onInvite ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <button
              type="button"
              onClick={handleWebShare}
              className="flex min-h-11 flex-row items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]/80"
            >
              <PiShareFat size={20} className="shrink-0 text-[var(--text)]" />
              <span>
                {typeof navigator.share === "function" ? "Share" : "Copy Link"}
              </span>
            </button>

            {onInvite && (
              <button
                type="button"
                onClick={handleInvite}
                className="flex min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-yellow-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-yellow-600"
              >
                <PiUserPlus size={20} className="shrink-0" />
                <span>Invite</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowStoryGenerator(true);
              onClose();
            }}
            className="flex min-h-11 w-full flex-row items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 px-3 py-2 text-sm font-semibold text-white transition hover:from-purple-600 hover:to-pink-600"
          >
            <PiInstagramLogo size={20} className="shrink-0" />
            <span>Instagram Stories</span>
          </button>
        </div>
      </BottomDrawer>

      {/* Instagram Story Generator - Renders outside BottomDrawer so it can appear on top if needed */}
      {showStoryGenerator && (
        <InstagramStoryGenerator
          caption={caption || `Check out this ${postType}!`}
          postImageUrl={postImageUrl}
          postId={postId}
          postType={postType}
          creatorName={creatorName}
          creatorHandle={creatorHandle}
          creatorAvatarUrl={creatorAvatarUrl}
          selectedDates={selectedDates}
          isRecurring={isRecurring}
          recurrenceDays={recurrenceDays}
          onClose={() => setShowStoryGenerator(false)}
          onImageGenerated={async () => {
            const { error } = await sharePost(postId);
            if (error) {
              // RLS / auth — do not block UX; fix policy on `post_shares` if counts should track
              console.warn("[ShareDrawer] post_shares not recorded:", error);
            }
          }}
        />
      )}
    </>
  );
}
