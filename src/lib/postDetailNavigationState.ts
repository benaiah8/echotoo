import type { Location } from "react-router-dom";
import type { FeedItem } from "../api/queries/getPublicFeed";

/**
 * Router `location.state` for post detail (modal overlay or full-page).
 * Keep in sync with navigations from feed `PostActions` and `PostDetailModal`.
 */
export type PostDetailNavigateState = {
  backgroundLocation?: Location;
  initialPost?: FeedItem;
  /** Opened from feed comment control: scroll to comments and focus composer when ready. */
  focusCommentComposer?: boolean;
};
