/**
 * Preview-only: compact upload status over the hero carousel (props-only, no hooks).
 * Styling aligned with create-flow progress notice pills.
 */
export type PreviewUploadOverlayPillProps = {
  uploadingCount: number;
};

export default function PreviewUploadOverlayPill({
  uploadingCount,
}: PreviewUploadOverlayPillProps) {
  if (uploadingCount <= 0) return null;

  const label =
    uploadingCount === 1
      ? "1 image uploading"
      : `${uploadingCount} images uploading`;

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
