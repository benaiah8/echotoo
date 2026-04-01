// Image uploads for one activity stop — progressive disclosure, Capacitor-friendly
import { useEffect, useMemo, useRef, useState } from "react";
import { PiCaretDown, PiPlus } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import { imgUrlPublic } from "../../lib/img";
import { useCreatePostMedia } from "../../components/create/CreatePostMediaProvider";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";

interface CreateActivityImagesSectionProps {
  activities: ActivityType[];
  activity: ActivityType;
  activityIndex: number;
  handleChange: (field: string, value: any) => void;
  /** Shared add-on panel: skip collapsible header, show upload UI only */
  embedded?: boolean;
}

const HEADER_BTN =
  "group flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)]/50 " +
  "bg-[color-mix(in_oklab,var(--surface)_35%,transparent)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
  "transition hover:bg-[color-mix(in_oklab,var(--surface)_48%,transparent)] active:scale-[0.99] " +
  "dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] " +
  "dark:hover:bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]";

const L = CREATE_FLOW_LIMITS.activities;

export default function CreateActivityImagesSection({
  activities,
  activity,
  activityIndex,
  handleChange,
  embedded = false,
}: CreateActivityImagesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startPostImageUploads, getPendingJobsForActivity } =
    useCreatePostMedia();

  const openLibrary = () => fileInputRef.current?.click();

  const pending = getPendingJobsForActivity(activityIndex);
  const uploading = pending.some((j) => j.status === "uploading");
  const errors = pending.filter((j) => j.status === "error");

  const imageCount = activity?.images?.length ?? 0;
  const totalImagesPost = useMemo(
    () => activities.reduce((n, act) => n + (act.images?.length ?? 0), 0),
    [activities]
  );
  const canAddMoreImages =
    imageCount < L.maxImagesPerStop &&
    totalImagesPost < L.maxTotalImagesPerPost;
  const hasPendingWork = pending.length > 0;

  const [expanded, setExpanded] = useState(
    () => imageCount > 0 || hasPendingWork
  );

  useEffect(() => {
    if (imageCount > 0 || hasPendingWork) setExpanded(true);
  }, [imageCount, hasPendingWork]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !files.length) return;

    const current = activity?.images?.length ?? 0;
    const perStopSpace = Math.max(0, L.maxImagesPerStop - current);
    const totalSpace = Math.max(0, L.maxTotalImagesPerPost - totalImagesPost);
    const allowed = Math.min(perStopSpace, totalSpace);
    if (allowed <= 0) {
      if (event.target) event.target.value = "";
      return;
    }

    const picked = Array.from(files);
    const toUpload = picked.slice(0, allowed);

    void startPostImageUploads(toUpload, activityIndex).finally(() => {
      if (event.target) event.target.value = "";
    });
  };

  const removeAt = (index: number) => {
    const arr = Array.isArray(activity?.images) ? activity.images : [];
    const next = arr.filter((_, i) => i !== index);
    handleChange("images", next);
  };

  const panelBody = (
    <div
      className={[
        embedded
          ? "rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/22 px-3 py-3 flex flex-col gap-3"
          : "mt-2 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/22 px-3 py-3 flex flex-col gap-3",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:border-white",
      ].join(" ")}
      role="region"
      aria-labelledby={embedded ? undefined : "activity-images-disclosure"}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openLibrary}
            disabled={uploading || !canAddMoreImages}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2
                       bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)]/40
                       text-xs font-semibold hover:opacity-90 active:scale-[0.99]
                       disabled:opacity-60 transition shadow-sm"
            aria-label="Add images"
            title="Add images"
          >
            <PiPlus className="h-4 w-4" aria-hidden />
            Add images
          </button>
        </div>
        <p className="text-center text-[10px] text-[var(--text)]/42">
          {imageCount}/{L.maxImagesPerStop} this stop · {totalImagesPost}/
          {L.maxTotalImagesPerPost} total
        </p>
      </div>

      {errors.length > 0 && (
        <div className="text-xs text-red-500/90 space-y-1">
          {errors.map((j) => (
            <div key={j.id}>
              {j.fileName}: {j.errorMessage || "Upload failed"}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {(activity?.images || []).map((src: string, i: number) => {
          const resolved = imgUrlPublic(src);
          return (
            <div
              key={`${i}-${src.slice(0, 24)}`}
              className="relative w-full aspect-square rounded-lg overflow-hidden bg-[var(--surface)]/40 ring-1 ring-[var(--border)]/30"
            >
              {resolved ? (
                <img
                  src={resolved}
                  className="w-full h-full object-cover"
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-[var(--surface-2)]" />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full
                           bg-[var(--surface)]/90 text-[var(--text)] backdrop-blur-sm
                           text-sm leading-none shadow-sm hover:opacity-95"
                aria-label="Remove image"
                title="Remove image"
              >
                ×
              </button>
            </div>
          );
        })}

        {!activity?.images?.length && (
          <div className="col-span-3 rounded-lg border border-dashed border-[var(--border)]/45 bg-[var(--surface)]/10 px-2 py-4 text-center text-[11px] text-[var(--text)]/50">
            No images yet — add from your library.
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <section className="w-full">{panelBody}</section>;
  }

  return (
    <section className="w-full mt-3">
      <button
        type="button"
        className={HEADER_BTN}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        id="activity-images-disclosure"
      >
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text)]/92">
            Images
          </span>
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--text)]/45">
            Photos for this stop
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[var(--border)]/50 bg-[var(--surface)]/25 px-2 py-0.5 text-[11px] font-medium text-[var(--text)]/65 tabular-nums">
            {imageCount > 0 ? `${imageCount}` : uploading ? "…" : "0"}
          </span>
          <PiCaretDown
            className={`h-4 w-4 shrink-0 text-[var(--text)]/50 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
      </button>

      {expanded && panelBody}
    </section>
  );
}
