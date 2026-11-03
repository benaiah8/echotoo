/**
 * Caption `<p>` must not wrap a button (inline URL chips are buttons).
 * Ignore clicks that originate from those chips or any `<a>`.
 */
export function shouldDuoCaptionClickOpenPost(
  target: EventTarget | null
): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null;
  if (!node || typeof node.closest !== "function") return true;
  return !node.closest("a, button");
}
