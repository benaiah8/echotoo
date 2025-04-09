import { MdMap } from "react-icons/md";
import { ActivityType } from "../../types/post";
import PrimaryInput from "../../components/input/PrimaryInput";
import { useState } from "react";
import Collapsible from "../../components/Collapsible";
import { IoIosArrowDown } from "react-icons/io";

interface CreateActivityLocationSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
}

function CreateActivityLocationSection({
  activity,
  handleChange,
}: CreateActivityLocationSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-background w-full rounded-lg p-4 py-2 flex flex-col mt-3">
      <div
        className="w-full items-center justify-between flex cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <small className="">Add location</small>
        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
      <Collapsible open={open}>
        <div className="w-full py-2 flex flex-col gap-2">
          <PrimaryInput
            placeholder="You can write your own custom location"
            value={activity?.location}
            onChange={(e) => handleChange("location", e.target.value)}
          />
          <button className="w-full flex items-center justify-center gap-1 py-2 text-black font-medium rounded-md bg-primary cursor-pointer">
            <small>Go To Map</small>
            <MdMap />
          </button>
        </div>
      </Collapsible>
    </div>
  );
}

export default CreateActivityLocationSection;
