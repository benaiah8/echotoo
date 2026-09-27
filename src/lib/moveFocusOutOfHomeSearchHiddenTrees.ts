/**
 * Before Home search hides browse (aria-hidden/inert) and bottom-tab chrome,
 * move focus to the search field when it still sits in those trees.
 * Prevents Chrome "Blocked aria-hidden … descendant retained focus".
 */

function isElementLike(node: unknown): node is Element {
  return (
    !!node &&
    typeof node === "object" &&
    typeof (node as Element).closest === "function"
  );
}

function canFocus(node: unknown): node is HTMLElement {
  return (
    !!node &&
    typeof node === "object" &&
    typeof (node as HTMLElement).focus === "function"
  );
}

function canBlur(node: unknown): node is HTMLElement {
  return (
    !!node &&
    typeof node === "object" &&
    typeof (node as HTMLElement).blur === "function"
  );
}

export function moveFocusOutOfHomeSearchHiddenTrees(options: {
  browseRoot: HTMLElement | null | undefined;
  searchInputHost: HTMLElement | null | undefined;
}): void {
  const doc = globalThis.document;
  if (!doc) return;
  const activeRaw = doc.activeElement;
  if (!isElementLike(activeRaw) || !canBlur(activeRaw)) return;
  const active = activeRaw as HTMLElement;

  const browse = options.browseRoot ?? null;
  const inBrowse = Boolean(browse?.contains(active));
  const inTab = Boolean(active.closest("[data-bottomtab]"));
  if (!inBrowse && !inTab) return;

  const input = options.searchInputHost?.querySelector(
    "[data-home-search-input]"
  );
  if (canFocus(input) && input !== active) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  const still = doc.activeElement;
  if (
    still === active ||
    (isElementLike(still) &&
      (Boolean(browse?.contains(still)) ||
        Boolean(still.closest("[data-bottomtab]"))))
  ) {
    try {
      active.blur();
    } catch {
      /* ignore */
    }
  }
}
