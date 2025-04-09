import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import { useState } from "react";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import CreateActivityCategoriesSection from "../sections/create/CreateActivityCategoriesSection";

function CreateCategoryPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

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

        <div className="flex flex-1 w-full">
          <div className="w-full">
            <CreateActivityCategoriesSection />
          </div>
        </div>

        <CreateTabsSection step={4} onPost={() => {}} />
      </div>
    </PrimaryPageContainer>
  );
}

export default CreateCategoryPage;
