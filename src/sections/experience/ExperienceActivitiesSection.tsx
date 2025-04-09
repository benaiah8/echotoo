import { useState } from "react";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdMap } from "react-icons/md";
import Collapsible from "../../components/Collapsible";
import ExperienceActivityImagesSection from "./ExperienceActivityImagesSection";

function ExperienceActivitiesSection() {
  return (
    <div className="w-full rounded-md py-2 flex flex-col mt-2 gap-2">
      {[...Array(10)].map((_, index) => (
        <Activity key={index} />
      ))}
    </div>
  );
}

export default ExperienceActivitiesSection;

const Activity = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full flex flex-col relative">
      <div
        className="w-full top-0 left-0 flex items-center absolute justify-center"
        onClick={() => setOpen(!open)}
      >
        <div className="flex gap-1 items-center bg-backgroundLight px-5 py-1 rounded-full  ">
          <small>Activity 1</small>
          <IoMdArrowDropdown
            className={`transition-all ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      <div className="w-full p-4 pt-6 flex flex-col bg-background mt-3 rounded-lg">
        <span className="!text-sm font-medium mb-2">Title of activity one</span>
        <p className="font-light text-xs opacity-70">
          If you could live anywhere in the world, where would you pick? If you
          could live anywhere in the world, where would you pick?
        </p>
        <div className="w-full pb-4 pt-2 px-4 rounded-lg bg-background200 flex flex-col mt-4">
          <div className="w-full flex gap-2 justify-between items-end mb-2">
            <span className="!text-sm font-medium flex-1 ">Location</span>
            <div className="border border-white w-6 h-6 rounded-md flex items-center justify-center">
              <span className="text-primary text-sm">
                <MdMap />
              </span>
            </div>
          </div>
          <p className="font-light text-xs opacity-70">
            If you could live anywhere in the world, where would you pick? If
            you could live anywhere in the world, where would you pick?
          </p>
        </div>
        <Collapsible open={open}>
          <div className="w-full flex flex-col">
            <ExperienceActivityImagesSection />
            <div className="w-full pb-4 pt-2 px-4 rounded-lg bg-background200 flex flex-col mt-4">
              <div className="w-full flex flex-col gap-2">
                {[...Array(3)].map((_, gameIndex) => (
                  <div
                    className="w-full flex flex-col gap-1 border-t first:border-none py-2 border-white/30"
                    key={gameIndex}
                  >
                    <div className="w-full flex gap-2 justify-between items-end mb-2">
                      <span className="!text-sm font-medium flex-1 ">
                        Dress code
                      </span>
                    </div>
                    <p className="font-light text-xs opacity-70">
                      If you could live anywhere in the world, where would you
                      pick? If you could live anywhere in the world, where would
                      you pick?
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full pb-4 pt-2 px-4 rounded-lg bg-background200 flex flex-col mt-4">
              <div className="w-full flex gap-2 justify-between items-end mb-2">
                <span className="!text-sm font-medium flex-1 ">Games</span>
              </div>
              <p className="font-light text-xs opacity-70 mb-4">
                If you could live anywhere in the world, where would you pick?
                If you could live anywhere in the world, where would you pick?
              </p>
              <div className="w-full flex flex-col gap-2">
                {[...Array(3)].map((_, gameIndex) => (
                  <div
                    className="w-full flex flex-col gap-1 border-t py-2 border-white/30"
                    key={gameIndex}
                  >
                    <div className="w-full flex gap-2 justify-between items-end mb-2">
                      <span className="!text-sm font-medium flex-1 ">
                        Game 1
                      </span>
                    </div>
                    <p className="font-light text-xs opacity-70">
                      If you could live anywhere in the world, where would you
                      pick? If you could live anywhere in the world, where would
                      you pick?
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Collapsible>
      </div>
      {!open ? (
        <div className="absolute h-20 bottom-0 left-0 w-full bg-gradient-to-t from-black to-transparent"></div>
      ) : (
        <></>
      )}
    </div>
  );
};
