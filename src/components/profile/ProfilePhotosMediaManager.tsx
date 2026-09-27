import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
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
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PiArrowsOut,
  PiDotsSixVertical,
  PiImages,
  PiPlus,
} from "react-icons/pi";
import toast from "react-hot-toast";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { PROFILE_PHOTOS_MAX } from "../../lib/profilePhotos";

type Props = {
  photos: string[];
  busy: boolean;
  onAddPhotos: () => void;
  onRemove: (index: number) => void;
  /** May be async; manager applies optimistic order immediately on drop. */
  onReorder: (fromIndex: number, toIndex: number) => void | Promise<void>;
  /** Full-screen viewer — only via explicit expand control. */
  onOpenFullscreen: (index: number) => void;
};

const MAX = PROFILE_PHOTOS_MAX;

/** ~40px dock: 32px controls + equal 4px pad all sides (snug). */
const BAR_SURFACE = [
  "flex w-full min-w-0 items-center gap-1 rounded-full border border-[var(--border)]/60 p-1 text-left",
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-sm",
  "transition-[opacity,border-color] max-w-full",
].join(" ");

const PANEL =
  "w-full min-w-0 max-w-full rounded-[16px] border border-[var(--border)] p-2 " +
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-sm";

const COUNT_DISC =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] " +
  "bg-[var(--surface-2)]/80 text-[10px] font-semibold tabular-nums text-[var(--text)]/85";

const ICON_DISC =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] " +
  "bg-[var(--surface-2)]/70 text-[var(--text)]/80";

const PLUS_DISC =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-ink)]";

/** Source remains 4:5; display uses object-cover in a modestly taller compact rect. */
const HERO_FRAME =
  "relative w-full min-w-0 max-w-full h-[min(72vw,340px)] overflow-hidden rounded-[22px] " +
  "border border-[var(--border)]/50 bg-[var(--surface-2)]/40";

/** Collapsed vibe pills fill the middle, with room so rings/edges aren't clipped. */
const COLLAPSED_THUMB =
  "relative h-8 min-w-0 flex-1 overflow-hidden rounded-full";

/** Fixed height ≈ prior 3-col aspect tile — manager height no longer varies by count. */
const EXPANDED_THUMB =
  "relative box-border h-[7.5rem] w-full min-w-0 overflow-hidden rounded-[12px] " +
  "bg-[var(--surface-2)]/40 border border-[var(--border)]/35";

const EXPANDED_GRID =
  "grid w-full min-w-0 grid-cols-3 gap-2";

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

function remapIndexAfterRemove(
  selected: number,
  removed: number,
  newLen: number,
): number {
  if (newLen <= 0) return 0;
  if (selected < removed) return selected;
  if (selected > removed) return Math.min(selected - 1, newLen - 1);
  return Math.min(removed, newLen - 1);
}

/** Column placement so 1/2/3 photos share the same 3-col shell height. */
function expandedThumbColClass(count: number, index: number): string {
  if (count === 1) return "col-start-2";
  if (count === 2) return index === 0 ? "col-start-1" : "col-start-2";
  return "";
}

function SortablePhotoThumb({
  id,
  src,
  isPrimary,
  isSelected,
  canReorder,
  skipClickRef,
  onSelect,
  onRemove,
  className = "",
}: {
  id: string;
  src: string;
  isPrimary: boolean;
  isSelected: boolean;
  canReorder: boolean;
  skipClickRef: MutableRefObject<boolean>;
  onSelect: () => void;
  onRemove: () => void;
  className?: string;
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
  const resolved = avatarDisplayUrl(src);
  // Drag stays horizontal-only; idle selected tile lifts ~2px without layout shift.
  const locked = transform
    ? { x: transform.x, y: 0, scaleX: 1, scaleY: 1 }
    : isSelected
      ? { x: 0, y: -2, scaleX: 1, scaleY: 1 }
      : null;

  const touchDragProps =
    canReorder && listeners?.onTouchStart
      ? {
          onTouchStart:
            listeners.onTouchStart as React.TouchEventHandler<HTMLButtonElement>,
        }
      : {};
  const mouseDragProps =
    canReorder && listeners?.onMouseDown
      ? {
          onMouseDown:
            listeners.onMouseDown as React.MouseEventHandler<HTMLButtonElement>,
        }
      : {};
  const keyboardDragProps =
    canReorder && listeners?.onKeyDown
      ? {
          onKeyDown:
            listeners.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement>,
        }
      : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(locked),
        transition: transition ?? "transform 120ms ease",
      }}
      className={[
        EXPANDED_THUMB,
        className,
        isPrimary
          ? "border-2 border-[var(--brand)] ring-0 shadow-[0_0_10px_color-mix(in_oklab,var(--brand)_50%,transparent)]"
          : "",
        isDragging ? "z-10 opacity-90 shadow-lg" : "",
      ].join(" ")}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 z-[1] touch-manipulation cursor-default"
        aria-label={
          isPrimary
            ? "Primary photo — tap to select"
            : "Tap to select photo"
        }
        {...touchDragProps}
        onClick={(e) => {
          e.stopPropagation();
          if (skipClickRef.current) return;
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
      {canReorder ? (
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
          ].join(" ")}
          aria-label="Reorder image"
          {...attributes}
          {...mouseDragProps}
          {...keyboardDragProps}
          {...touchDragProps}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <PiDotsSixVertical className="h-3.5 w-3.5 pointer-events-none" />
        </button>
      ) : null}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 z-[3] flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[var(--text)] text-base leading-none shadow-sm backdrop-blur-sm"
        aria-label="Remove photo"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Compact Profile photo hero + overlapping Create-style media dock.
 */
export default function ProfilePhotosMediaManager({
  photos,
  busy,
  onAddPhotos,
  onRemove,
  onReorder,
  onOpenFullscreen,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  /**
   * Rendered order — updated optimistically on drop so dnd-kit does not snap
   * back to the pre-drop `photos` prop while persistence is in flight.
   */
  const [renderedPhotos, setRenderedPhotos] = useState(photos);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const skipClickRef = useRef(false);
  const draggingRef = useRef(false);
  const count = renderedPhotos.length;
  const atCap = count >= MAX;
  const addLabel =
    count === 0 ? "Add photos" : count === MAX - 1 ? "Add photo" : "Add photos";

  const safeActive = count === 0 ? 0 : Math.min(activePhotoIndex, count - 1);
  const activeSrc = count > 0 ? renderedPhotos[safeActive] : null;
  const activeResolved = activeSrc ? avatarDisplayUrl(activeSrc) : null;

  const items = useMemo(
    () =>
      renderedPhotos.map((src, index) => ({
        // Stable per path (no index) so reorder does not remount tiles.
        id: `profile-photo-${src}`,
        src,
        index,
      })),
    [renderedPhotos],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const canReorder = items.length > 1;

  useEffect(() => {
    setRenderedPhotos(photos);
  }, [photos]);

  useEffect(() => {
    if (count === 0) {
      setActivePhotoIndex(0);
      return;
    }
    setActivePhotoIndex((prev) => Math.min(Math.max(0, prev), count - 1));
  }, [count]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!expanded || draggingRef.current) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setExpanded(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [expanded]);

  const collapseIfIdle = () => {
    if (draggingRef.current || skipClickRef.current) return;
    setExpanded(false);
  };

  const onDragEnd = (event: DragEndEvent) => {
    draggingRef.current = false;
    const { active, over } = event;
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((item) => item.id === active.id);
    const newIdx = items.findIndex((item) => item.id === over.id);
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;

    const previous = renderedPhotos;
    const nextPhotos = arrayMove(previous, oldIdx, newIdx);
    // Commit rendered order before dnd-kit clears transforms → no snap-back.
    setRenderedPhotos(nextPhotos);
    setActivePhotoIndex(newIdx);
    void Promise.resolve(onReorder(oldIdx, newIdx)).catch(() => {
      setRenderedPhotos(previous);
    });
  };

  const handleAddClick = () => {
    if (busy) return;
    if (atCap) {
      toast.error("Remove a photo to add another.");
      return;
    }
    onAddPhotos();
  };

  const cycleActive = () => {
    if (count <= 1) return;
    setActivePhotoIndex((prev) => (prev + 1) % count);
  };

  /** Collapsed Edit Profile hero: open existing manager. Already expanded: cycle only.
   * Zero photos: first tap starts Add immediately (same gesture for web file input). */
  const handleHeroSurfaceActivate = () => {
    if (busy) return;
    if (count === 0) {
      if (!expanded) setExpanded(true);
      handleAddClick();
      return;
    }
    if (!expanded) {
      setExpanded(true);
      return;
    }
    cycleActive();
  };

  const handleRemoveAt = (index: number) => {
    const nextLen = Math.max(0, count - 1);
    setActivePhotoIndex((prev) => remapIndexAfterRemove(prev, index, nextLen));
    onRemove(index);
  };

  const collapsedBarTone = [
    BAR_SURFACE,
    busy ? "opacity-50" : "opacity-[0.64]",
  ].join(" ");

  const expandedBarTone = [BAR_SURFACE, busy ? "opacity-70" : ""].join(" ");

  return (
    <section
      ref={rootRef}
      className="mb-3 w-full min-w-0 max-w-full"
      aria-label="Profile photos"
      aria-busy={busy}
    >
      <div className={HERO_FRAME}>
        {count === 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleHeroSurfaceActivate}
            className={[
              "absolute inset-0 z-0 flex flex-col items-center justify-center gap-1 px-6 text-center",
              "touch-manipulation transition-opacity active:opacity-90",
              "disabled:cursor-default disabled:opacity-50",
            ].join(" ")}
            aria-label="Add profile photos"
          >
            <span className="text-[13px] font-medium text-[var(--text)]/45">
              No photos yet
            </span>
            <span className="text-[11px] text-[var(--text)]/35">
              Add up to {MAX}
            </span>
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={handleHeroSurfaceActivate}
              className={[
                "absolute inset-0 z-0 touch-manipulation transition-opacity",
                "active:opacity-90 disabled:cursor-default disabled:opacity-50",
              ].join(" ")}
              aria-label={
                !expanded
                  ? "Manage profile photos"
                  : count <= 1
                    ? "Profile photo"
                    : "Show next profile photo"
              }
            >
              {activeResolved ? (
                <img
                  src={activeResolved}
                  alt=""
                  className="h-full w-full object-cover pointer-events-none"
                  draggable={false}
                />
              ) : (
                <span className="block h-full w-full bg-[var(--surface-2)]" />
              )}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenFullscreen(safeActive);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={[
                "absolute right-2.5 top-2.5 z-[2] flex h-8 w-8 items-center justify-center",
                "rounded-full border border-white/35 bg-black/35 text-white",
                "shadow-sm backdrop-blur-sm",
                "active:scale-[0.96] disabled:opacity-50",
              ].join(" ")}
              aria-label="View full screen"
            >
              <PiArrowsOut className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] px-1.5 pb-2">
          <div className="pointer-events-auto flex w-full min-w-0 flex-col gap-2">
            {expanded && count > 0 ? (
              <div
                className={PANEL}
                role="region"
                aria-label="Reorder profile photos"
                onClick={collapseIfIdle}
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToHorizontalAxis]}
                  onDragStart={() => {
                    draggingRef.current = true;
                    skipClickRef.current = true;
                  }}
                  onDragEnd={onDragEnd}
                  onDragCancel={() => {
                    draggingRef.current = false;
                    skipClickRef.current = false;
                  }}
                >
                  <SortableContext
                    items={items.map((item) => item.id)}
                    strategy={horizontalListSortingStrategy}
                    disabled={!canReorder || busy}
                  >
                    <div className={EXPANDED_GRID}>
                      {items.map((item, i) => (
                        <SortablePhotoThumb
                          key={item.id}
                          id={item.id}
                          src={item.src}
                          isPrimary={i === 0}
                          isSelected={i === safeActive}
                          canReorder={canReorder && !busy}
                          skipClickRef={skipClickRef}
                          onSelect={() => setActivePhotoIndex(i)}
                          onRemove={() => handleRemoveAt(i)}
                          className={expandedThumbColClass(count, i)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            ) : null}

            {expanded ? (
              <div className={expandedBarTone} onClick={collapseIfIdle}>
                <button
                  type="button"
                  disabled={busy}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddClick();
                  }}
                  className="flex min-h-8 shrink-0 items-center gap-2 active:scale-[0.99] disabled:opacity-50"
                  aria-label={addLabel}
                >
                  <span className={atCap ? `${PLUS_DISC} opacity-40` : PLUS_DISC}>
                    <PiPlus className="h-[1.05rem] w-[1.05rem]" />
                  </span>
                  <span className="truncate text-[14px] font-semibold text-[var(--text)]">
                    {atCap ? "All photos added" : addLabel}
                  </span>
                </button>

                <span className="min-h-8 min-w-0 flex-1" aria-hidden />

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                  }}
                  className={COUNT_DISC}
                  aria-label="Collapse photo manager"
                >
                  {count}/{MAX}
                </button>
              </div>
            ) : count === 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleAddClick}
                className={[
                  collapsedBarTone,
                  "justify-start active:scale-[0.99] disabled:opacity-50",
                ].join(" ")}
                aria-label="Add profile photos"
              >
                <span className={PLUS_DISC}>
                  <PiPlus className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text)]">
                  Add photos
                </span>
                <span className={COUNT_DISC}>0/{MAX}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setExpanded(true)}
                className={[
                  collapsedBarTone,
                  "justify-start active:scale-[0.99] disabled:opacity-50",
                ].join(" ")}
                aria-expanded={false}
                aria-label="Show profile photo manager"
              >
                <span className={ICON_DISC} aria-hidden>
                  <PiImages className="h-[1.05rem] w-[1.05rem]" />
                </span>

                <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-0.5">
                  {renderedPhotos.map((src, i) => {
                    const resolved = avatarDisplayUrl(src);
                    const isPrimary = i === 0;
                    return (
                      <span
                        key={`collapsed-${src}`}
                        className={[
                          COLLAPSED_THUMB,
                          isPrimary
                            ? "ring-2 ring-inset ring-[var(--brand)]"
                            : "ring-1 ring-inset ring-white/25",
                        ].join(" ")}
                        aria-hidden
                      >
                        {resolved ? (
                          <img
                            src={resolved}
                            alt=""
                            className="h-full w-full object-cover pointer-events-none"
                            draggable={false}
                          />
                        ) : null}
                      </span>
                    );
                  })}
                </span>

                <span className={COUNT_DISC}>
                  {count}/{MAX}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
