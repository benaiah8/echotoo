import type { Location } from "react-router-dom";
import type { FeedItem } from "../api/queries/getPublicFeed";

/**
 * Router `location.state` for post detail (modal overlay or full-page).
 * Keep in sync with navigations from feed `PostActions` and `PostDetailModal`.
 */
export type PostDetailNavigateState = {
  backgroundLocation?: Location;
  initialPost?: FeedItem;
  /**
   * Opened from feed comment control: gently scroll the comments section into view.
   * In PostDetailModal this does **not** focus the composer or open the keyboard.
   */
  scrollToComments?: boolean;
  /**
   * Opened from feed location pin: scroll the published V4 Location section into view.
   * Does not focus the comment composer.
   */
  scrollToLocation?: boolean;
  /**
   * @deprecated Prefer `scrollToComments`. Modal only: treated as scroll-to-comments (same as
   * `scrollToComments`); never used to auto-focus the composer. Full-page detail may still use
   * this for legacy auto-focus behavior via page props.
   */
  focusCommentComposer?: boolean;
  /** Explicit opt-in: programmatically focus the composer after open (modal; rare). */
  autoFocusCommentComposer?: boolean;
  /** Stable published media key (`video:{id}` / `image:{normalizedUrl}`) for slide handoff (PV3). */
  initialMediaKey?: string;
  /**
   * One-shot: after Detail mounts, open PublishedMediaFullscreenViewer for
   * `initialMediaKey` (Feed/Profile video expand). Consumed once in carousel;
   * must not reopen on close / rerender / orientation.
   */
  openImmersiveFullscreen?: boolean;
  /** Pass 3F: originating list surface for video-only playback handoff. */
  listPlaybackOrigin?: "feed" | "profile";
  /** Pass 3F: navigation session token; Detail consume must match. */
  listPlaybackHandoffSessionId?: number;
};
