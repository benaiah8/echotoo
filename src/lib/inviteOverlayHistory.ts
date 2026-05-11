/**
 * Synthetic history markers for invite overlays (browser Back + cleanup symmetry).
 * Post detail routes use {@link isPostDetailRoutePath} so invite handlers stay off-stack
 * while PostDetailModal is active.
 */

export const INVITE_OVERLAY_HISTORY = {
  personalChat: "invitePersonalChat",
  groupChat: "inviteGroupChat",
  groupParticipants: "inviteGroupParticipants",
  echoModal: "inviteEchoModal",
} as const;

export type InviteOverlayHistoryMarker =
  (typeof INVITE_OVERLAY_HISTORY)[keyof typeof INVITE_OVERLAY_HISTORY];

export function isPostDetailRoutePath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    /^\/experience\/[^/]+\/?$/.test(pathname) ||
    /^\/hangout\/[^/]+\/?$/.test(pathname)
  );
}
