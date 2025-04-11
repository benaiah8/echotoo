import { MdClose } from "react-icons/md";
import SecondaryDropdown from "../../components/input/dropdown/SecondaryDropdown";
import { ActivityType } from "../../types/post";
import PrimaryInput from "../../components/input/PrimaryInput";
import { additionalActiviesData } from "../../data/data";
import { useState } from "react";
import Collapsible from "../../components/Collapsible";
import { IoIosArrowDown } from "react-icons/io";

interface CreateActivityAdditionalDetailSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
}

function CreateActivityAdditionalDetailSection({
  activity,
  handleChange,
}: CreateActivityAdditionalDetailSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-background w-full rounded-lg p-4 py-2 flex flex-col mt-3">
      <div
        className="w-full items-center justify-between flex cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <small className="">Additional info</small>
        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
      <Collapsible open={open}>
        <div className="w-full py-2 flex flex-col gap-2">
          {activity?.additionalInfo?.map((add: any, addIndex: number) => (
            <div
              className="w-full p-2 rounded-md bg-background200 flex flex-col relative"
              key={addIndex}
            >
              <div className="w-full flex justify-end top-0 absolute right-0">
                <button
                  className="text-white p-2"
                  onClick={() => {
                    let additionalInfo = activity.additionalInfo?.filter(
                      (_: any, actIndex: any) => actIndex !== addIndex
                    );
                    handleChange("additionalInfo", additionalInfo);
                  }}
                >
                  <MdClose />
                </button>
              </div>
              <PrimaryInput
                label={add?.title}
                value={add?.value}
                rows={1}
                textarea
                onChange={(e) => {
                  let additionalInfo = activity.additionalInfo?.map(
                    (act: any, actIndex: any) =>
                      actIndex === addIndex
                        ? { ...act, value: e.target.value }
                        : act
                  );
                  handleChange("additionalInfo", additionalInfo);
                }}
              />
            </div>
          ))}
          <SecondaryDropdown
            className="mt-3"
            label="Add additional info"
            value=""
            options={additionalActiviesData?.map((act) => {
              return {
                label: act,
                value: act,
              };
            })}
            onChange={(val) => {
              handleChange("additionalInfo", [
                ...(activity?.additionalInfo || []),
                {
                  title: val,
                  value: "",
                },
              ]);
            }}
          />
        </div>
      </Collapsible>
    </div>
  );
}

export default CreateActivityAdditionalDetailSection;
