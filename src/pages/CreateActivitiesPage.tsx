import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { useState } from "react";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";
import CreateActivityDetailSection from "../sections/create/CreateActivityDetailSection";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";

function CreateActivitiesPage() {
  const [activities, setActivities] = useState([{ title: "Activity 1" }]);
  const [activity, setActivity] = useState(0);

  return (
    <PrimaryPageContainer back>
      <div className="flex flex-1 flex-col items-center justify-center relative">
        <div className="flex flex-1 w-full flex-col">
          <CreateActivityHeaderSection
            activities={activities}
            activity={activity}
            setActivities={setActivities}
            setActivity={setActivity}
          />
          <CreateActivityDetailSection
            setActivities={setActivities}
            activities={activities}
            activity={activity}
          />
        </div>

        <CreateTabsSection step={3} nextPath={Paths.createCategories} />
      </div>
    </PrimaryPageContainer>
  );
}

export default CreateActivitiesPage;
