/**
 * Tab-scoped refresh events. Listeners should no-op when that tab is not visible.
 */
export const HOME_TAB_REFRESH_EVENT = "echotoo:home-refresh";

/** Optional `detail` on {@link HOME_TAB_REFRESH_EVENT} — use to distinguish tab tap vs pull. */
export type HomeTabRefreshDetail = {
  source?: "home-tab" | "pull";
};
export const PROFILE_TAB_REFRESH_EVENT = "echotoo:profile-refresh";
export const NOTIFICATIONS_TAB_REFRESH_EVENT = "echotoo:notifications-refresh";
