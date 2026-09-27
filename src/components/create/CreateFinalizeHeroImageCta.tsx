import { PiImages } from "react-icons/pi";
import { useCreatePostMediaPicker } from "../../hooks/useCreatePostMediaPicker";
import { useCreatePostMedia } from "./CreatePostMediaProvider";
import { formatPostMediaCountLabel } from "../../lib/createPostMediaSlots";
import { hasActivePostVideo } from "../../lib/createPostVideoUpload";

type Props = {
  /** Total images already attached across all activities (post-level cap). */
  totalImagesPost: number;
  /** Called after uploads are queued so parents can bump draft epoch / re-read LS. */
  onAfterStartUploads?: () => void;
  /** Called before opening the file picker (e.g. close metadata panels). */
  onBeforeOpen?: () => void;
  /** Empty hero vs below-hero secondary CTA copy. */
  variant?: "empty" | "more";
};

/**
 * Full-width finalize-only hero CTA: opens image picker and uploads into activity index 0
 * via the shared CreatePostMedia pipeline (same as Activities / header Media).
 */
export default function CreateFinalizeHeroImageCta({
  totalImagesPost,
  onAfterStartUploads,
  onBeforeOpen,
  variant = "empty",
}: Props) {
  const { videoJob } = useCreatePostMedia();
  const hasVideo = hasActivePostVideo(videoJob);
  const { openPicker, fileInput, mediaAcquisitionSheet, hasPendingUploads, atCap } =
    useCreatePostMediaPicker({
      totalImagesPost,
      onBeforeOpen,
      onAfterStartUploads,
    });

  const title = variant === "more" ? "Add more photos" : "Add photos";
  const counterLabel = formatPostMediaCountLabel(totalImagesPost, hasVideo);

  return (
    <>
      {fileInput}
      {mediaAcquisitionSheet}
      <button
        type="button"
        onClick={openPicker}
        disabled={hasPendingUploads || atCap}
        className="group flex w-full items-center gap-2.5 rounded-full border-2 border-[var(--create-border-hero-outline)] bg-white/72 p-2 text-left backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_3px_12px_rgba(0,0,0,0.1)] transition-[border-color,box-shadow,transform,background-color] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55 app-dark:bg-black/32 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_7px_22px_rgba(0,0,0,0.35)]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-icon-disc-border)] bg-[var(--create-hero-cta-icon-disc-bg)] text-[var(--create-hero-cta-icon-fg)] shadow-[var(--create-hero-cta-icon-shadow)]"
          aria-hidden
        >
          <PiImages className="h-[1.2rem] w-[1.2rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight tracking-tight app-light:text-neutral-900 app-dark:text-white">
            {atCap ? "All media added" : title}
          </span>
        </span>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-counter-border)] bg-[var(--create-hero-cta-counter-bg)] text-[10px] font-semibold tabular-nums text-[var(--create-hero-cta-counter-fg)] shadow-[var(--create-hero-cta-counter-shadow)]">
          {counterLabel}
        </span>
      </button>
    </>
  );
}
