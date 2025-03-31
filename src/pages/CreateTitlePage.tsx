import { IoArrowForward } from "react-icons/io5";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import { useState } from "react";

function CreateTitlePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <PrimaryPageContainer>
      <div className="flex flex-1 flex-col items-center justify-center relative">
        <div className="w-full flex items-center justify-center sticky top-0">
          <span className="uppercase">rendezvous</span>
        </div>

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

        <div className="flex flex-1"></div>
        <div className="w-full flex items-center gap-2 mt-8 justify-between">
          <div className="flex flex-1"></div>
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, index) => (
              <div
                className={`w-4 h-1 rounded-full ${
                  index === 0 ? "bg-white" : "bg-white/20"
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

export default CreateTitlePage;
