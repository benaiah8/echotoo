/**
 * Centered playback buffering / first-frame spinner for dark video surfaces.
 * Reuses the same animate-spin ring pattern as Create upload pills, tuned for
 * black / poster underlays (light + dark app themes).
 */

type Props = {
  className?: string;
};

export default function VideoPlaybackLoadingSpinner({ className = "" }: Props) {
  return (
    <div
      className={[
        "pointer-events-none absolute inset-0 z-[2] flex items-center justify-center",
        className,
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-busy
      aria-label="Loading video"
      data-video-playback-loading
    >
      <span
        className="inline-block size-8 shrink-0 rounded-full border-2 border-white/35 border-t-white animate-spin"
        aria-hidden
      />
    </div>
  );
}
