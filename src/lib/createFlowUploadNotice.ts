import { Paths } from "../router/Paths";
import { formatCreateMediaStatusLabel } from "./createPostMediaUploadLabel";

/**
 * Create-flow notice stack message for in-flight post media uploads.
 * On Finalize, image uploads + local video ingest are shown only via
 * {@link PreviewUploadOverlayPill} (avoid duplicate notices).
 */
export function resolveCreateFlowUploadNoticeMessage(options: {
  pathname: string;
  imageUploadingCount: number;
  videoUploadingCount: number;
  videoAddingCount?: number;
  videoPreparingCount?: number;
}): string | null {
  const onFinalize = options.pathname.startsWith(Paths.createFinalize);
  const imageCount = onFinalize ? 0 : options.imageUploadingCount;
  const videoAddingCount = onFinalize ? 0 : options.videoAddingCount ?? 0;
  const videoPreparingCount = onFinalize
    ? 0
    : options.videoPreparingCount ?? 0;
  return formatCreateMediaStatusLabel({
    imageUploadingCount: imageCount,
    videoUploadingCount: options.videoUploadingCount,
    videoAddingCount,
    videoPreparingCount,
  });
}
