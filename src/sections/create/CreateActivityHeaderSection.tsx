// src/sections/create/CreateActivityHeaderSection.tsx
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PiDotsSixVertical, PiPlus } from "react-icons/pi";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { ActivityType } from "../../types/post";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";

interface Props {
  activities: ActivityType[];
  activity: number;
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  setActivity: (i: number) => void;
  onAddStop: () => void;
  /** When false, max stops reached — Next stop is disabled */
  canAddStop?: boolean;
}

interface SortableItemProps {
  id: string;
  index: number;
  isActive: boolean;
  setActivity: (i: number) => void;
  onRequestDelete: (i: number) => void;
  activityObj: ActivityType;
}

function getActivityLabel(a: ActivityType, index: number) {
  let raw =
    (a.customActivity?.trim() ||
      a.activityType?.trim() ||
      a.title?.trim() ||
      `Stop ${index + 1}`) ??
    `Stop ${index + 1}`;

  // Display-only: legacy “Activity n” reads as “Stop n” in the row (no data write).
  const legacy = /^Activity\s+(\d+)$/i.exec(raw.trim());
  if (legacy) raw = `Stop ${legacy[1]}`;

  const max = 14;
  return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
}

function SortableItem({
  id,
  index,
  isActive,
  setActivity,
  onRequestDelete,
  activityObj,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const label = getActivityLabel(activityObj, index);

  return (
    <div ref={setNodeRef} style={style} className="flex shrink-0">
      <div
        className={[
          "flex items-center gap-0 rounded-full border py-0.5 pl-0.5 transition",
          isActive
            ? "max-w-[min(168px,78vw)] pr-0.5"
            : "max-w-[min(148px,74vw)] pr-1",
          "active:scale-[0.99]",
          isActive
            ? "border-[var(--brand)] bg-[var(--surface-2)] text-[var(--text)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_35%,transparent)]"
            : "border-[var(--border)]/85 bg-[var(--surface)]/45 text-[var(--text)]/92 hover:bg-[var(--surface)]/62 dark:border-[var(--border)]/70",
        ].join(" ")}
        title={label}
      >
        <span
          {...attributes}
          {...listeners}
          className="flex h-5 w-[18px] shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-[var(--text)]/42 active:cursor-grabbing"
          aria-label="Reorder stop"
        >
          <PiDotsSixVertical size={12} aria-hidden />
        </span>
        <button
          type="button"
          onClick={() => setActivity(index)}
          className="min-w-0 flex-1 truncate pl-0 pr-0.5 text-left text-[10px] font-semibold leading-none text-[var(--text)]"
        >
          {label}
        </button>
        {isActive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(index);
            }}
            className="flex h-5 min-w-[18px] shrink-0 items-center justify-center rounded-full px-0.5 text-[11px] leading-none text-[var(--text)]/62 hover:bg-[var(--surface)]/50 hover:text-[var(--text)]"
            aria-label="Delete stop"
            title="Delete stop"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function CreateActivityHeaderSection({
  activities,
  activity,
  setActivities,
  setActivity,
  onAddStop,
  canAddStop = true,
}: Props) {
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  const updateScrollFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    setFadeLeft(overflow && scrollLeft > 4);
    setFadeRight(overflow && scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useLayoutEffect(() => {
    updateScrollFades();
  }, [updateScrollFades, activities]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollFades());
    ro.observe(el);
    el.addEventListener("scroll", updateScrollFades, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollFades);
    };
  }, [updateScrollFades]);

  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = (e: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oldIdx = +active.id;
      const newIdx = +over.id;
      setActivities((prev) => {
        const next = arrayMove(prev, oldIdx, newIdx);
        return next;
      });
      setActivity(newIdx);
    }
  };

  const confirmDelete = () => {
    if (pendingDeleteIndex === null) return;
    const idx = pendingDeleteIndex;
    setPendingDeleteIndex(null);
    deleteActivity(idx);
  };

  const deleteActivity = (idx: number) => {
    setActivities((prev) => {
      let next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        next = [
          {
            title: "Stop 1",
            activityType: "",
            customActivity: "",
            locationDesc: "",
            tags: [],
            location: "",
            locationNotes: "",
            locationUrl: "",
            images: [],
            duration: "",
            durationNotes: "",
          } as ActivityType,
        ];
      }
      let newIndex: number;
      if (activity === idx) {
        newIndex = Math.min(idx, next.length - 1);
      } else if (activity > idx) {
        newIndex = activity - 1;
      } else {
        newIndex = activity;
      }
      setActivity(newIndex);
      return next;
    });
  };

  return (
    <div className="w-full pt-3 pb-0.5">
      <ConfirmDialog
        open={pendingDeleteIndex !== null}
        onClose={() => setPendingDeleteIndex(null)}
        onConfirm={confirmDelete}
        title="Delete this stop?"
        message="This stop will be removed from your plan."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />
      <div className="flex w-full min-w-0 items-stretch gap-1.5">
        {/* Bleed left only — negative right margin would overlap the Next stop control */}
        <div className="relative z-0 min-w-0 flex-1 -ml-2.5">
          <div
            className="pointer-events-none absolute inset-y-0 -left-px z-[2] w-16 opacity-0 transition-opacity duration-200 bg-gradient-to-r from-[var(--bg)] from-0% via-[var(--bg)] via-55% to-transparent to-100%"
            style={{ opacity: fadeLeft ? 1 : 0 }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 -right-px z-[2] w-12 opacity-0 transition-opacity duration-200 bg-gradient-to-l from-[var(--bg)] from-0% via-[var(--bg)] via-55% to-transparent to-100%"
            style={{ opacity: fadeRight ? 1 : 0 }}
            aria-hidden
          />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={activities.map((_, i) => i.toString())}
              strategy={horizontalListSortingStrategy}
            >
              <div
                ref={scrollRef}
                className="overflow-x-auto px-2.5 pb-0.5 pt-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex w-max max-w-none justify-start gap-1 py-0">
                  {activities.map((a, i) => (
                    <SortableItem
                      key={i}
                      id={i.toString()}
                      index={i}
                      isActive={i === activity}
                      setActivity={setActivity}
                      onRequestDelete={setPendingDeleteIndex}
                      activityObj={a}
                    />
                  ))}
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="relative z-[3] flex shrink-0 items-center self-center">
          <button
            type="button"
            onClick={onAddStop}
            disabled={!canAddStop}
            title={
              !canAddStop
                ? `Max ${CREATE_FLOW_LIMITS.activities.maxStopsPerPost} stops`
                : undefined
            }
            className={[
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-none",
              "border-neutral-950 bg-neutral-950 text-white shadow-sm",
              "hover:bg-neutral-800 hover:border-neutral-800 active:scale-[0.99]",
              "dark:border-white dark:bg-white dark:text-neutral-950 dark:shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
              "dark:hover:bg-neutral-100 dark:hover:border-neutral-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
              !canAddStop ? "cursor-not-allowed opacity-45" : "",
            ].join(" ")}
            aria-label="Add next stop"
          >
            <PiPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Next stop
          </button>
        </div>
      </div>
    </div>
  );
}
