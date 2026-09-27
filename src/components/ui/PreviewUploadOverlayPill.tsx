/**
 * Preview-only: compact upload/status over the hero carousel (props-only, no hooks).
 */
import { formatCreateMediaStatusLabel } from "../../lib/createPostMediaUploadLabel";

export type PreviewUploadOverlayPillProps = {
  imageUploadingCount?: number;
  /** Bunny network video upload (rare on Finalize during local-first Create). */
  videoUploadingCount?: number;
  /** Local native video ingest (V3G0 Create). */
  videoAddingCount?: number;
  /** Local Media3 preparation (PASS C3). */
  videoPreparingCount?: number;
  /** @deprecated Use imageUploadingCount + videoUploadingCount / videoAddingCount */
  uploadingCount?: number;
};

export default function PreviewUploadOverlayPill({
  imageUploadingCount = 0,
  videoUploadingCount = 0,
  videoAddingCount = 0,
  videoPreparingCount = 0,
  uploadingCount,
}: PreviewUploadOverlayPillProps) {
  const images =
    uploadingCount != null &&
    videoUploadingCount === 0 &&
    videoAddingCount === 0 &&
    videoPreparingCount === 0 &&
    imageUploadingCount === 0
      ? uploadingCount
      : imageUploadingCount;
  const label = formatCreateMediaStatusLabel({
    imageUploadingCount: images,
    videoUploadingCount,
    videoAddingCount,
    videoPreparingCount,
  });
  if (!label) return null;

  return (
    <div
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--brand)]/50 px-3 py-1",
        "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
        "shadow-[0_0_14px_rgba(247,208,71,0.22),0_2px_10px_rgba(0,0,0,0.1)]",
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-busy
      aria-label={label}
      data-create-video-adding={videoAddingCount > 0 ? "true" : undefined}
      data-create-video-preparing={
        videoPreparingCount > 0 ? "true" : undefined
      }
    >
      <span
        className="inline-block size-3 shrink-0 rounded-full border-2 border-[var(--brand)]/35 border-t-[var(--brand)] animate-spin"
        aria-hidden
      />
      <span className="truncate text-[10px] font-medium leading-none text-[var(--text)]/90 sm:text-[11px]">
        {label}
      </span>
    </div>
  );
}
