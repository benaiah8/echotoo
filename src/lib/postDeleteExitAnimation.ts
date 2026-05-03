/** Exit animation before removing a post from feed lists (matches CSS duration). */
export const POST_DELETE_EXIT_MS = 280;

export function getPostDeleteExitDurationMs(): number {
  if (typeof window === "undefined") return POST_DELETE_EXIT_MS;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 0;
    }
  } catch {
    /* ignore */
  }
  return POST_DELETE_EXIT_MS;
}
