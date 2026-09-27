import { useEffect, useMemo, useRef, useState } from "react";
import { PiImages, PiPlus } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import { EXPANDED_MEDIA_TRAY_MAX_HEIGHT } from "../../lib/createFinalizeVideoHeroFrame";
import {
  CREATE_FINALIZE_DOCK_CSS_VARS,
  CREATE_FINALIZE_DOCK_STACK_CLASS,
  CREATE_FINALIZE_DOCK_STACK_GAP_CSS,
} from "../../lib/createFinalizeMediaDockLayout";
import { hasActivePostVideo } from "../../lib/createPostVideoUpload";
import {
  formatPostMediaCountLabel,
  isTotalMediaAtCap,
} from "../../lib/createPostMediaSlots";
import CreateFinalizeImageManagerStrip from "./CreateFinalizeImageManagerStrip";
import { useCreateFinalizeMediaChrome } from "./CreateFinalizeMediaChromeContext";
import { useCreatePostMedia } from "./CreatePostMediaProvider";

type Props = {
  activities: ActivityType[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  totalImagesPost: number;
  onAddMedia: () => void;
  selectedPreviewIndex: number;
  onSelectPreviewIndex: (index: number) => void;
  recordDiscreteBefore?: () => void;
};

const BAR_SURFACE = [
  "rounded-full border p-1.5 text-left transition-[opacity,border-color,box-shadow,background-color]",
  "bg-white/60 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_10px_rgba(0,0,0,0.08)]",
  "app-dark:bg-black/28 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150",
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_5px_18px_rgba(0,0,0,0.28)]",
].join(" ");

const BAR_SLOT =
  "flex min-h-[var(--create-finalize-dock-bar-height,3rem)] w-full shrink-0 items-center gap-2.5";

const ICON_DISC =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-icon-disc-border)] bg-[var(--create-hero-cta-icon-disc-bg)] text-[var(--create-hero-cta-icon-fg)] shadow-[var(--create-hero-cta-icon-shadow)]";

const PLUS_DISC =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--create-chooser-cta-selected-surface)] text-[var(--create-chooser-cta-selected-label)] shadow-[var(--create-hero-cta-icon-shadow)]";

const COUNT_DISC =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-counter-border)] bg-[var(--create-hero-cta-counter-bg)] text-[10px] font-semibold tabular-nums text-[var(--create-hero-cta-counter-fg)] shadow-[var(--create-hero-cta-counter-shadow)]";

const LABEL =
  "truncate text-left text-[15px] font-semibold leading-tight tracking-tight app-light:text-neutral-900 app-dark:text-white";

export default function CreateFinalizeHeroImageDock({
  activities,
  setActivities,
  totalImagesPost,
  onAddMedia,
  selectedPreviewIndex,
  onSelectPreviewIndex,
  recordDiscreteBefore,
}: Props) {
  const { videoJob } = useCreatePostMedia();
  const { setMediaDockExpanded, setMediaDragActive, mediaDragActive } =
    useCreateFinalizeMediaChrome();
  const hasVideo = hasActivePostVideo(videoJob);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevHasMediaRef = useRef(false);
  const atCap = isTotalMediaAtCap(totalImagesPost, hasVideo);
  const hasMedia = totalImagesPost > 0 || hasVideo;

  useEffect(() => {
    setMediaDockExpanded(expanded);
  }, [expanded, setMediaDockExpanded]);

  useEffect(() => {
    if (hasMedia && !prevHasMediaRef.current) {
      setExpanded(true);
    }
    prevHasMediaRef.current = hasMedia;
  }, [hasMedia]);

  useEffect(() => {
    if (!expanded) return;

    const onPointerDown = (e: PointerEvent) => {
      if (mediaDragActive) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setExpanded(false);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (mediaDragActive) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setExpanded(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [expanded, mediaDragActive]);

  const barTone = [
    BAR_SURFACE,
    expanded
      ? "border-white/85 opacity-100 app-dark:border-white/75"
      : "border-[var(--create-border-hero-outline)] opacity-58 hover:opacity-78",
  ].join(" ");

  const label = useMemo(() => {
    if (atCap) return "All media added";
    if (hasMedia) return "Add more media";
    return "Add media";
  }, [atCap, hasMedia]);

  const counterLabel = useMemo(
    () => formatPostMediaCountLabel(totalImagesPost, hasVideo),
    [hasVideo, totalImagesPost],
  );

  const closeManager = () => {
    setExpanded(false);
  };

  const stripPanel = expanded ? (
    <div
      className="min-w-0 shrink-0 overflow-x-auto overflow-y-visible"
      style={{ maxHeight: EXPANDED_MEDIA_TRAY_MAX_HEIGHT }}
      onPointerDown={(e) => e.stopPropagation()}
      data-media-dock-strip
    >
      <CreateFinalizeImageManagerStrip
        activities={activities}
        setActivities={setActivities}
        selectedPreviewIndex={selectedPreviewIndex}
        onSelectPreviewIndex={onSelectPreviewIndex}
        recordDiscreteBefore={recordDiscreteBefore}
        onDragActiveChange={setMediaDragActive}
        compactTray
      />
    </div>
  ) : null;

  const barInner = expanded ? (
    <>
      {atCap ? (
        <>
          <span className={`${PLUS_DISC} opacity-40`} aria-hidden>
            <PiPlus className="h-[1.05rem] w-[1.05rem]" />
          </span>
          <span className={LABEL}>{label}</span>
        </>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddMedia();
          }}
          className="flex min-h-8 min-w-0 max-w-[calc(100%-2.5rem)] items-center gap-2.5 active:scale-[0.99]"
          aria-label="Add media"
        >
          <span className={PLUS_DISC}>
            <PiPlus className="h-[1.05rem] w-[1.05rem]" />
          </span>
          <span className={LABEL}>{label}</span>
        </button>
      )}

      <span className="min-h-8 min-w-0 flex-1" aria-hidden />

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          closeManager();
        }}
        className={COUNT_DISC}
        aria-label="Hide media manager"
      >
        {counterLabel}
      </button>
    </>
  ) : (
    <>
      <span className={ICON_DISC} aria-hidden>
        <PiImages className="h-[1.05rem] w-[1.05rem]" />
      </span>
      <span className={`${LABEL} min-w-0 flex-1`}>{label}</span>
      <span className={COUNT_DISC}>{counterLabel}</span>
    </>
  );

  const dockBar = expanded ? (
    <div
      className={`${barTone} ${BAR_SLOT}`}
      data-media-dock-bar
      aria-label="Add more media"
    >
      {barInner}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className={`${barTone} ${BAR_SLOT} justify-start active:scale-[0.99]`}
      data-media-dock-bar
      aria-expanded={false}
      aria-label={hasMedia ? "Show media manager" : "Add media"}
    >
      {barInner}
    </button>
  );

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      {expanded ? (
        <div
          className="pointer-events-auto absolute inset-0"
          aria-hidden
          onPointerDown={closeManager}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute bottom-2 left-1/2 z-[1] w-[calc(100%-1rem)] -translate-x-1/2"
        style={CREATE_FINALIZE_DOCK_CSS_VARS}
      >
        <div
          className={`${CREATE_FINALIZE_DOCK_STACK_CLASS}`}
          style={{ gap: CREATE_FINALIZE_DOCK_STACK_GAP_CSS }}
          data-media-tray-placement="overlay"
          data-media-dock-stack="strip-above-bar"
        >
          {stripPanel}
          {dockBar}
        </div>
      </div>
    </div>
  );
}
