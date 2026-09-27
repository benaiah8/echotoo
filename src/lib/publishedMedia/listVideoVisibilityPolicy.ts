/**
 * Canonical Feed/Profile published-list video viewport policy (PV3.8.5).
 * Single owner of enter / exit / warm / hysteresis decisions.
 */

import {
  PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO,
  PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
} from "./listVideoVisibilityThresholds";

export type PublishedListVideoVisibilityPolicyInput = {
  effectiveRatio: number;
  dwellOk: boolean;
  visibilityOk: boolean;
  readyActiveVideo: boolean;
  userPaused: boolean;
  ownsPlayback: boolean;
  manualForce: boolean;
};

export type PublishedListVideoVisibilityPolicy = {
  effectiveRatio: number;
  activeEnterEligible: boolean;
  belowActiveExit: boolean;
  activeExitOk: boolean;
  warmRatioOk: boolean;
  /** Autoplay claim: enter ratio + dwell + visible + ready + not user-paused. */
  autoplayEligible: boolean;
  /**
   * Explicit Play may claim without 70% enter.
   * While already owning, still requires activeExitOk (≥40%).
   */
  forceManualActive: boolean;
  /** Keep ACTIVE + USER_PAUSED while ≥ exit threshold. */
  holdActiveWhileUserPaused: boolean;
  /** Keep active ownership in the 40–70% hysteresis band. */
  holdActiveByHysteresis: boolean;
  shouldOwnActive: boolean;
  warmEligible: boolean;
};

export function evaluatePublishedListVideoVisibilityPolicy(
  input: PublishedListVideoVisibilityPolicyInput,
): PublishedListVideoVisibilityPolicy {
  const effectiveRatio = Number.isFinite(input.effectiveRatio)
    ? Math.max(0, Math.min(1, input.effectiveRatio))
    : 0;

  const activeEnterEligible =
    effectiveRatio >= PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO;
  const belowActiveExit =
    effectiveRatio < PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO;
  const activeExitOk = !belowActiveExit;
  const warmRatioOk = effectiveRatio >= PUBLISHED_LIST_VIDEO_WARM_RATIO;

  const baseReady =
    input.visibilityOk && input.readyActiveVideo;

  const autoplayEligible =
    baseReady &&
    input.dwellOk &&
    activeEnterEligible &&
    !input.userPaused;

  const forceManualActive =
    baseReady &&
    input.manualForce &&
    (!input.ownsPlayback || activeExitOk);

  const holdActiveWhileUserPaused =
    baseReady &&
    input.userPaused &&
    activeExitOk;

  const holdActiveByHysteresis =
    baseReady &&
    input.ownsPlayback &&
    activeExitOk;

  const shouldOwnActive =
    autoplayEligible ||
    forceManualActive ||
    holdActiveWhileUserPaused ||
    holdActiveByHysteresis;

  const warmEligible =
    !shouldOwnActive &&
    warmRatioOk &&
    baseReady &&
    !input.userPaused;

  return {
    effectiveRatio,
    activeEnterEligible,
    belowActiveExit,
    activeExitOk,
    warmRatioOk,
    autoplayEligible,
    forceManualActive,
    holdActiveWhileUserPaused,
    holdActiveByHysteresis,
    shouldOwnActive,
    warmEligible,
  };
}
