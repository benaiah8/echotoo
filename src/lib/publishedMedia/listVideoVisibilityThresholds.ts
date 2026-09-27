/**
 * Named Feed/Profile list-video visibility thresholds (PV3.8.5).
 * Enter / exit hysteresis + warm band.
 */

/** ACTIVE ENTER — may become active (with dwell) at/above this effective ratio. */
export const PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO = 0.7;

/**
 * ACTIVE EXIT / visibility auto-pause — release active below this effective ratio.
 * Creates hysteresis with ACTIVE ENTER (retain in [EXIT, ENTER)).
 */
export const PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO = 0.4;

/** Warm prebuffer lower bound — slightly earlier than active enter band. */
export const PUBLISHED_LIST_VIDEO_WARM_RATIO = 0.15;

/**
 * @deprecated Alias of ACTIVE ENTER — kept for PV3–PV3.7 test/compat imports.
 * Prefer PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO.
 */
export const PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO =
  PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO;
