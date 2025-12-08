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

  const patchActivity = (patch: Partial<ActivityType>) => {
    setActivities(
      activities.map((act, idx) =>
        idx === activityIndex ? { ...act, ...patch } : act
      )
    );
  };

  const handleChange = (field: string, value: any) => {
    patchActivity({ [field]: value } as Partial<ActivityType>);
  };

  // Keep header pills in sync with activity/tag selection
  const handleTagsChange = (newTags: string[]) => {
    const primary = newTags.find((t) => t.toLowerCase() !== "custom") || "";
    const patch: Partial<ActivityType> = { tags: newTags };

    if (primary) {
      patch.activityType = primary;
      patch.title = primary; // shows instantly in the header pills
    } else if (activity.customActivity?.trim()) {
      const custom = activity.customActivity.trim();
      patch.activityType = custom;
      patch.title = custom;
    }

    patchActivity(patch);
  };

  return (
    <div className="w-full flex flex-col">
      {/* Section 2: Add or pick activities */}
      <section className="w-full">
        {activity.tags.length > 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 flex flex-col gap-3">
            <ActivitiesTagsInput
              tags={activity.tags}
              onChange={handleTagsChange}
            />

            {/* If user picked "custom", show input for it */}
            {activity.tags.includes("custom") && (
              <div className="w-full">
                <PrimaryInput
                  label="Custom activity"
                  placeholder="Describe your custom activity"
                  value={activity.customActivity}
                  onChange={(e) => {
                    const val = e.target.value;
                    const name = val.trim();
                    patchActivity({
                      customActivity: val,
                      ...(name ? { activityType: name, title: name } : {}),
                    });
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <ActivitiesTagsInput
            tags={activity.tags}
            onChange={handleTagsChange}
          />
        )}
      </section>

      {/* Section 3: Additional info */}
      <CreateActivityAdditionalDetailSection
        activity={activity}
        handleChange={handleChange}
      />

      {/* Section 4: Location */}
      <CreateActivityLocationSection
        activity={activity}
        activityIndex={activityIndex}
        handleChange={handleChange}
      />

      {/* Section 5: Images */}
      <CreateActivityImagesSection
        activity={activity}
        handleChange={handleChange}
      />
    </div>
  );
}
