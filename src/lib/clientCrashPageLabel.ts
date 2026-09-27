import { isPostDetailRoutePath } from "./inviteOverlayHistory";

/** Stable area label for crash reports — no usernames or IDs. */
export function clientCrashPageLabel(pathname: string | null | undefined): string {
  const raw = (pathname ?? "").trim() || "/";
  const path = raw.split("?")[0]?.split("#")[0] || "/";
  const normalized = path.replace(/\/+$/, "") || "/";

  if (normalized === "/" || normalized === "/games") return "Feed";
  if (normalized === "/people") return "People";
  if (normalized === "/messages" || normalized.startsWith("/messages/")) {
    return "Messages";
  }
  if (
    normalized === "/u/me" ||
    normalized === "/profile" ||
    normalized === "/me"
  ) {
    return "Profile";
  }
  if (normalized.startsWith("/u/")) return "Profile";
  if (isPostDetailRoutePath(normalized) || isPostDetailRoutePath(`${normalized}/`)) {
    return "Post Detail";
  }
  if (normalized === "/create" || normalized.startsWith("/create/")) {
    return "Create";
  }
  if (normalized === "/notifications") return "Notifications";
  if (normalized === "/internal" || normalized.startsWith("/internal/")) {
    return "Admin";
  }
  if (
    normalized === "/privacy" ||
    normalized === "/terms" ||
    normalized === "/community-guidelines" ||
    normalized === "/child-safety" ||
    normalized === "/account-deletion" ||
    normalized === "/delete-account" ||
    normalized === "/reporting" ||
    normalized === "/support" ||
    normalized === "/safety"
  ) {
    return "Policy";
  }

  return "Other";
}
