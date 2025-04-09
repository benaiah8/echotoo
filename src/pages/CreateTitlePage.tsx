import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import { useState } from "react";
import PrimaryDatePicker from "../components/input/datepicker/PrimaryDatePicker";
import PrimaryToggle from "../components/input/PrimaryToggle";
import { Paths } from "../router/Paths";
import CreateTabsSection from "../sections/create/CreateTabsSection";

function CreateTitlePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [date, setDate] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  return (
    <PrimaryPageContainer back>
      <div className="flex flex-1 flex-col items-center justify-center relative">
        <div className="w-full mt-8 p-4 rounded-md flex flex-col bg-background">
          <PrimaryInput
            label="Title"
            value={title}
            placeholder="This is the first thing other owls see"
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="mt-4"></div>
          <PrimaryInput
            label="Description"
            // className=""
            rows={1}
            value={description}
            textarea
            placeholder="Optional - let people know what to expect"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="w-full mt-4 p-4 rounded-md flex flex-col bg-background">
          <PrimaryDatePicker
            label="Pick a date"
            date={date}
            onDateChange={(dt) => setDate(dt || "")}
          />
          <div className="mt-4"></div>
          <PrimaryInput
            label="Additional description"
            // className=""
            rows={1}
            value={additionalDescription}
            textarea
            placeholder="Duration or any other additional information"
            onChange={(e) => setAdditionalDescription(e.target.value)}
          />
        </div>
        <div className="w-full mt-4 p-4 rounded-md flex flex-col bg-background">
          <div className="w-full flex items-center justify-between">
            <span className="text-white">Anonymous posting</span>
            <PrimaryToggle value={anonymous} onChange={setAnonymous} />
          </div>
        </div>

        <div className="flex flex-1"></div>

        <CreateTabsSection step={2} nextPath={Paths.createActivities} />
      </div>
    </PrimaryPageContainer>
  );
}

export default CreateTitlePage;
