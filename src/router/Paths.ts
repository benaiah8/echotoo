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
  /** People tab: compact social-planning source list. */
  people: "/people",
  /** Persistent messages inbox tab. */
  messages: "/messages",
  /** Full-screen conversation overlay over the Messages inbox tab. */
  messagesConversation: "/messages/:conversationId",
  /** DEV-only launcher to open/create a DM (not in bottom nav). */
  devOpenDm: "/dev/open-dm",
  /** DEV-only Mine portrait stack depth/shadow preview. */
  devMinePortraitStack: "/dev/mine-portrait-stack",
  /** Reviewer-only internal landing (links to reports, app updates, etc.). */
  internal: "/internal",
  /** Reviewer-only report queue (not in bottom nav; RLS + allowlist). */
  internalReports: "/internal/reports",
  /** Reviewer-only app updates / release tooling (same allowlist as reports). */
  internalAppUpdates: "/internal/app-updates",
  /** Reviewer-only company announcements (same allowlist as reports). */
  internalCompanyAnnouncements: "/internal/company-announcements",
  /** Reviewer-only JS/React crash reports (same allowlist as reports). */
  internalCrashReports: "/internal/crash-reports",
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

/** True for `/messages/:conversationId`, not the inbox `/messages`. */
export function isMessagesConversationPath(pathname: string): boolean {
  if (!pathname) return false;
  return /^\/messages\/[^/]+\/?$/.test(pathname);
}

/** True for `/create` and nested create-flow steps (finalize, preview, etc.). */
export function isCreateFlowPath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === Paths.create || pathname.startsWith(`${Paths.create}/`)
  );
}

/** Path for an opened persistent DM conversation. */
export function messagesConversationPath(conversationId: string): string {
  return `/messages/${conversationId}`;
}

/** Messages → Requests deep link (Open Plan / stranger request inbox). */
export function messagesRequestsPath(requestId?: string): string {
  const params = new URLSearchParams();
  params.set("tab", "requests");
  const rid = requestId?.trim();
  if (rid) params.set("requestId", rid);
  return `${Paths.messages}?${params.toString()}`;
}

/** DM/group deep link; optional messageId query for future scroll/highlight. */
export function messagesConversationPathWithMessage(
  conversationId: string,
  messageId?: string
): string {
  const base = messagesConversationPath(conversationId);
  const mid = messageId?.trim();
  if (!mid) return base;
  const params = new URLSearchParams();
  params.set("messageId", mid);
  return `${base}?${params.toString()}`;
}

// Individual exports as requested
export const home = "/";
export const create = "/create";
export const notification = "/notifications";
export const profileMe = "/u/me";
