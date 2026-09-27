/**
 * Pure option validation shared by web stub + JS tests (mirrors Android plugin).
 */
import type { EchoVideoPrepareOptions } from "./definitions";
import { ECHO_VIDEO_PREPARE_ERROR } from "./errors";

export function validateEchoVideoPrepareOptions(
  options: Partial<EchoVideoPrepareOptions> | null | undefined,
): string | null {
  if (!options) return "options are required";
  if (!options.jobId?.trim()) return "jobId is required";
  if (!options.sourcePath?.trim()) return "sourcePath is required";
  if (!options.destinationPath?.trim()) return "destinationPath is required";
  if (!options.temporaryPath?.trim()) return "temporaryPath is required";
  if (
    typeof options.targetLongEdge !== "number" ||
    !Number.isFinite(options.targetLongEdge) ||
    options.targetLongEdge <= 0
  ) {
    return "targetLongEdge must be a positive integer";
  }
  if (
    typeof options.targetVideoBitrate !== "number" ||
    !Number.isFinite(options.targetVideoBitrate) ||
    options.targetVideoBitrate <= 0
  ) {
    return "targetVideoBitrate must be a positive integer";
  }
  if (
    typeof options.targetFps !== "number" ||
    !Number.isFinite(options.targetFps) ||
    options.targetFps <= 0
  ) {
    return "targetFps must be a positive integer";
  }
  if (
    typeof options.audioBitrate !== "number" ||
    !Number.isFinite(options.audioBitrate) ||
    options.audioBitrate <= 0
  ) {
    return "audioBitrate must be a positive integer";
  }
  return null;
}

export function echoVideoPrepareInvalidOptionsCode(): string {
  return ECHO_VIDEO_PREPARE_ERROR.invalid_options;
}
