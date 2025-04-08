import { IoArrowForward } from "react-icons/io5";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { useState } from "react";
import CreateActivityHeaderSection from "../sections/create/CreateActivityHeaderSection";

function CreateActivitiesPage() {
  const [activities, setActivities] = useState([{ title: "Activity 1" }]);
  const [activity, setActivity] = useState({ title: "Activity 1" });

  return (
    <PrimaryPageContainer back>
      <div className="flex flex-1 flex-col items-center justify-center relative">
        <div className="flex flex-1 w-full">
          <CreateActivityHeaderSection
            activities={activities}
            activity={activity}
            setActivities={setActivities}
            setActivity={setActivity}
          />
        </div>
        <div className="w-full flex items-center gap-2 mt-8 justify-between sticky bottom-0">
          <div className="flex flex-1"></div>
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, index) => (
              <div
                className={`w-4 h-1 rounded-full ${
                  index === 2 ? "bg-white" : "bg-white/20"
                }`}
                key={index}
              ></div>
            ))}
          </div>
          <div className="flex flex-1 justify-end">
            <button className="flex items-center gap-1 ml-4">
              <span>Next</span>
              <span>
                {" "}
                <IoArrowForward />{" "}
              </span>
            </button>
          </div>
        </div>
      </div>
    </PrimaryPageContainer>
  );
}

export default CreateActivitiesPage;
