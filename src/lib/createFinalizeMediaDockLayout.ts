/** Shared geometry for the finalize hero Add more media overlay + video scrubber. */

import type { CSSProperties } from "react";

export const CREATE_FINALIZE_DOCK_BOTTOM_CSS = "0.5rem";

/** Matches dock bar `min-h` (p-1.5 + h-8 icon row). */
export const CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS = "3rem";

export const CREATE_FINALIZE_DOCK_SCRUB_GAP_CSS = "0.375rem";

export const CREATE_FINALIZE_DOCK_STACK_GAP_CSS = "0.375rem";

export const CREATE_FINALIZE_DOCK_STACK_CLASS = "flex flex-col";

export const CREATE_FINALIZE_DOCK_CSS_VARS = {
  "--create-finalize-dock-bottom": CREATE_FINALIZE_DOCK_BOTTOM_CSS,
  "--create-finalize-dock-bar-height": CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS,
  "--create-finalize-dock-scrub-gap": CREATE_FINALIZE_DOCK_SCRUB_GAP_CSS,
} as CSSProperties;

/** Thin video progress line — directly above the dock bar with a small gap. */
export const CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS = `calc(var(--create-finalize-dock-bottom, ${CREATE_FINALIZE_DOCK_BOTTOM_CSS}) + var(--create-finalize-dock-bar-height, ${CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS}) + var(--create-finalize-dock-scrub-gap, ${CREATE_FINALIZE_DOCK_SCRUB_GAP_CSS}))`;

/** DOM order inside the dock stack: strip above, bar last (bottom anchored). */
export const CREATE_FINALIZE_DOCK_STACK_ORDER = ["strip", "bar"] as const;
