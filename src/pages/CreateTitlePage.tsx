import { IoArrowForward } from "react-icons/io5";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import { useState } from "react";
import PrimaryDatePicker from "../components/input/datepicker/PrimaryDatePicker";
import PrimaryToggle from "../components/input/PrimaryToggle";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";

function CreateTitlePage() {
  const navigate = useNavigate();
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
        <div className="w-full flex items-center gap-2 mt-8 justify-between">
          <div className="flex flex-1"></div>
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, index) => (
              <div
                className={`w-4 h-1 rounded-full ${
                  index === 1 ? "bg-white" : "bg-white/20"
                }`}
                key={index}
              ></div>
            ))}
          </div>
          <div className="flex flex-1 justify-end">
            <button
              className="flex items-center gap-1 ml-4"
              onClick={() => navigate(Paths.createActivities)}
            >
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

export default CreateTitlePage;
