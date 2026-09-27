import { useRef } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { PiDotsSixVertical, PiFilmStrip, PiPlayFill } from "react-icons/pi";
import {
  beginFinalizeMediaRemoveOnce,
  beginFinalizeMediaTrayRemoveTransaction,
  claimFinalizeMediaRemoveMouseDown,
  claimFinalizeMediaRemovePointerDown,
  claimFinalizeMediaRemoveTouchStart,
  endFinalizeMediaTrayRemoveTransaction,
  isFinalizeMediaRemoveTarget,
} from "../../lib/createFinalizeMediaRemoveGesture";
import {
  mediaRemoveDiag,
  targetDiagSnapshot,
} from "../../lib/createFinalizeMediaRemoveDiag";
import {
  FINALIZE_MEDIA_THUMB_CLIP,
  finalizeMediaThumbShellClass,
} from "../../lib/createFinalizeMediaThumb";
import type { PostVideoUploadJob } from "../../lib/createPostVideoUpload";

export type FinalizeVideoTileSortableProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  transformStyle?: React.CSSProperties;
  transition?: string;
  isDragging: boolean;
  canReorder: boolean;
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
  skipClickRef: React.MutableRefObject<boolean>;
};

type Props = {
  job: PostVideoUploadJob;
  isCover?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  sortable?: FinalizeVideoTileSortableProps;
  /** mediaOrder clientId for remove diagnostics (defaults to job.localId) */
  mediaClientId?: string;
  mediaIndex?: number;
  activeIndex?: number;
};

function VideoTileInner({ job }: { job: PostVideoUploadJob }) {
  const localPoster = job.localPosterUrl?.trim() || null;
  const remotePoster =
    job.status === "ready" &&
    typeof job.posterUrl === "string" &&
    job.posterUrl.trim()
      ? job.posterUrl
      : null;
  const posterSrc = localPoster ?? remotePoster;

  const statusLabel =
    job.status === "removing"
      ? "Removing…"
      : job.status === "local_error"
        ? "Unavailable"
        : job.status === "publish_uploading"
          ? `${job.progress}%`
          : job.status === "publish_processing"
            ? "Processing"
            : job.status === "preparing"
              ? "Preparing"
              : job.status === "uploading"
                ? `${job.progress}%`
                : job.status === "processing"
                  ? "Processing"
                  : job.status === "error"
                    ? "Failed"
                    : null;

  return (
    <>
      {posterSrc && job.status !== "removing" ? (
        <img
          src={posterSrc}
          alt=""
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--surface-2)]/90 px-1 text-center">
          <PiFilmStrip
            className="h-5 w-5 text-[var(--text)]/55"
            aria-hidden
          />
          {statusLabel ? (
            <span className="text-[9px] font-semibold leading-tight text-[var(--text)]/72">
              {statusLabel}
            </span>
          ) : null}
        </div>
      )}

      {(job.status === "uploading" ||
        job.status === "preparing" ||
        job.status === "publish_uploading") && (
        <div
          className="absolute inset-x-0 bottom-0 z-[2] h-1 bg-[var(--surface)]/50"
          aria-hidden
        >
          <div
            className="h-full bg-[var(--create-chooser-cta-selected-surface)] transition-[width] duration-150"
            style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
          />
        </div>
      )}

      {job.status !== "removing" && job.status !== "error" ? (
        <span
          className="pointer-events-none absolute bottom-1 right-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white shadow-sm"
          aria-hidden
        >
          <PiPlayFill className="h-2.5 w-2.5" />
        </span>
      ) : null}

      {job.status !== "removing" ? (
        <span
          className="pointer-events-none absolute left-1 top-1 z-[2] rounded bg-black/55 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-white/90"
          aria-hidden
        >
          Video
        </span>
      ) : null}

      {job.status === "error" ? (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 z-[2] truncate rounded bg-black/65 px-1 py-px text-[8px] font-medium leading-tight text-white">
          {job.errorMessage ?? "Failed"}
        </span>
      ) : null}
    </>
  );
}

function dragListenerProps(
  canReorder: boolean,
  listeners: SyntheticListenerMap | undefined,
) {
  return {
    touch:
      canReorder && listeners?.onTouchStart
        ? {
            onTouchStart:
              listeners.onTouchStart as React.TouchEventHandler<HTMLButtonElement>,
          }
        : {},
    mouse:
      canReorder && listeners?.onMouseDown
        ? {
            onMouseDown:
              listeners.onMouseDown as React.MouseEventHandler<HTMLButtonElement>,
          }
        : {},
    keyboard:
      canReorder && listeners?.onKeyDown
        ? {
            onKeyDown:
              listeners.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement>,
          }
        : {},
  };
}

export function FinalizeMediaDragHandle({
  canReorder,
  isDragging,
  setActivatorNodeRef,
  dragAttributes,
  dragListeners,
  ariaLabel,
}: {
  canReorder: boolean;
  isDragging: boolean;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
  ariaLabel: string;
}) {
  const listenerProps = dragListenerProps(canReorder, dragListeners);
  if (!canReorder) return null;

  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={[
        "absolute bottom-1 left-1 z-[2] flex h-5 w-5 items-center justify-center rounded-sm",
        "border border-[var(--border)]/35 bg-[var(--surface)]/85 text-[var(--text)] shadow-sm",
        "cursor-grab touch-manipulation transition-[transform,background-color,box-shadow]",
        "hover:bg-[var(--surface)] hover:shadow-md hover:scale-105",
        "active:cursor-grabbing active:scale-95",
        isDragging
          ? "cursor-grabbing scale-105 bg-[var(--surface)] shadow-md"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
      {...dragAttributes}
      {...listenerProps.mouse}
      {...listenerProps.keyboard}
      {...listenerProps.touch}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <PiDotsSixVertical className="h-3.5 w-3.5 pointer-events-none" />
    </button>
  );
}

/**
 * Shared × control for image + video thumbs (LI1D.3).
 * Owns the tap gesture so the full-bleed select layer underneath never
 * steals the first press.
 *
 * LI1D.4: DEV-only remove gesture diagnostics (no behavior change).
 */
export function FinalizeMediaRemoveButton({
  onRemove,
  disabled,
  ariaLabel,
  skipClickRef,
  clientId,
  itemKind,
}: {
  onRemove: () => void;
  disabled?: boolean;
  ariaLabel: string;
  /** When set, marks strip skip so a leaked select click is ignored. */
  skipClickRef?: React.MutableRefObject<boolean>;
  /** LI1D.4 diagnostics identity */
  clientId?: string;
  itemKind?: "image" | "video";
}) {
  const firedRef = useRef(false);
  const resetOnceTimerRef = useRef<number | null>(null);

  const scheduleOnceGuardReset = () => {
    if (resetOnceTimerRef.current != null) {
      window.clearTimeout(resetOnceTimerRef.current);
    }
    // LI1D.5: gesture-scoped once guard — block only the synthetic duplicate
    // click from the same touch, then allow later legitimate removes.
    resetOnceTimerRef.current = window.setTimeout(() => {
      firedRef.current = false;
      resetOnceTimerRef.current = null;
    }, 400);
  };

  const fire = (from: "pointerdown" | "click") => {
    if (disabled) {
      mediaRemoveDiag("blocked-disabled", {
        clientId: clientId ?? null,
        itemKind: itemKind ?? null,
        from,
      });
      return;
    }
    const onceOk = beginFinalizeMediaRemoveOnce(firedRef);
    if (!onceOk) {
      mediaRemoveDiag("blocked-once-guard", {
        clientId: clientId ?? null,
        itemKind: itemKind ?? null,
        from,
      });
      return;
    }
    // Tray-wide lock: blocks sibling × that slides under the same touch after
    // layout shift (IMAGE and VIDEO have different clientIds / once guards).
    const trayClientId = clientId?.trim() || `__anon-${itemKind ?? "media"}`;
    const trayOk = beginFinalizeMediaTrayRemoveTransaction(trayClientId);
    if (!trayOk) {
      firedRef.current = false;
      mediaRemoveDiag("blocked-tray-txn", {
        clientId: clientId ?? null,
        itemKind: itemKind ?? null,
        from,
      });
      return;
    }
    scheduleOnceGuardReset();
    if (skipClickRef) {
      skipClickRef.current = true;
      window.setTimeout(() => {
        skipClickRef.current = false;
      }, 0);
    }
    mediaRemoveDiag("invoke", {
      clientId: clientId ?? null,
      itemKind: itemKind ?? null,
      from,
    });
    onRemove();
    // Release after commit + paint; brief suppress for synthetic sibling clicks.
    endFinalizeMediaTrayRemoveTransaction();
  };

  return (
    <button
      type="button"
      data-finalize-media-no-dnd="true"
      data-remove-client-id={clientId ?? undefined}
      data-remove-item-kind={itemKind ?? undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      // Comfortable mobile hit target; visual disc stays ~28px via inner span.
      className="absolute top-0 right-0 z-[5] flex h-9 w-9 items-start justify-end p-0.5 touch-manipulation disabled:opacity-50"
      onPointerDown={(e) => {
        const skipClickBefore = skipClickRef?.current ?? false;
        const claimed = claimFinalizeMediaRemovePointerDown(e);
        mediaRemoveDiag("pointerdown", {
          eventType: "pointerdown",
          pointerType: e.pointerType,
          clientId: clientId ?? null,
          itemKind: itemKind ?? null,
          defaultPrevented: e.defaultPrevented,
          claimed,
          removingAlready: firedRef.current,
          skipClickBefore,
          ...targetDiagSnapshot(e.target),
        });
        if (!claimed) return;
        // Touch/pen: remove immediately (preventDefault blocks click).
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          fire("pointerdown");
        }
      }}
      onTouchStart={(e) => {
        claimFinalizeMediaRemoveTouchStart(e);
      }}
      onMouseDown={(e) => {
        claimFinalizeMediaRemoveMouseDown(e);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const skipClick = skipClickRef?.current ?? false;
        const onceAlready = firedRef.current;
        mediaRemoveDiag("click", {
          eventType: "click",
          pointerType: "mouse-or-keyboard",
          clientId: clientId ?? null,
          itemKind: itemKind ?? null,
          defaultPrevented: e.defaultPrevented,
          skipClick,
          onceGuardTriggered: onceAlready,
          removingAlready: onceAlready,
          skipClickBefore: skipClick,
          ...targetDiagSnapshot(e.target),
        });
        // Mouse + keyboard: click is the primary activation.
        fire("click");
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[var(--text)] text-base leading-none shadow-sm backdrop-blur-sm"
      >
        ×
      </span>
    </button>
  );
}

export default function CreateFinalizeVideoTile({
  job,
  isCover = false,
  isSelected = false,
  onSelect,
  onRemove,
  removeDisabled = false,
  sortable,
  mediaClientId,
  mediaIndex,
  activeIndex,
}: Props) {
  const shellClass = finalizeMediaThumbShellClass({
    isCover,
    isSelected,
    isError: job.status === "error",
    isDragging: sortable?.isDragging,
  });

  const diagClientId = mediaClientId ?? job.localId ?? null;

  const listenerProps = sortable
    ? dragListenerProps(sortable.canReorder, sortable.dragListeners)
    : { touch: {}, mouse: {}, keyboard: {} };

  const shell = (
    <>
      <div className={FINALIZE_MEDIA_THUMB_CLIP}>
        {onSelect ? (
          <button
            type="button"
            className="absolute inset-0 z-[1] touch-manipulation cursor-default"
            aria-label={isSelected ? "Video cover selected" : "Select video cover"}
            aria-pressed={isSelected}
            disabled={job.status === "removing"}
            {...listenerProps.touch}
            onClick={(e) => {
              e.stopPropagation();
              const skipClick = Boolean(sortable?.skipClickRef.current);
              const removeTarget = isFinalizeMediaRemoveTarget(e.target);
              mediaRemoveDiag("select-check", {
                clientId: diagClientId,
                itemKind: "video",
                removeTarget,
                skipClick,
                selected: isSelected,
                currentIndex: mediaIndex ?? null,
                activeIndex: activeIndex ?? null,
              });
              if (skipClick) {
                mediaRemoveDiag("blocked-skip-click", {
                  clientId: diagClientId,
                  itemKind: "video",
                });
                return;
              }
              if (removeTarget) return;
              onSelect();
            }}
          >
            <VideoTileInner job={job} />
          </button>
        ) : (
          <div className="absolute inset-0" role="status">
            <VideoTileInner job={job} />
          </div>
        )}
      </div>

      {sortable ? (
        <FinalizeMediaDragHandle
          canReorder={sortable.canReorder}
          isDragging={sortable.isDragging}
          setActivatorNodeRef={sortable.setActivatorNodeRef}
          dragAttributes={sortable.dragAttributes}
          dragListeners={sortable.dragListeners}
          ariaLabel="Reorder video"
        />
      ) : null}

      {onRemove ? (
        <FinalizeMediaRemoveButton
          onRemove={onRemove}
          disabled={removeDisabled || job.status === "removing"}
          skipClickRef={sortable?.skipClickRef}
          clientId={diagClientId ?? undefined}
          itemKind="video"
          ariaLabel={
            job.status === "publish_uploading" ||
            job.status === "preparing" ||
            job.status === "uploading"
              ? "Cancel video upload"
              : "Remove video"
          }
        />
      ) : null}
    </>
  );

  if (sortable) {
    return (
      <div
        ref={sortable.setNodeRef}
        style={{
          ...sortable.transformStyle,
          transition: sortable.isDragging ? sortable.transition : undefined,
        }}
        className={`${shellClass} touch-manipulation`}
      >
        {shell}
      </div>
    );
  }

  return <div className={`${shellClass} touch-manipulation`}>{shell}</div>;
}
