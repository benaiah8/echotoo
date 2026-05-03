// Image uploads for create flow: global cap across all stops; grid shows every image on every stop.
import { useEffect, useMemo, useRef, useState } from "react";
import { PiCaretDown, PiPlus } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import { imgUrlPublic } from "../../lib/img";
import {
  useCreatePostMedia,
  type PostImageUploadJob,
} from "../../components/create/CreatePostMediaProvider";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import { ensureFirstActivitySlotForPostImages } from "../../lib/createFlowEnsureFirstActivitySlot";

interface CreateActivityImagesSectionProps {
  activities: ActivityType[];
  activityIndex: number;
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  /** Shared add-on panel: skip collapsible header, show upload UI only */
  embedded?: boolean;
  /** Finalize hero overlay mode: softer frosted surface and tighter copy. */
  surfaceVariant?: "default" | "hero-overlay";
  /** Hide helper line under Add images button. */
  hideHelperCopy?: boolean;
}

const HEADER_BTN =
  "group flex w-full items-center justify-between gap-2 rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-frame)] " +
  "bg-white/95 px-3 py-2.5 text-left text-neutral-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)] " +
  "transition hover:bg-neutral-50 active:scale-[0.99] " +
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] app-dark:text-[var(--text)] " +
  "app-dark:hover:bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]";

const L = CREATE_FLOW_LIMITS.activities;

export default function CreateActivityImagesSection({
  activities,
  activityIndex,
  setActivities,
  embedded = false,
  surfaceVariant = "default",
  hideHelperCopy = false,
}: CreateActivityImagesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startPostImageUploads, getPendingJobsForActivity } =
    useCreatePostMedia();

  const openLibrary = () => fileInputRef.current?.click();

  /** Pending uploads across all stops (unified gallery). */
  const pending = useMemo(() => {
    const out: PostImageUploadJob[] = [];
    for (let i = 0; i < activities.length; i++) {
      out.push(...getPendingJobsForActivity(i));
    }
    return out;
  }, [activities, getPendingJobsForActivity]);

  const uploading = pending.some((j) => j.status === "uploading");
  const errors = pending.filter((j) => j.status === "error");

  const totalImagesPost = useMemo(
    () => activities.reduce((n, act) => n + (act.images?.length ?? 0), 0),
    [activities]
  );

  const maxPost = L.maxTotalImagesPerPost;
  const canAddMoreImages = totalImagesPost < maxPost;

  const hasPendingWork = pending.length > 0;

  const [expanded, setExpanded] = useState(
    () => totalImagesPost > 0 || hasPendingWork
  );

  useEffect(() => {
    if (totalImagesPost > 0 || hasPendingWork) setExpanded(true);
  }, [totalImagesPost, hasPendingWork]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !files.length) return;

    const totalSpace = Math.max(0, maxPost - totalImagesPost);
    const allowed = totalSpace;
    if (allowed <= 0) {
      if (event.target) event.target.value = "";
      return;
    }

    const picked = Array.from(files);
    const toUpload = picked.slice(0, allowed);

    ensureFirstActivitySlotForPostImages();
    void startPostImageUploads(toUpload, activityIndex).finally(() => {
      if (event.target) event.target.value = "";
    });
  };

  /** Remove from any stop’s `images` array. */
  const removeImageAt = (stopIdx: number, imgIdx: number) => {
    setActivities((prev) =>
      prev.map((act, idx) => {
        if (idx !== stopIdx) return act;
        const arr = Array.isArray(act.images) ? [...act.images] : [];
        if (imgIdx < 0 || imgIdx >= arr.length) return act;
        const next = arr.filter((_, i) => i !== imgIdx);
        return { ...act, images: next };
      })
    );
  };

  const allImageEntries = useMemo(() => {
    const out: { stopIdx: number; imgIdx: number; src: string }[] = [];
    activities.forEach((act, si) => {
      (act.images || []).forEach((src, ii) => {
        out.push({ stopIdx: si, imgIdx: ii, src });
      });
    });
    return out;
  }, [activities]);

  const showStopLabels = activities.length > 1;
  const heroOverlaySurface = surfaceVariant === "hero-overlay";

  const panelBody = (
    <div
      className={[
        embedded
          ? "rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-frame)] px-3 py-3 flex flex-col gap-3 backdrop-blur-xl"
          : "mt-2 rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-frame)] px-3 py-3 flex flex-col gap-3 backdrop-blur-xl",
        heroOverlaySurface
          ? "bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_8px_22px_rgba(0,0,0,0.1)] backdrop-saturate-150 app-dark:bg-black/28 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_28px_rgba(0,0,0,0.28)]"
          : "bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.54),0_6px_18px_rgba(0,0,0,0.08)] app-dark:bg-[color-mix(in_oklab,#000_36%,var(--surface)_64%)] app-dark:backdrop-blur-2xl app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_28px_rgba(0,0,0,0.4)]",
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
        {!hideHelperCopy ? (
          <p className="text-center text-[10px] text-[var(--text)]/62 app-dark:text-white/82">
            {totalImagesPost}/{maxPost} images · new photos go to this stop
          </p>
        ) : null}
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

      <div
        className={
          heroOverlaySurface
            ? "min-h-0 max-h-[min(34vh,11.5rem)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
            : ""
        }
      >
      <div className="grid grid-cols-3 gap-2">
        {allImageEntries.map(({ stopIdx, imgIdx, src }) => {
          const resolved = imgUrlPublic(src);
          const isCurrentStop = stopIdx === activityIndex;
          return (
            <div
              key={`${stopIdx}-${imgIdx}-${src.slice(0, 32)}`}
              className={[
                "relative w-full aspect-square rounded-lg overflow-hidden bg-[var(--surface)]/40 ring-1 ring-[var(--border)]/30",
                isCurrentStop
                  ? "ring-[color-mix(in_oklab,var(--brand)_35%,var(--border))]"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
              {showStopLabels ? (
                <span className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/55 px-1 py-px text-[9px] font-medium text-white/95">
                  Stop {stopIdx + 1}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeImageAt(stopIdx, imgIdx)}
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full
                           bg-[var(--surface)]/90 text-[var(--text)] backdrop-blur-sm
                           text-sm leading-none shadow-sm hover:opacity-95"
                aria-label={`Remove image from stop ${stopIdx + 1}`}
                title="Remove image"
              >
                ×
              </button>
            </div>
          );
        })}

        {!allImageEntries.length && (
          <div className="col-span-3 rounded-[var(--create-radius-field)] border border-dashed border-[var(--create-border-dashed-muted)] bg-[var(--surface)]/10 px-2 py-4 text-center text-[11px] text-[var(--text)]/50">
            No images yet — add from your library.
          </div>
        )}
      </div>
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
            All photos in your plan
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[var(--create-border-panel-line-soft)] bg-[var(--surface)]/25 px-2 py-0.5 text-[11px] font-medium text-[var(--text)]/65 tabular-nums">
            {totalImagesPost > 0 ? `${totalImagesPost}` : uploading ? "…" : "0"}
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
