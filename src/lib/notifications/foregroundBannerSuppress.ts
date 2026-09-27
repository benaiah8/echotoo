/**
 * Client-side guards for foreground push → in-app banner (no server presence).
 */
import { NOTIFICATION_KINDS, normalizeNotificationKind } from "./notificationKinds";

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Extract conversation id from normalized push route data. */
export function conversationIdFromRouteData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data || typeof data !== "object") return null;
  const id = asTrimmed(data.conversationId);
  return id || null;
}

/**
 * True when the user is already on the open DM thread — suppress in-app banner.
 */
export function shouldSuppressForegroundBannerForActiveThread(
  pathname: string,
  routeData: Record<string, unknown> | null | undefined
): boolean {
  const kind = normalizeNotificationKind(
    routeData && typeof routeData === "object" ? routeData.type : undefined
  );
  if (
    kind !== NOTIFICATION_KINDS.DM_MESSAGE &&
    kind !== NOTIFICATION_KINDS.GROUP_MESSAGE
  ) {
    return false;
  }

  const conversationId = conversationIdFromRouteData(routeData);
  if (!conversationId) return false;

  const prefix = "/messages/";
  if (!pathname.startsWith(prefix)) return false;

  const activeId = pathname.slice(prefix.length).split("/")[0]?.trim();
  return activeId === conversationId;
}
