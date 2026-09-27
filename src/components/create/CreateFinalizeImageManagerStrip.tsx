import { useMemo, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ActivityType } from "../../types/post";
import {
  deriveSlot0ImagesFromMediaOrder,
  getDraftMediaCoverItem,
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
  reorderMediaOrderByClientIds,
  removeMediaOrderItemByClientId,
  writeSlot0ImagesForMediaReconcile,
  type DraftMediaOrderItem,
} from "../../lib/createDraftMediaOrder";
import {
  cleanupDraftImageAsset,
  readDraftImagesMeta,
  removeDraftImageFromDraftMeta,
} from "../../lib/createDraftImage";
import { useCreateImagePreviewSrc } from "../../lib/createDraftImage/useCreateImagePreviewSrc";
import { readDraftPublishPostId } from "../../lib/drafts";
import { supabase } from "../../lib/supabaseClient";
import {
  remapHeroIndexAfterMediaMove,
  remapHeroIndexAfterMediaRemove,
} from "../../lib/createFinalizeHeroMedia";
import {
  FINALIZE_MEDIA_THUMB_CLIP,
  finalizeMediaThumbShellClass,
} from "../../lib/createFinalizeMediaThumb";
import {
  isFinalizeMediaRemoveTarget,
  isFinalizeMediaTrayRemoveLocked,
} from "../../lib/createFinalizeMediaRemoveGesture";
import {
  compactLocalSentinelIdsFromImages,
  compactMediaOrderForDiag,
  mediaRemoveDiag,
} from "../../lib/createFinalizeMediaRemoveDiag";
import { countCreateFinalizeImages } from "../../lib/createFinalizeMediaPresence";
import { useCreatePostMedia } from "./CreatePostMediaProvider";
import CreateFinalizeVideoTile, {
  FinalizeMediaDragHandle,
  FinalizeMediaRemoveButton,
} from "./CreateFinalizeVideoTile";

/**
 * Finalize media strip. Slot-0 order is driven by `draftMeta.mediaOrder`.
 * Images on later activity rows stay on those rows (legacy multi-stop safety).
 */

type Props = {
  activities: ActivityType[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  selectedPreviewIndex: number;
  onSelectPreviewIndex: (index: number) => void;
  recordDiscreteBefore?: () => void;
  onDragActiveChange?: (active: boolean) => void;
  compactTray?: boolean;
};

const PANEL =
  "rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-hero-outline)] px-3 py-3 backdrop-blur-xl " +
  "bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_8px_22px_rgba(0,0,0,0.1)] backdrop-saturate-150 " +
  "app-dark:border-white/88 app-dark:bg-black/32 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150 " +
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_28px_rgba(0,0,0,0.28)]";

const COMPACT_TRAY_PANEL =
  "rounded-2xl border border-[var(--create-border-hero-outline)]/75 px-1 py-1 backdrop-blur-md " +
  "bg-white/42 shadow-[0_2px_10px_rgba(0,0,0,0.08)] " +
  "app-dark:border-white/35 app-dark:bg-black/24 app-dark:shadow-[0_4px_14px_rgba(0,0,0,0.22)]";

const THUMB_CLIP = FINALIZE_MEDIA_THUMB_CLIP;

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

function sameImageOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((src, i) => src === b[i]);
}

function SortableImageThumb({
  id,
  src,
  isCover,
  isSelected,
  canReorder,
  skipClickRef,
  mediaIndex,
  activeIndex,
  onSelect,
  onRemove,
}: {
  id: string;
  src: string;
  isCover: boolean;
  isSelected: boolean;
  canReorder: boolean;
  skipClickRef: React.MutableRefObject<boolean>;
  mediaIndex: number;
  activeIndex: number;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canReorder });
  const resolved = useCreateImagePreviewSrc(src, id);
  const locked = transform ? { ...transform, y: 0 } : null;

  const touchDragProps =
    canReorder && listeners?.onTouchStart
      ? {
          onTouchStart:
            listeners.onTouchStart as React.TouchEventHandler<HTMLButtonElement>,
        }
      : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(locked),
        transition: isDragging ? transition : undefined,
      }}
      className={finalizeMediaThumbShellClass({
        isCover,
        isSelected,
        isDragging,
      })}
    >
      <div className={THUMB_CLIP}>
        <button
          type="button"
          className="absolute inset-0 z-[1] touch-manipulation cursor-default"
          aria-label={
            isCover ? "Cover photo, tap to preview" : "Preview photo"
          }
          {...touchDragProps}
          onClick={(e) => {
            e.stopPropagation();
            const skipClick = skipClickRef.current;
            const removeTarget = isFinalizeMediaRemoveTarget(e.target);
            mediaRemoveDiag("select-check", {
              clientId: id,
              itemKind: "image",
              removeTarget,
              skipClick,
              selected: isSelected,
              currentIndex: mediaIndex,
              activeIndex,
            });
            if (skipClick) {
              mediaRemoveDiag("blocked-skip-click", {
                clientId: id,
                itemKind: "image",
              });
              return;
            }
            if (removeTarget) return;
            onSelect();
          }}
        >
          {resolved ? (
            <img
              src={resolved}
              alt=""
              className="h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <span className="block h-full w-full bg-[var(--surface-2)]" />
          )}
        </button>
      </div>
      <FinalizeMediaDragHandle
        canReorder={canReorder}
        isDragging={isDragging}
        setActivatorNodeRef={setActivatorNodeRef}
        dragAttributes={attributes}
        dragListeners={listeners}
        ariaLabel="Reorder image"
      />
      <FinalizeMediaRemoveButton
        onRemove={onRemove}
        skipClickRef={skipClickRef}
        clientId={id}
        itemKind="image"
        ariaLabel="Remove image"
      />
    </div>
  );
}

function SortableVideoThumb({
  clientId,
  job,
  isCover,
  isSelected,
  canReorder,
  skipClickRef,
  mediaIndex,
  activeIndex,
  onSelect,
  onRemove,
  removeDisabled,
}: {
  clientId: string;
  job: NonNullable<ReturnType<typeof useCreatePostMedia>["videoJob"]>;
  isCover: boolean;
  isSelected: boolean;
  canReorder: boolean;
  skipClickRef: React.MutableRefObject<boolean>;
  mediaIndex: number;
  activeIndex: number;
  onSelect: () => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clientId, disabled: !canReorder });
  const locked = transform ? { ...transform, y: 0 } : null;

  return (
    <CreateFinalizeVideoTile
      job={job}
      isCover={isCover}
      isSelected={isSelected}
      onSelect={onSelect}
      onRemove={onRemove}
      removeDisabled={removeDisabled}
      mediaClientId={clientId}
      mediaIndex={mediaIndex}
      activeIndex={activeIndex}
      sortable={{
        setNodeRef,
        setActivatorNodeRef,
        transformStyle: locked
          ? { transform: CSS.Translate.toString(locked) }
          : undefined,
        transition,
        isDragging,
        canReorder,
        dragAttributes: attributes,
        dragListeners: listeners,
        skipClickRef,
      }}
    />
  );
}

function StaticThumb({
  src,
  stopLabel,
  isSelected,
  onSelect,
  onRemove,
}: {
  src: string;
  stopLabel: string;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const resolved = useCreateImagePreviewSrc(src);
  return (
    <div className={finalizeMediaThumbShellClass({ isSelected })}>
      <div className={THUMB_CLIP}>
        <button
          type="button"
          className="absolute inset-0"
          aria-label="Preview photo"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {resolved ? (
            <img
              src={resolved}
              alt=""
              className="h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <span className="block h-full w-full bg-[var(--surface-2)]" />
          )}
        </button>
        <span className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-[var(--surface)]/80 px-1 py-px text-[9px] font-medium text-[var(--text)]">
          {stopLabel}
        </span>
      </div>
      <FinalizeMediaRemoveButton
        onRemove={onRemove}
        ariaLabel="Remove image"
      />
    </div>
  );
}

export default function CreateFinalizeImageManagerStrip({
  activities,
  setActivities,
  selectedPreviewIndex,
  onSelectPreviewIndex,
  recordDiscreteBefore,
  onDragActiveChange,
  compactTray = false,
}: Props) {
  const skipClickRef = useRef(false);
  const removingClientIdsRef = useRef<Set<string>>(new Set());
  const { videoJob, removePostVideo, mediaOrder, persistMediaOrder } =
    useCreatePostMedia();
  const slot0Order = mediaOrder;
  const coverItem = getDraftMediaCoverItem(slot0Order);

  const laterEntries = useMemo(() => {
    const out: { stopIdx: number; imgIdx: number; src: string }[] = [];
    activities.forEach((act, si) => {
      if (si === 0) return;
      (act.images || []).forEach((src, ii) => {
        out.push({ stopIdx: si, imgIdx: ii, src });
      });
    });
    return out;
  }, [activities]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const canReorder = slot0Order.length > 1;
  const slot0Count = slot0Order.length;

  const syncSlot0Images = (nextOrder: DraftMediaOrderItem[]) => {
    const nextImages = deriveSlot0ImagesFromMediaOrder(nextOrder);
    // LI1D.5: LS must match before any reconcile reads activities.
    writeSlot0ImagesForMediaReconcile(nextImages);
    setActivities((prev) => {
      const cur = Array.isArray(prev[0]?.images) ? prev[0].images : [];
      if (sameImageOrder(cur, nextImages)) return prev;
      return prev.map((act, i) =>
        i === 0 ? { ...act, images: nextImages } : act,
      );
    });
  };

  const clearRemovingGuard = (clientId: string) => {
    removingClientIdsRef.current.delete(clientId);
    mediaRemoveDiag("removing-guard-cleared", {
      clientId,
      remaining: Array.from(removingClientIdsRef.current),
    });
  };

  const removeLaterImage = (
    stopIdx: number,
    imgIdx: number,
    flatIndex: number,
  ) => {
    recordDiscreteBefore?.();
    const imageCountAfter = slot0Count + laterEntries.length - 1;
    setActivities((prev) =>
      prev.map((act, idx) => {
        if (idx !== stopIdx) return act;
        const arr = Array.isArray(act.images) ? [...act.images] : [];
        if (imgIdx < 0 || imgIdx >= arr.length) return act;
        return { ...act, images: arr.filter((_, i) => i !== imgIdx) };
      }),
    );
    onSelectPreviewIndex(
      remapHeroIndexAfterMediaRemove(
        selectedPreviewIndex,
        flatIndex,
        imageCountAfter,
      ),
    );
  };

  const removeSlot0MediaByClientId = (clientId: string) => {
    const removingIds = Array.from(removingClientIdsRef.current);
    const activeClientId =
      slot0Order[selectedPreviewIndex]?.clientId ?? null;

    mediaRemoveDiag("remove-entry", {
      requestedClientId: clientId,
      mediaOrderLength: slot0Order.length,
      mediaOrder: compactMediaOrderForDiag(slot0Order),
      foundIndex: slot0Order.findIndex((item) => item.clientId === clientId),
      activeIndex: selectedPreviewIndex,
      activeClientId,
      removingClientIds: removingIds,
    });

    // Defense in depth: sibling click-through after layout shift uses a
    // different clientId, so per-id once / removingClientIds are insufficient.
    // Owner (FinalizeMediaRemoveButton) is not locked against itself.
    if (isFinalizeMediaTrayRemoveLocked(clientId)) {
      mediaRemoveDiag("blocked-tray-txn", {
        clientId,
        removingClientIds: removingIds,
      });
      return;
    }

    if (removingClientIdsRef.current.has(clientId)) {
      mediaRemoveDiag("blocked-already-removing", {
        clientId,
        removingClientIds: removingIds,
      });
      return;
    }

    const mediaIndex = slot0Order.findIndex(
      (item) => item.clientId === clientId,
    );
    const item = mediaIndex >= 0 ? slot0Order[mediaIndex] : undefined;
    if (!item || mediaIndex < 0) {
      mediaRemoveDiag("clientId-not-found", {
        requestedClientId: clientId,
        currentClientIds: slot0Order.map((i) => i.clientId),
      });
      return;
    }

    removingClientIdsRef.current.add(clientId);
    recordDiscreteBefore?.();
    const beforeLength = slot0Order.length;
    const nextCount = slot0Order.length - 1;

    // Remap active index from the removed item's identity — never
    // "select then remove active".
    const nextActive = remapHeroIndexAfterMediaRemove(
      selectedPreviewIndex,
      mediaIndex,
      nextCount,
    );

    if (item.kind === "video") {
      const nextOrder = slot0Order.filter((i) => i.clientId !== clientId);
      mediaRemoveDiag("index-remap", {
        removedIndex: mediaIndex,
        oldActiveIndex: selectedPreviewIndex,
        newActiveIndex: nextActive,
        oldActiveClientId: activeClientId,
        newActiveClientId: nextOrder[nextActive]?.clientId ?? null,
      });
      mediaRemoveDiag("mediaOrder-after", {
        removedClientId: clientId,
        beforeLength,
        afterLength: nextOrder.length,
        remainingClientIds: nextOrder.map((i) => i.clientId),
        note: "video-remove-via-removePostVideo",
      });
      void removePostVideo();
      onSelectPreviewIndex(nextActive);
      clearRemovingGuard(clientId);
      return;
    }

    // LI1D.5: logical DraftMeta remove BEFORE mediaOrder/activities reconcile.
    let draftSnapshot: ReturnType<typeof removeDraftImageFromDraftMeta> = null;
    if (isLocalDraftImageUrl(item.url)) {
      const localId =
        localIdFromLocalDraftImageUrl(item.url) || item.clientId;
      draftSnapshot = removeDraftImageFromDraftMeta(localId);
      mediaRemoveDiag("explicit-remove-logical", {
        clientId,
        localIdMatched: localId,
        hadMeta: Boolean(draftSnapshot),
      });
      mediaRemoveDiag("draft-meta-after-logical-remove", {
        removedLocalId: localId,
        remainingLocalIds: readDraftImagesMeta().map((img) => img.localId),
      });
    }

    const nextOrder = removeMediaOrderItemByClientId(slot0Order, clientId);
    persistMediaOrder(nextOrder);
    syncSlot0Images(nextOrder);

    mediaRemoveDiag("mediaOrder-after", {
      removedClientId: clientId,
      beforeLength,
      afterLength: nextOrder.length,
      remainingClientIds: nextOrder.map((i) => i.clientId),
    });

    const nextImages = deriveSlot0ImagesFromMediaOrder(nextOrder);
    mediaRemoveDiag("activities-after", {
      imageCount: nextImages.length,
      localSentinelIds: compactLocalSentinelIdsFromImages(nextImages),
      note: "LS+React synced; reconcile must not resurrect",
    });

    const effectiveCount = countCreateFinalizeImages({
      activities: [{ images: nextImages }],
      mediaOrder: nextOrder,
    });
    mediaRemoveDiag("effective-count", { count: effectiveCount });

    mediaRemoveDiag("index-remap", {
      removedIndex: mediaIndex,
      oldActiveIndex: selectedPreviewIndex,
      newActiveIndex: nextActive,
      oldActiveClientId: activeClientId,
      newActiveClientId: nextOrder[nextActive]?.clientId ?? null,
    });

    onSelectPreviewIndex(nextActive);

    if (isLocalDraftImageUrl(item.url)) {
      const localId =
        localIdFromLocalDraftImageUrl(item.url) || item.clientId;
      mediaRemoveDiag("cleanup-before", {
        clientId,
        localIdMatched: localId,
        hasRemoteStoragePath: Boolean(
          draftSnapshot?.remoteStoragePath?.trim(),
        ),
        uiWaitsOnCleanup: false,
        note: "physical cleanup async; logical identity already removed",
      });
      void (async () => {
        let userId: string | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          userId = data.session?.user?.id ?? null;
        } catch {
          userId = null;
        }
        try {
          await cleanupDraftImageAsset(localId, {
            draftImage: draftSnapshot,
            publishPostId: readDraftPublishPostId() ?? undefined,
            deleteDraftOwnedRemote: true,
            userId,
          });
          mediaRemoveDiag("cleanup-after", {
            clientId,
            localIdMatched: localId,
            success: true,
            remainingLocalIds: readDraftImagesMeta().map((img) => img.localId),
          });
          mediaRemoveDiag("draftimage-meta", {
            removedLocalId: localId,
            remainingLocalIds: readDraftImagesMeta().map((img) => img.localId),
          });
        } catch (err) {
          mediaRemoveDiag("cleanup-after", {
            clientId,
            localIdMatched: localId,
            success: false,
            error: err instanceof Error ? err.message : "unknown",
            note: "logical remove kept; no UI resurrection",
          });
        } finally {
          clearRemovingGuard(clientId);
        }
      })();
      return;
    }

    // Remote/legacy image — no DraftImage physical cleanup.
    clearRemovingGuard(clientId);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
    if (!over || active.id === over.id) return;

    const oldIdx = slot0Order.findIndex(
      (item) => item.clientId === String(active.id),
    );
    const newIdx = slot0Order.findIndex(
      (item) => item.clientId === String(over.id),
    );
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

    const nextOrder = reorderMediaOrderByClientIds(
      slot0Order,
      String(active.id),
      String(over.id),
    );
    if (!nextOrder) return;

    recordDiscreteBefore?.();
    persistMediaOrder(nextOrder);
    syncSlot0Images(nextOrder);
    onSelectPreviewIndex(
      remapHeroIndexAfterMediaMove(selectedPreviewIndex, oldIdx, newIdx),
    );
  };

  const renderSlot0Item = (item: DraftMediaOrderItem, mediaIndex: number) => {
    const isCover = coverItem?.clientId === item.clientId;
    const isSelected = selectedPreviewIndex === mediaIndex;

    if (item.kind === "video") {
      if (!videoJob) return null;
      return (
        <SortableVideoThumb
          key={item.clientId}
          clientId={item.clientId}
          job={videoJob}
          isCover={isCover}
          isSelected={isSelected}
          canReorder={canReorder}
          skipClickRef={skipClickRef}
          mediaIndex={mediaIndex}
          activeIndex={selectedPreviewIndex}
          onSelect={() => onSelectPreviewIndex(mediaIndex)}
          onRemove={() => removeSlot0MediaByClientId(item.clientId)}
          removeDisabled={videoJob.status === "removing"}
        />
      );
    }

    return (
      <SortableImageThumb
        key={item.clientId}
        id={item.clientId}
        src={item.url}
        isCover={isCover}
        isSelected={isSelected}
        canReorder={canReorder}
        skipClickRef={skipClickRef}
        mediaIndex={mediaIndex}
        activeIndex={selectedPreviewIndex}
        onSelect={() => onSelectPreviewIndex(mediaIndex)}
        onRemove={() => removeSlot0MediaByClientId(item.clientId)}
      />
    );
  };

  return (
    <div
      className={compactTray ? COMPACT_TRAY_PANEL : PANEL}
      role="region"
      aria-label="Media order"
    >
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={() => {
            skipClickRef.current = true;
            onDragActiveChange?.(true);
          }}
          onDragEnd={(event) => {
            onDragActiveChange?.(false);
            onDragEnd(event);
          }}
          onDragCancel={() => {
            skipClickRef.current = false;
            onDragActiveChange?.(false);
          }}
        >
          <SortableContext
            items={slot0Order.map((item) => item.clientId)}
            strategy={horizontalListSortingStrategy}
            disabled={!canReorder}
          >
            <div className="flex items-stretch gap-2 px-0.5 py-0.5">
              {slot0Order.map((item, mediaIndex) =>
                renderSlot0Item(item, mediaIndex),
              )}
              {laterEntries.map((item, laterIdx) => {
                const flatIndex = slot0Count + laterIdx;
                return (
                  <StaticThumb
                    key={`later-${item.stopIdx}-${item.imgIdx}-${item.src.slice(0, 24)}`}
                    src={item.src}
                    stopLabel={`Stop ${item.stopIdx + 1}`}
                    isSelected={selectedPreviewIndex === flatIndex}
                    onSelect={() => onSelectPreviewIndex(flatIndex)}
                    onRemove={() =>
                      removeLaterImage(item.stopIdx, item.imgIdx, flatIndex)
                    }
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
