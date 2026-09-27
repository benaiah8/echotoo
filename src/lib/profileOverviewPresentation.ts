/** Shared Profile overview (below-hero) presentation — vertical rhythm. */

export const PROFILE_OVERVIEW_IDENTITY_CLASS =
  "profile-overview-identity mt-4 flex w-full min-w-0 max-w-[22rem] flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 px-3";

export const PROFILE_OVERVIEW_NAME_CLASS =
  "min-w-0 max-w-full truncate text-[15px] font-semibold leading-none text-[var(--text)]";

export const PROFILE_OVERVIEW_USERNAME_CLASS =
  "min-w-0 max-w-[16rem] truncate text-xs leading-none text-[var(--text)]/60";

/** Finish cue under identity (~14px). */
export const PROFILE_OVERVIEW_COMPLETION_CUE_CLASS =
  "mt-3.5 flex w-full justify-center px-3";

export const PROFILE_OVERVIEW_BIO_WRAP_CLASS =
  "mt-3.5 w-full min-w-0 max-w-[36ch] px-3 text-center";

export const PROFILE_OVERVIEW_BIO_TEXT_CLASS =
  "profile-overview-bio text-[13px] leading-snug text-[var(--text)]/80";

/** Own Profile: below bio/social → stats (~20px). */
export const PROFILE_OVERVIEW_STATS_ROW_CLASS =
  "profile-overview-stats mx-auto mt-5 mb-0 flex items-end justify-center gap-1 overflow-visible px-0.5";

export const PROFILE_OVERVIEW_SOCIAL_LINKS_CLASS = "mt-3.5";

/** Other Profile: identity → Follow / bell (~16px). */
export const PROFILE_OVERVIEW_FOLLOW_ROW_CLASS =
  "mt-4 w-full flex justify-center";

/** Other Profile: Follow row → Following / Followers / Message tiles (~20px). */
export const PROFILE_OVERVIEW_OTHER_STATS_ROW_CLASS =
  "profile-overview-other-stats mx-auto mt-5 mb-0 flex items-end justify-center gap-2.5 overflow-visible px-0.5";

/**
 * Own: Created/Saved tab band.
 * Equal py on the pill row so space above/below matches between the two dividers.
 */
export const PROFILE_OVERVIEW_POSTS_TAB_BAND_CLASS =
  "flex flex-col items-center";

/**
 * Own: tabs → first post (~14px).
 * ProgressiveFeed wraps every Post in `.feed-item`, so `article:first-child`
 * would strip every card border. Scope to the first feed shell only.
 */
export const PROFILE_OVERVIEW_POSTS_FEED_CLASS =
  "pt-3.5 pb-4 [&_.feed-item-container>.feed-item:first-child_article]:border-t-0";

/** Other: stats → first Created post (~16px). Same first-card exception as Own. */
export const PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS =
  "pt-4 pb-4 [&_.feed-item-container>.feed-item:first-child_article]:border-t-0";

/** Overview section under fixed header — modest top pad (hero has its own clearance). */
export const PROFILE_OVERVIEW_SECTION_CLASS =
  "w-full max-w-full min-w-0 px-1.5 pt-1.5 pb-2";

export function hasProfileOverviewBio(bio: string | null | undefined): boolean {
  return Boolean(bio?.trim());
}
