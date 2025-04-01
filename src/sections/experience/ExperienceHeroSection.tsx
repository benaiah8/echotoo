import { FaGlassCheers } from "react-icons/fa";
import {
  MdChat,
  MdFavorite,
  MdLocationOn,
  MdMap,
  MdShare,
} from "react-icons/md";

function ExperienceHeroSection() {
  const items = [
    { label: "Today" },
    { label: "3-hrs" },
    { label: "2", icon: <MdLocationOn /> },
  ];

  const options = [
    { icon: <MdFavorite />, action: () => {} },
    { icon: <MdShare />, action: () => {} },
    { icon: <MdChat />, action: () => {} },
  ];
  return (
    <div className="w-full flex flex-col">
      <div className="w-full relative h-56 rounded-b-xl overflow-hidden flex bg-[url('https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600')] bg-cover bg-center">
        <div className="w-full h-full flex bg-black/40 px-4 py-2 flex-col">
          <div className="w-full justify-between items-center flex">
            <div className="flex gap-2">
              {items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="flex items-center gap-1 bg-primary text-black py-1 px-2 rounded-md"
                >
                  <small className="!text-[10px] !font-medium">
                    {item.label}
                  </small>
                  {item.icon && <div className="text-xs">{item.icon}</div>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-primary text-black py-1 px-2 rounded-md w-fit">
              <small className="!text-[10px] !font-medium">Category</small>
              <div className="text-xs">
                {" "}
                <FaGlassCheers />{" "}
              </div>
            </div>
          </div>
          <div className="flex flex-1"></div>
          <div className="flex w-full flex-col">
            <div className="w-full flex gap-2 justify-between">
              <div className="flex items-center gap-2 ">
                <div className="w-8 h-8 border border-primary rounded-full bg-image"></div>
                <div className="flex flex-1 flex-col">
                  <small className="!text-xs font-medium ">
                    Chris Johnson (wise owl)
                  </small>
                  <small className="!text-xs font-light">@chrisH</small>
                </div>
              </div>
              <div>
                <div className="border-2 border-white w-8 h-8 rounded-md flex items-center justify-center">
                  <span className="text-primary">
                    {" "}
                    <MdMap />{" "}
                  </span>
                </div>
              </div>
            </div>
            <span className="font-medium mt-2">Title of The experience</span>
          </div>
        </div>
      </div>
      <div className="rounded-md bg-background flex gap-4 p-3 mt-3">
        <div className="flex flex-1 flex-col px-2">
          <span className="font-medium !text-sm">Title of The experience</span>
          <div className="text-xs mt-2 opacity-70">
            If you could live anywhere in the world, where would you pick? If
            you could live anywhere in the world, where would you pick?
          </div>
          <hr className="w-full border-white mt-4" />
          <div className="flex items-center w-full gap-2 mt-4">
            <small>date - 11/07/24</small>
            <small>Duration - 10pm - 12pm</small>
          </div>
        </div>
        <div className="flex flex-1 max-w-12 p-2 bg-background200 rounded-md flex-col justify-between gap-2">
          {options.map((option, index) => (
            <button
              key={index}
              className={`w-full py-2 px-4 rounded-md h-8 text-lg flex items-center justify-center bg-primary200 `}
              onClick={option.action}
            >
              {option.icon && <span className="text-black">{option.icon}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ExperienceHeroSection;
