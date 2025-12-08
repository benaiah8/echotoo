// src/sections/create/CreateActivityHeaderSection.tsx
import { useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MdDragHandle, MdAdd } from "react-icons/md";

import { ActivityType } from "../../types/post";

interface Props {
  activities: ActivityType[];
  activity: number;
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  setActivity: (i: number) => void;
}

interface SortableItemProps {
  id: string;
  index: number;
  isActive: boolean;
  setActivity: (i: number) => void;
  onDelete: (i: number) => void;
  activityObj: ActivityType;
}

function getActivityLabel(a: ActivityType, index: number) {
  // Priority: customActivity > activityType > title > "Activity n"
  const raw =
    (a.customActivity?.trim() ||
      a.activityType?.trim() ||
      a.title?.trim() ||
      `Activity ${index + 1}`) ??
    `Activity ${index + 1}`;

  // crop for small pills
  const max = 18;
  return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
}

function SortableItem({
  id,
  index,
  isActive,
  setActivity,
  onDelete,
  activityObj,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const label = getActivityLabel(activityObj, index);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => setActivity(index)}
      className={`relative flex items-center gap-1 px-3 py-1 rounded-lg cursor-pointer border ${
        isActive
          ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--brand)] pr-5"
          : "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]"
      }`}
      title={label}
    >
      <span {...attributes} {...listeners} className="p-1">
        <MdDragHandle size={16} />
      </span>
      <span className="text-xs flex-1">{label}</span>
      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("Delete this activity?")) onDelete(index);
          }}
          className="delete-btn absolute -top-3 -right-3"
          aria-label="Delete activity"
          title="Delete activity"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function CreateActivityHeaderSection({
  activities,
  activity,
  setActivities,
  setActivity,
}: Props) {
  // load/save to localStorage (back to working solution)
  useEffect(() => {
    const saved = localStorage.getItem("draftActivities");
    if (saved) setActivities(JSON.parse(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    localStorage.setItem("draftActivities", JSON.stringify(activities));
  }, [activities]);

  // drag n drop
  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = (e: any) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oldIdx = +active.id;
      const newIdx = +over.id;
      const next = arrayMove(activities, oldIdx, newIdx);
      setActivities(next);
      setActivity(newIdx);
    }
  };

  // add a new blank activity
  const addActivity = () => {
    const next = [
      ...activities,
      {
        title: `Activity ${activities.length + 1}`,
        activityType: "",
        customActivity: "",
        locationDesc: "",
        tags: [],
        location: "",
        images: [],
        duration: "",
        durationNotes: "",
      } as ActivityType,
    ];
    setActivities(next);
    setActivity(next.length - 1);
  };

  // delete by index
  const deleteActivity = (idx: number) => {
    let next = activities.filter((_, i) => i !== idx);
    if (next.length === 0) {
      // re-seed if none left
      next = [
        {
          title: "Activity 1",
          activityType: "",
          customActivity: "",
          locationDesc: "",
          tags: [],
          location: "",
          images: [],
          duration: "",
          durationNotes: "",
        } as ActivityType,
      ];
    }
    setActivities(next);
    setActivity(Math.min(idx, next.length - 1));
  };

  return (
    <div className="w-full flex flex-col pt-4">
      <div className="w-full">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 flex flex-col gap-3">
          {/* Page title inside the box */}
          <div className="w-full">
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text)] text-center">
              Your Activities
            </h2>
            <div className="border-b border-[var(--border)] mt-3" />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={activities.map((_, i) => i.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-wrap gap-2">
                {activities.map((a, i) => (
                  <SortableItem
                    key={i}
                    id={i.toString()}
                    index={i}
                    isActive={i === activity}
                    setActivity={setActivity}
                    onDelete={deleteActivity}
                    activityObj={a}
                  />
                ))}
                <button
                  onClick={addActivity}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1 bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] hover:opacity-90 active:scale-[0.99] transition border border-[var(--border)]"
                >
                  <MdAdd size={16} /> Add Next Stop
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
