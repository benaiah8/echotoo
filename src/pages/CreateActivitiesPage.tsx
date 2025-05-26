import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";
import CreateActivityDetailSection from "../sections/create/CreateActivityDetailSection";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";
import { ActivityType } from "../types/post";

export default function CreateActivitiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postType = searchParams.get("type") || "journey";

  const base = `?type=${postType}`;
  const paths = [
    `${Paths.createTitle}${base}`,
    `${Paths.createActivities}${base}`,
    `${Paths.createCategories}${base}`,
    `${Paths.preview}${base}`,
  ];

  const [activities, setActivities] = useState<ActivityType[]>([
    {
      title: "Activity 1",
      activityType: "",
      customActivity: "",
      locationDesc: "",
      tags: [], // ← this is your new empty tags array
      location: "",
    },
  ]);

  const [activityIndex, setActivityIndex] = useState(0);
  const [error, setError] = useState("");

  const handleNext = () => {
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      if (!a.activityType && !a.customActivity) {
        setError(`Activity ${i + 1}: name is required.`);
        return;
      }
      if (!a.locationDesc.trim()) {
        setError(`Activity ${i + 1}: location description is required.`);
        return;
      }
    }
    setError("");
    navigate(paths[2]);
  };

  return (
    <PrimaryPageContainer back>
      <div className="flex-1 w-full px-4 flex flex-col">
        <CreateActivityHeaderSection
          activities={activities}
          activity={activityIndex}
          setActivities={setActivities}
          setActivity={setActivityIndex}
        />
        <CreateActivityDetailSection
          activities={activities}
          activity={activityIndex}
          activityIndex={activityIndex}
          setActivities={setActivities}
        />
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        <div className="flex-1" />
        <CreateTabsSection step={2} paths={paths} onNext={handleNext} />
      </div>
    </PrimaryPageContainer>
  );
}
