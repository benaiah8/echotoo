import { ActivityType } from "../../types/post";
import ActivitiesDropdown from "../../components/input/dropdown/ActivitiesDropdown";
import PrimaryInput from "../../components/input/PrimaryInput";
import CreateActivityAdditionalDetailSection from "./CreateActivityAdditionalDetailSection";
import CreateActivityLocationSection from "./CreateActivityLocationSection";
import CreateActivityImagesSection from "./CreateActivityImagesSection";

interface CreateActivityDetailSectionProps {
  activity: number;
  activities: ActivityType[];
  setActivities: (activities: ActivityType[]) => void;
}
function CreateActivityDetailSection({
  activities,
  activity: activityIndex,
  setActivities,
}: CreateActivityDetailSectionProps) {
  let activity = activities[activityIndex];

  const handleChange = (field: string, value: any) => {
    setActivities([
      ...activities.map((activity1, index) =>
        index === activityIndex ? { ...activity1, [field]: value } : activity1
      ),
    ]);
  };
  return (
    <div className="w-full flex flex-col mt-4">
      <div className="bg-background w-full rounded-lg p-4 py-2 pb-4 flex flex-col">
        <small className="mb-2">Activity</small>
        <ActivitiesDropdown
          label="Select activity"
          value={activity?.activity}
          onChange={(val) => handleChange("activity", val)}
        />
        {activity?.activity === "custom" ? (
          <div className="w-full mt-3">
            <PrimaryInput
              placeholder="Custom activity"
              value={activity?.customActivity}
              onChange={(e) => handleChange("customActivity", e.target.value)}
            />
          </div>
        ) : (
          <></>
        )}
      </div>
      <CreateActivityAdditionalDetailSection
        activity={activity}
        handleChange={handleChange}
      />
      <CreateActivityLocationSection
        activity={activity}
        handleChange={handleChange}
      />
      <CreateActivityImagesSection
        activity={activity}
        handleChange={handleChange}
      />
    </div>
  );
}

export default CreateActivityDetailSection;
