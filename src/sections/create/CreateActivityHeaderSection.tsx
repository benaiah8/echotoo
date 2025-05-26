// src/sections/create/CreateActivityHeaderSection.tsx
interface SortableItemProps {
  id: string;
  index: number;
  isActive: boolean;
  setActivity: (i: number) => void;
  onDelete: (i: number) => void;
}

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

function SortableItem({
  id,
  index,
  isActive,
  setActivity,
  onDelete,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = `Activity ${index + 1}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => setActivity(index)}
      className={`pill relative flex items-center gap-1 px-2 py-1 rounded cursor-pointer
        ${
          isActive ? "bg-white text-black pr-5" : "bg-background200 text-white"
        }`}
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
  // load/save to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("draftActivities");
    if (saved) setActivities(JSON.parse(saved));
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
      },
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
        },
      ];
    }
    setActivities(next);
    setActivity(Math.min(idx, next.length - 1));
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <h4 className="text-sm font-medium text-white">Your Activities</h4>

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
            {activities.map((_, i) => (
              <SortableItem
                key={i}
                id={i.toString()}
                index={i}
                isActive={i === activity}
                setActivity={setActivity}
                onDelete={deleteActivity}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={addActivity}
        className="mt-2 bg-primary200 text-black text-xs font-medium rounded-full px-4 py-2 inline-flex items-center gap-1"
      >
        <MdAdd size={16} /> Add Next Stop
      </button>
    </div>
  );
}
