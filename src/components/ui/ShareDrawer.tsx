import { useState } from "react";
import { PiInstagramLogo, PiShareFat, PiUserPlus } from "react-icons/pi";
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
 * Buttons: compact pill height (h-9), rounded-full.
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
        title="Share"
        maxHeight="auto"
      >
        {/* Inner panel: same frosted shell as ConfirmDialog (see frostedModalPanelStyle) */}
        <div className="px-3 pt-0 pb-1 sm:px-4">
          <div
            className={`${frostedModalPanelClassName} flex flex-col gap-2`}
            style={frostedModalPanelStyle}
          >
            <div
              className={`grid gap-2 ${onInvite ? "grid-cols-2" : "grid-cols-1"}`}
            >
              <button
                type="button"
                onClick={handleWebShare}
                className="flex h-9 min-h-9 flex-row items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]/80"
              >
                <PiShareFat size={18} className="shrink-0 text-[var(--text)]" />
                <span>
                  {typeof navigator.share === "function" || isNativeApp()
                    ? "Share"
                    : "Copy Link"}
                </span>
              </button>

              {onInvite && (
                <button
                  type="button"
                  onClick={handleInvite}
                  className="flex h-9 min-h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-yellow-500 px-3 text-xs font-semibold text-black transition hover:bg-yellow-600"
                >
                  <PiUserPlus size={18} className="shrink-0" />
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
              className="flex h-9 min-h-9 w-full flex-row items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 px-3 text-xs font-semibold text-white transition hover:from-purple-600 hover:to-pink-600"
            >
              <PiInstagramLogo size={18} className="shrink-0" />
              <span>Instagram Stories</span>
            </button>
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
