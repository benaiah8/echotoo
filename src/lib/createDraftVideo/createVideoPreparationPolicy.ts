/**
 * Quality-first adaptive video preparation policy (PASS B0.1).
 * Pure — no encoding. Decisions use duration, dimensions, fps, and bitrate density.
 */

import {
  isAllowedBunnyVideoMimeType,
  normalizeBunnyVideoMimeType,
} from "../bunnyUpload/bunnyVideoConstraints";
import {
  SHORT_VIDEO_PREFERRED_TARGET_BYTES,
  SOURCE_MAX_BYTES,
  INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION,
  MAX_CREATE_VIDEO_DURATION_SECONDS,
} from "./createVideoPreparationConstants";

export type VideoPreparationStrategy = "passthrough" | "prepare";

export type VideoPreparationPolicyInput = {
  durationSeconds?: number | null;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  mimeType?: string | null;
};

export type VideoPreparationPolicyResult = {
  strategy: VideoPreparationStrategy;
  /** Preferred output size budget for prepare; source size for passthrough. */
  targetBytes: number;
  /**
   * Target encode edge (1080p / 720p “p” dimension = min(width,height)).
   * Never upscales the source encode edge.
   */
  targetLongEdge: number;
  targetFps: number;
  reason: string;
};

/** Max “p” dimension (1080p). 1920×1080 is allowed; 4K is not. */
export const PREPARE_MAX_LONG_EDGE_PX = 1080;
export const PREPARE_FALLBACK_LONG_EDGE_PX = 720;
export const PREPARE_MAX_FPS = 30;

/** Mid of ~2.5–3.5 Mbps for ≤720p. */
export const TARGET_VIDEO_BITRATE_720P_BPS = 3_000_000;

/** Mid of ~4–5 Mbps for >720p up to 1080p. */
export const TARGET_VIDEO_BITRATE_1080P_BPS = 4_500_000;

export const PREPARE_AUDIO_BITRATE_BPS = 128_000;

/** Quality floors — do not chase bytes below these. */
export const PREPARE_MIN_VIDEO_BITRATE_720P_BPS = 2_000_000;
export const PREPARE_MIN_VIDEO_BITRATE_1080P_BPS = 3_200_000;

/** @deprecated Prefer resolution-specific floors; kept as the stricter 720p floor. */
export const PREPARE_MIN_VIDEO_BITRATE_BPS = PREPARE_MIN_VIDEO_BITRATE_720P_BPS;

/** Prepare only when estimated savings meet this fraction of source size. */
export const MEANINGFUL_SAVINGS_RATIO = 0.15;

/** Future prepared container/codec intent (not implemented yet). */
export const PREPARE_TARGET_VIDEO_CODEC = "h264";
export const PREPARE_TARGET_AUDIO_CODEC = "aac";

function dim(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Encode “p” edge: min(width,height). Landscape 1920×1080 → 1080. */
export function sourceEncodeEdgePx(
  width?: number | null,
  height?: number | null,
): number {
  const w = dim(width);
  const h = dim(height);
  if (w > 0 && h > 0) return Math.min(w, h);
  return Math.max(w, h);
}

function normalizeDurationSeconds(
  durationSeconds: number | null | undefined,
): number | null {
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return null;
  }
  return durationSeconds;
}

/** Source total bitrate (bits/sec) when duration is known. */
export function computeSourceTotalBitrateBps(
  sizeBytes: number,
  durationSeconds: number | null | undefined,
): number | null {
  const duration = normalizeDurationSeconds(durationSeconds);
  if (duration == null || sizeBytes <= 0) return null;
  return (sizeBytes * 8) / duration;
}

export function resolveTargetVideoBitrateBps(encodeEdgePx: number): number {
  return encodeEdgePx > PREPARE_FALLBACK_LONG_EDGE_PX
    ? TARGET_VIDEO_BITRATE_1080P_BPS
    : TARGET_VIDEO_BITRATE_720P_BPS;
}

export function resolveMinVideoBitrateBps(encodeEdgePx: number): number {
  return encodeEdgePx > PREPARE_FALLBACK_LONG_EDGE_PX
    ? PREPARE_MIN_VIDEO_BITRATE_1080P_BPS
    : PREPARE_MIN_VIDEO_BITRATE_720P_BPS;
}

/**
 * Target encode edge for future prepare. Never upscales; caps at 1080p.
 */
export function resolvePrepareTargetLongEdge(
  width?: number | null,
  height?: number | null,
): number {
  const source = sourceEncodeEdgePx(width, height);
  if (source <= 0) return PREPARE_MAX_LONG_EDGE_PX;
  return Math.min(source, PREPARE_MAX_LONG_EDGE_PX);
}

export function resolvePrepareTargetFps(fps?: number | null): number {
  if (typeof fps === "number" && Number.isFinite(fps) && fps > 0) {
    return Math.min(fps, PREPARE_MAX_FPS);
  }
  return PREPARE_MAX_FPS;
}

/**
 * Adaptive prepare size from duration × resolution-aware target bitrate.
 * Not a universal 20 MB cap — grows with duration and resolution class.
 */
export function computeAdaptivePrepareTargetBytes(
  durationSeconds: number | null | undefined,
  width?: number | null,
  height?: number | null,
): number {
  const duration = normalizeDurationSeconds(durationSeconds) ?? 60;
  const encodeEdge = resolvePrepareTargetLongEdge(width, height);
  const videoBps = resolveTargetVideoBitrateBps(encodeEdge);
  const minVideoBps = resolveMinVideoBitrateBps(encodeEdge);
  const qualityBytes = Math.round(
    (duration * (videoBps + PREPARE_AUDIO_BITRATE_BPS)) / 8,
  );
  const floorBytes = Math.round(
    (duration * (minVideoBps + PREPARE_AUDIO_BITRATE_BPS)) / 8,
  );
  const preparedCeiling =
    duration <= MAX_CREATE_VIDEO_DURATION_SECONDS
      ? INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION
      : SOURCE_MAX_BYTES;
  return Math.min(
    SOURCE_MAX_BYTES,
    preparedCeiling,
    Math.max(qualityBytes, floorBytes),
  );
}

export function hasMeaningfulPrepareSavings(
  sourceBytes: number,
  estimatedPreparedBytes: number,
): boolean {
  if (sourceBytes <= 0) return false;
  if (estimatedPreparedBytes >= sourceBytes) return false;
  const savings = (sourceBytes - estimatedPreparedBytes) / sourceBytes;
  return savings >= MEANINGFUL_SAVINGS_RATIO;
}

/**
 * True when a prepare target would force video bitrate below the quality floor.
 */
export function wouldPrepareViolateQualityFloor(options: {
  targetBytes: number;
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
}): boolean {
  const duration = Math.max(1, options.durationSeconds);
  const encodeEdge = resolvePrepareTargetLongEdge(options.width, options.height);
  const totalBitsPerSecond = (options.targetBytes * 8) / duration;
  const videoBits = totalBitsPerSecond - PREPARE_AUDIO_BITRATE_BPS;
  return videoBits < resolveMinVideoBitrateBps(encodeEdge);
}

function isMimeSupported(mimeType?: string | null): boolean {
  if (!mimeType?.trim()) return true;
  return isAllowedBunnyVideoMimeType(normalizeBunnyVideoMimeType(mimeType));
}

function passthroughResult(
  sizeBytes: number,
  targetLongEdge: number,
  targetFps: number,
  reason: string,
  width?: number | null,
  height?: number | null,
): VideoPreparationPolicyResult {
  const sourceEdge = sourceEncodeEdgePx(width, height);
  return {
    strategy: "passthrough",
    targetBytes: sizeBytes,
    targetLongEdge: sourceEdge || targetLongEdge,
    targetFps,
    reason,
  };
}

/**
 * Decide passthrough vs prepare. Pure — no I/O, no encoding.
 */
export function resolveVideoPreparationPolicy(
  input: VideoPreparationPolicyInput,
): VideoPreparationPolicyResult {
  const sizeBytes = Math.max(0, Math.floor(input.sizeBytes));
  const duration = normalizeDurationSeconds(input.durationSeconds);
  const sourceEdge = sourceEncodeEdgePx(input.width, input.height);
  const targetLongEdge = resolvePrepareTargetLongEdge(input.width, input.height);
  const targetFps = resolvePrepareTargetFps(input.fps);
  const overResolution = sourceEdge > PREPARE_MAX_LONG_EDGE_PX;
  const highFps =
    typeof input.fps === "number" &&
    Number.isFinite(input.fps) &&
    input.fps > PREPARE_MAX_FPS;

  const qualityTargetBytes = computeAdaptivePrepareTargetBytes(
    duration,
    input.width,
    input.height,
  );
  const estimatedPreparedBytes = Math.min(qualityTargetBytes, sizeBytes);

  if (!isMimeSupported(input.mimeType)) {
    return {
      strategy: "prepare",
      targetBytes: qualityTargetBytes,
      targetLongEdge,
      targetFps,
      reason: "prepare-high-bitrate",
    };
  }

  const smallPreferred =
    sizeBytes > 0 && sizeBytes <= SHORT_VIDEO_PREFERRED_TARGET_BYTES;

  if (smallPreferred && !overResolution && !highFps) {
    return passthroughResult(
      sizeBytes,
      targetLongEdge,
      targetFps,
      "passthrough-small",
      input.width,
      input.height,
    );
  }

  const sourceBps = computeSourceTotalBitrateBps(sizeBytes, duration);

  if (duration != null && sourceBps != null) {
    const targetTotalBps = (qualityTargetBytes * 8) / Math.max(duration, 1);
    const alreadyEfficient = sourceBps <= targetTotalBps * 1.05;
    const meaningful = hasMeaningfulPrepareSavings(
      sizeBytes,
      estimatedPreparedBytes,
    );
    const floorViolation = wouldPrepareViolateQualityFloor({
      targetBytes: estimatedPreparedBytes,
      durationSeconds: duration,
      width: input.width,
      height: input.height,
    });

    if (alreadyEfficient && !overResolution && !highFps) {
      return passthroughResult(
        sizeBytes,
        targetLongEdge,
        targetFps,
        "passthrough-efficient",
        input.width,
        input.height,
      );
    }

    if (!meaningful && !overResolution && !highFps) {
      return passthroughResult(
        sizeBytes,
        targetLongEdge,
        targetFps,
        "passthrough-efficient",
        input.width,
        input.height,
      );
    }

    if (floorViolation && !overResolution && !highFps) {
      return passthroughResult(
        sizeBytes,
        targetLongEdge,
        targetFps,
        "passthrough-efficient",
        input.width,
        input.height,
      );
    }

    if (overResolution) {
      return {
        strategy: "prepare",
        targetBytes: qualityTargetBytes,
        targetLongEdge,
        targetFps,
        reason: "prepare-over-resolution",
      };
    }

    if (highFps) {
      return {
        strategy: "prepare",
        targetBytes: qualityTargetBytes,
        targetLongEdge,
        targetFps,
        reason: "prepare-high-fps",
      };
    }

    if (meaningful || sourceBps > targetTotalBps) {
      return {
        strategy: "prepare",
        targetBytes: qualityTargetBytes,
        targetLongEdge,
        targetFps,
        reason: "prepare-high-bitrate",
      };
    }

    return passthroughResult(
      sizeBytes,
      targetLongEdge,
      targetFps,
      "passthrough-efficient",
      input.width,
      input.height,
    );
  }

  if (overResolution) {
    return {
      strategy: "prepare",
      targetBytes: qualityTargetBytes,
      targetLongEdge,
      targetFps,
      reason: "prepare-over-resolution",
    };
  }
  if (highFps) {
    return {
      strategy: "prepare",
      targetBytes: qualityTargetBytes,
      targetLongEdge,
      targetFps,
      reason: "prepare-high-fps",
    };
  }
  if (smallPreferred) {
    return passthroughResult(
      sizeBytes,
      targetLongEdge,
      targetFps,
      "passthrough-small",
      input.width,
      input.height,
    );
  }
  return {
    strategy: "prepare",
    targetBytes: qualityTargetBytes,
    targetLongEdge,
    targetFps,
    reason: "prepare-high-bitrate",
  };
}
