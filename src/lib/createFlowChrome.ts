/** Vertical gap under the notch before the main create pill (matches CreateFlowTopBar). */
export const CREATE_FLOW_TOP_GAP_BELOW_SAFE_AREA_PX = 12;

/** Keeps strip width stable across route changes (CreateFlowTopBar + CreateFlowNoticeStack). */
export let lastCreateFlowBottomTabWidthPx = 0;

export function readCreateFlowBottomTabWidthPx(): number {
  if (typeof document === "undefined") return lastCreateFlowBottomTabWidthPx;
  const el = document.getElementById("bottom-tab");
  if (!el) return lastCreateFlowBottomTabWidthPx;
  const w = Math.round(el.getBoundingClientRect().width);
  if (w > 0) lastCreateFlowBottomTabWidthPx = w;
  return lastCreateFlowBottomTabWidthPx;
}
