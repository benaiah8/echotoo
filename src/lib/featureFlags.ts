/**
 * Feature flags for reversible behavior changes.
 *
 * SKIP_WELCOME_ONBOARDING: When true, skip the welcome/onboarding screen
 * (Welcome user #, "where did you hear about us", Continue).
 * Users go straight to the app after profile creation.
 * Set to false to restore the onboarding flow.
 */
export const SKIP_WELCOME_ONBOARDING = true;

/**
 * Admin campaign push UI (PostMenu → send-admin-campaign-push Edge).
 * Reviewer-only; Edge still gates JWT + report_reviewers + published post.
 */
export const ENABLE_ADMIN_CAMPAIGN_PUSH_UI = true;

/**
 * Post Likes (heart on Post Detail sticky actions).
 * When false, hide post Like button/count in the UI only — services, tables,
 * and historical data remain intact. Set to true to restore.
 * Does not affect comment likes or invite/announcement interest controls.
 */
export const ENABLE_POST_LIKES = false;
