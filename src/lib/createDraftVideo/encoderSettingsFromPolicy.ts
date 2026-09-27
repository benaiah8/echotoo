/**
 * Derive native encoder settings from existing preparation policy (no second policy).
 */
import {
  PREPARE_AUDIO_BITRATE_BPS,
  resolveMinVideoBitrateBps,
  resolveTargetVideoBitrateBps,
  type VideoPreparationPolicyResult,
} from "./createVideoPreparationPolicy";
import type { DraftVideo } from "./types";

export type DraftVideoEncoderSettings = {
  targetLongEdge: number;
  targetVideoBitrate: number;
  targetFps: number;
  audioBitrate: number;
};

/**
 * Map policy → Media3 request fields.
 * `targetLongEdge` remains the policy short-edge/"p" contract used by native C2.
 */
export function encoderSettingsFromPreparationPolicy(
  policy: VideoPreparationPolicyResult,
  draft: DraftVideo,
): DraftVideoEncoderSettings {
  const edge = policy.targetLongEdge;
  const qualityTarget = resolveTargetVideoBitrateBps(edge);
  const floor = resolveMinVideoBitrateBps(edge);
  const duration =
    typeof draft.duration === "number" &&
    Number.isFinite(draft.duration) &&
    draft.duration > 0
      ? draft.duration
      : null;

  let bitrate = qualityTarget;
  if (duration != null && policy.targetBytes > 0) {
    const fromBytes = Math.round((policy.targetBytes * 8) / duration) - PREPARE_AUDIO_BITRATE_BPS;
    if (Number.isFinite(fromBytes) && fromBytes > 0) {
      bitrate = Math.max(floor, Math.min(qualityTarget, fromBytes));
    }
  }

  return {
    targetLongEdge: edge,
    targetVideoBitrate: bitrate,
    targetFps: policy.targetFps,
    audioBitrate: PREPARE_AUDIO_BITRATE_BPS,
  };
}

/** `create-drafts/{publishPostId}/{file}` → publishPostId */
export function publishPostIdFromDraftLocalReference(
  localReference: string,
): string | null {
  const normalized = localReference.replace(/\\/g, "/").replace(/^\/+/, "");
  const match = normalized.match(/^create-drafts\/([^/]+)\//);
  return match?.[1] ?? null;
}
