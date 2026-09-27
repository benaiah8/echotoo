/**
 * Speculative list warm (PV3.1) — connection gate only.
 * Does not affect ACTIVE playback ownership or autoplay.
 */

import {
  getConnectionInfo,
  type ConnectionInfo,
} from "../connectionAware";

/**
 * When false, do not claim WARM ownership / HLS prebuffer.
 * saveData + slow-2g/2g → skip. 3g/4g/unknown → allow.
 * Missing Network Information API → allow (safe default).
 */
export function shouldAllowPublishedListVideoSpeculativeWarm(
  info: Pick<ConnectionInfo, "effectiveType" | "saveData"> = getConnectionInfo(),
): boolean {
  if (info.saveData) return false;
  if (info.effectiveType === "slow-2g" || info.effectiveType === "2g") {
    return false;
  }
  return true;
}
