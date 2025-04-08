import React, { useState } from "react";
import { ActivityType } from "../../types/post";
import { MdAdd } from "react-icons/md";
import DropdownContainer from "../../components/input/dropdown/DropdownContainer";
import { IoIosArrowDown } from "react-icons/io";

interface CreateActivityHeaderSectionProps {
  activity: ActivityType;
  setActivity: (activity: ActivityType) => void;
  activities: ActivityType[];
  setActivities: (activities: ActivityType[]) => void;
}

function CreateActivityHeaderSection({
  activities,
  activity,
  setActivities,
  setActivity,
}: CreateActivityHeaderSectionProps) {
  const [dropdown, setDropdown] = useState(false);

  const handleAdd = () => {
    const newActivities = [
      ...activities,
      { title: `Activity ${activities.length + 1}` },
    ];
    setActivity(newActivities[newActivities.length - 1]);
    setActivities(newActivities);
  };

  return (
    <div className="w-full gap-2 flex h-fit items-center">
      <div className="flex flex-1 h-fit">
        <DropdownContainer
          className="w-full"
          left
          dropdown={(closeDropdown) => (
            <div className="flex flex-col w-[40vw] max-w-[200px]">
              {activities.map((item, itemIndex) => (
                <div
                  className="text-xs font-medium px-4 py-2 text-white w-full cursor-pointer"
                  key={itemIndex}
                  onClick={() => {
                    setActivity(item);
                    closeDropdown();
                  }}
                >
                  {item.title}
                </div>
              ))}
            </div>
          )}
          parentToggle={setDropdown}
        >
          <div className="w-full bg-background rounded-full px-4 py-2 justify-between text-xs flex items-center">
            <span>{activity?.title}</span>
            <span>
              {" "}
              <IoIosArrowDown
                className={`transition-all ${dropdown ? "rotate-180" : ""}`}
              />
            </span>
          </div>
        </DropdownContainer>
      </div>
      <div className="flex flex-1 justify-end items-center cursor-pointer gap-1">
        <div
          className="bg-background gap-2 rounded-full px-4 py-2 justify-between text-xs flex items-center cursor-pointer"
          onClick={() => handleAdd()}
        >
          <span>Add activity</span>
          <span>
            <MdAdd />
          </span>
        </div>
      </div>
    </div>
  );
}

export default CreateActivityHeaderSection;
