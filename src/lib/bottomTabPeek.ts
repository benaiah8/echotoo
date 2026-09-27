import type { TabId } from "../router/PersistentTabContainer.new";

/** Window event: bottom-tab owl peek (synced with each tab’s top chrome). */
export const BOTTOM_TAB_PEEK_EVENT = "bottom-tab-peek";

export type BottomTabPeekDetail = {
  tab: TabId;
  hidden: boolean;
};

export function dispatchBottomTabPeek(tab: TabId, hidden: boolean) {
  window.dispatchEvent(
    new CustomEvent(BOTTOM_TAB_PEEK_EVENT, {
      detail: { tab, hidden } satisfies BottomTabPeekDetail,
    })
  );
}

export type BottomTabOwlSlot = 0 | 1 | 3 | 4;

/** Which bottom-tab icon index shows the owl; Create (2) never does. */
export function getBottomTabOwlSlot(args: {
  pathname: string;
  activeIconIndex: number | null;
  createChooserOpen: boolean;
}): BottomTabOwlSlot | null {
  if (args.createChooserOpen) return null;
  if (args.pathname.startsWith("/create")) return null;
  const i = args.activeIconIndex;
  // People (1): Match Deck occupies this area. Owl stays on Home / Messages / Profile.
  if (i === 1) return null;
  if (i === 0 || i === 3 || i === 4) return i;
  return null;
}
