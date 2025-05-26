// src/sections/create/CreateActivityDetailSection.tsx

import { ActivityType } from "../../types/post";
import ActivitiesTagsInput from "../../components/ActivitiesTagsInput";
import PrimaryInput from "../../components/input/PrimaryInput";
import CreateActivityAdditionalDetailSection from "./CreateActivityAdditionalDetailSection";
import CreateActivityLocationSection from "./CreateActivityLocationSection";
import CreateActivityImagesSection from "./CreateActivityImagesSection";

interface CreateActivityDetailSectionProps {
  activity: number;
  activityIndex: number;
  activities: ActivityType[];
  setActivities: (activities: ActivityType[]) => void;
}

export default function CreateActivityDetailSection({
  activities,
  activity: activityIndex,
  setActivities,
}: CreateActivityDetailSectionProps) {
  const activity = activities[activityIndex];

  const handleChange = (field: string, value: any) => {
    setActivities(
      activities.map((act, idx) =>
        idx === activityIndex ? { ...act, [field]: value } : act
      )
    );
  };

  return (
    <div className="w-full flex flex-col mt-4">
      {/* Activity tags input */}
      <div className="bg-background w-full rounded-lg p-4 flex flex-col gap-2">
        <small className="mb-1 text-xs text-white">Activities</small>
        <ActivitiesTagsInput
          tags={activity.tags}
          onChange={(newTags) => handleChange("tags", newTags)}
        />
      </div>

      {/* If user typed “custom” and you want a free‐form input */}
      {activity.tags.includes("custom") && (
        <div className="w-full mt-3 px-4">
          <PrimaryInput
            label="Custom activity"
            placeholder="Describe your custom activity"
            value={activity.customActivity}
            onChange={(e) => handleChange("customActivity", e.target.value)}
          />
        </div>
      )}

      {/* The rest of your detail sections */}
      <CreateActivityAdditionalDetailSection
        activity={activity}
        handleChange={handleChange}
      />
      <CreateActivityLocationSection
        activity={activity}
        activityIndex={activityIndex}
        handleChange={handleChange}
      />
      <CreateActivityImagesSection
        activity={activity}
        handleChange={handleChange}
      />
    </div>
  );
}
