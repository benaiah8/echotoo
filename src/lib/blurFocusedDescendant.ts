/**
 * Scoped focus handoff: blur only if focus sits inside `root`.
 * Use before a tree becomes aria-hidden so no focused descendant remains.
 */

function canBlur(node: unknown): node is HTMLElement {
  return (
    !!node &&
    typeof node === "object" &&
    typeof (node as HTMLElement).blur === "function"
  );
}

/**
 * @returns true if an in-root focused element was blurred
 */
export function blurFocusedDescendant(
  root: HTMLElement | null | undefined,
): boolean {
  if (!root || typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!canBlur(active)) return false;
  if (active === root) {
    try {
      active.blur();
      return true;
    } catch {
      return false;
    }
  }
  if (!root.contains(active)) return false;
  try {
    active.blur();
    return true;
  } catch {
    return false;
  }
}
