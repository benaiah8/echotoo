// src/sections/create/CreateActivityLocationSection.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdMap } from "react-icons/md";
import { IoIosArrowDown } from "react-icons/io";
import Collapsible from "../../components/Collapsible";
import PrimaryInput from "../../components/input/PrimaryInput";
import { Paths } from "../../router/Paths";
import { ActivityType } from "../../types/post";

interface Props {
  activity: ActivityType;
  activityIndex: number;
  handleChange: (field: string, value: any) => void;
}

export default function CreateActivityLocationSection({
  activity,
  activityIndex,
  handleChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  return (
    <div className="bg-background w-full rounded-lg p-4 flex flex-col mt-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <small className="text-white text-sm">Add location</small>
        <IoIosArrowDown
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      <Collapsible open={open}>
        <div className="py-2 flex flex-col gap-2">
          <PrimaryInput
            placeholder="Or enter address manually"
            value={activity.location}
            onChange={(e) => handleChange("location", e.target.value)}
          />

          <button
            onClick={() => nav(`${Paths.createMap}?activity=${activityIndex}`)}
            className="w-full flex items-center justify-center gap-1 py-2 bg-primary text-black font-medium rounded-md"
          >
            <small>Pick on Map</small>
            <MdMap />
          </button>
        </div>
      </Collapsible>
    </div>
  );
}
