// src/router/Paths.ts
export const Paths = {
  home: "/",
  games: "/games", // [TAB ARCHITECTURE] Games tab
  create: "/create",
  createTitle: "/create/title",
  createActivities: "/create/activities",
  createCategories: "/create/categories",
  /** Phase 5A: merged final-step shell (caption + preview merge in progress). */
  createFinalize: "/create/finalize",
  preview: "/create/preview",
  experience: "/experience",
  experienceDetail: "/experience/:id",
  notification: "/notifications",
  profile: "/profile",
  createMap: "/create/map",
  feedTest: "/feed-test",
  /** Reviewer-only internal landing (links to reports, app updates, etc.). */
  internal: "/internal",
  /** Reviewer-only report queue (not in bottom nav; RLS + allowlist). */
  internalReports: "/internal/reports",
  /** Reviewer-only app updates / release tooling (same allowlist as reports). */
  internalAppUpdates: "/internal/app-updates",
  hangoutDetail: "/hangout/:id",

  // Profile routes
  user: "/u/:username",
  me: "/me",
  profileMe: "/u/me",

  // Policy & legal pages (linked from app and Google Play)
  privacy: "/privacy",
  terms: "/terms",
  communityGuidelines: "/community-guidelines",
  childSafety: "/child-safety",
  accountDeletion: "/account-deletion",
  deleteAccount: "/delete-account", // Google Play "Delete account URL"
  reporting: "/reporting",
  support: "/support",
  safety: "/safety",
} as const;

// Helper function for profile by username
export const profileByUsername = (username: string) => `/u/${username}`;

/** Public URL path for a published post (share / deep link). */
export function postDetailPath(
  type: "experience" | "hangout",
  id: string
): string {
  return type === "hangout" ? `/hangout/${id}` : `/experience/${id}`;
}

// Individual exports as requested
export const home = "/";
export const create = "/create";
export const notification = "/notifications";
export const profileMe = "/u/me";
