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

/** Which bottom-tab icon index (0,2,3) shows the owl; Create (1) never does. */
export function getBottomTabOwlSlot(args: {
  pathname: string;
  activeIconIndex: number | null;
  createChooserOpen: boolean;
}): 0 | 2 | 3 | null {
  if (args.createChooserOpen) return null;
  if (args.pathname.startsWith("/create")) return null;
  const i = args.activeIconIndex;
  if (i === 0 || i === 2 || i === 3) return i;
  return null;
}
