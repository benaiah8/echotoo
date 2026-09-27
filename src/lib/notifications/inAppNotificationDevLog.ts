/** DEV-only diagnostics for in-app notification banner / foreground push. */

export function devLogInAppNotification(
  tag: string,
  payload: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return;
  console.log(`[IN_APP_NOTIF] ${tag}`, payload);
}
