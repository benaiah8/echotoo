/** Window event: hide BottomTab chrome while Home search mode is active. */
export const HOME_SEARCH_TAB_CHROME_EVENT = "home-search-tab-chrome";

export type HomeSearchTabChromeDetail = {
  hidden: boolean;
};

let homeSearchTabChromeHidden = false;

export function getHomeSearchTabChromeHidden() {
  return homeSearchTabChromeHidden;
}

/** Hide or restore BottomTab chrome for Home search. Safe for late subscribers. */
export function setHomeSearchTabChromeHidden(hidden: boolean) {
  if (homeSearchTabChromeHidden === hidden) return;
  homeSearchTabChromeHidden = hidden;
  window.dispatchEvent(
    new CustomEvent(HOME_SEARCH_TAB_CHROME_EVENT, {
      detail: { hidden } satisfies HomeSearchTabChromeDetail,
    })
  );
}
