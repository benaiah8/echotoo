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
   * @deprecated Prefer `scrollToComments`. Modal only: treated as scroll-to-comments (same as
   * `scrollToComments`); never used to auto-focus the composer. Full-page detail may still use
   * this for legacy auto-focus behavior via page props.
   */
  focusCommentComposer?: boolean;
  /** Explicit opt-in: programmatically focus the composer after open (modal; rare). */
  autoFocusCommentComposer?: boolean;
};
