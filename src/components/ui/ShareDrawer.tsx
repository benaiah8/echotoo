import { useState } from "react";
import { PiShareFat, PiUserPlus } from "react-icons/pi";
import InstagramStoryGenerator from "./InstagramStoryGenerator";
import BottomDrawer from "./BottomDrawer";
import toast from "react-hot-toast";
import { sharePost } from "../../api/services/shares";
import { getPublicShareBaseUrl } from "../../lib/publicSiteUrl";
import { postDetailPath } from "../../router/Paths";
import { shareUrl } from "../../lib/shareUrl";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";

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
 * Bottom sheet on `BottomDrawer`; actions sit in an inner panel matching
 * `FrostedCenterModal` / ConfirmDialog (`frostedModalPanelStyle` — --glass-bg, blur, border).
 * Invite is primary when `onInvite` is set; Share and Instagram Stories are secondary.
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

  const publicPostUrl = `${getPublicShareBaseUrl()}${postDetailPath(
    postType,
    postId
  )}`;

  const handleInvite = () => {
    if (onInvite) {
      onInvite();
      onClose();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicPostUrl);

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
      const title = `Check out this ${
        postType === "hangout" ? "hangout" : "experience"
      }`;
      const outcome = await shareUrl({ title, url: publicPostUrl });
      if (outcome === "dismissed") return;

      try {
        await sharePost(postId);
      } catch (shareError) {
        console.error("Error tracking share:", shareError);
      }

      if (outcome === "clipboard") {
        toast.success("Link copied to clipboard!");
      }
      onClose();
    } catch (error) {
      console.error("Error sharing:", error);
      handleCopyLink();
    }
  };

  return (
    <>
      <BottomDrawer
        open={isOpen}
        onClose={onClose}
        title="Invite & share"
        maxHeight="auto"
      >
        {/* Inner panel: same frosted shell as ConfirmDialog (see frostedModalPanelStyle) */}
        <div className="px-3 pt-0 pb-1 sm:px-4">
          <div
            className={`${frostedModalPanelClassName} flex flex-col gap-2`}
            style={frostedModalPanelStyle}
          >
            {onInvite ? (
              <button
                type="button"
                onClick={handleInvite}
                className="flex w-full min-h-11 items-center justify-center gap-2 rounded-full bg-yellow-500 px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-yellow-400 active:bg-yellow-500"
              >
                <PiUserPlus size={20} className="shrink-0" aria-hidden />
                Invite people
              </button>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleWebShare}
                className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)]/70 px-2 py-2 text-[11px] font-medium text-[var(--text)]/90 transition hover:bg-[var(--text)]/8 sm:text-xs"
              >
                <PiShareFat
                  size={16}
                  className="shrink-0 text-[var(--text)]/75"
                  aria-hidden
                />
                <span className="min-w-0 truncate whitespace-nowrap">
                  {typeof navigator.share === "function" || isNativeApp()
                    ? "Share"
                    : "Copy Link"}
                </span>
              </button>

              <button
                type="button"
                aria-label="Instagram Stories"
                onClick={() => {
                  setShowStoryGenerator(true);
                  onClose();
                }}
                className="relative flex min-h-10 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-full border border-pink-400/45 bg-[var(--surface-2)]/75 px-2 py-2 text-center text-[11px] font-medium text-[var(--text)]/90 shadow-[0_0_0_1px_rgba(168,85,247,0.12),0_0_18px_-6px_rgba(236,72,153,0.35)] transition before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-pink-500/14 before:via-fuchsia-500/10 before:to-amber-400/12 before:opacity-90 before:content-[''] hover:before:opacity-100 dark:border-pink-400/35 dark:shadow-[0_0_0_1px_rgba(192,132,252,0.15),0_0_20px_-8px_rgba(236,72,153,0.28)] sm:text-xs"
              >
                <span className="relative z-10 min-w-0 truncate whitespace-nowrap">
                  Instagram Stories
                </span>
              </button>
            </div>
          </div>
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
