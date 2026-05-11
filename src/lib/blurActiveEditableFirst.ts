function isKeyboardEditable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;

  const input = el as HTMLInputElement;
  const nonKeyboardTypes = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ]);
  return !nonKeyboardTypes.has(input.type);
}

export function blurActiveEditableFirst(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!isKeyboardEditable(active)) return false;
  active.blur();
  return true;
}
