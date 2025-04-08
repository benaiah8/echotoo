import { FaBookmark, FaGlassCheers } from "react-icons/fa";
import { MdLocationOn } from "react-icons/md";

function ProfileHangoutSection() {
  const items = [
    { label: "Today" },
    { label: "3-hrs" },
    { label: "2", icon: <MdLocationOn /> },
  ];

  return (
    <div className="w-full flex gap-3 scroll-hide overflow-scroll mt-3">
      {[...Array(10)].map((_, index) => (
        <button className="w-36 pb-2 relative" key={index}>
          <div className="w-36 h-34 rounded-xl bg-background p-2 flex flex-col flex-1">
            <div className="flex w-full flex-wrap gap-1">
              {items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="flex items-center gap-2 bg-background200 py-1 px-2 rounded-md"
                >
                  <small className="!text-[8px] font-normal">
                    {item.label}
                  </small>
                  {item.icon && <div className="text-[10px]">{item.icon}</div>}
                </div>
              ))}
            </div>
            <small className="mt-4 font-medium items-start text-start">
              This is where The Title of The experience is{" "}
            </small>
            <div className="flex flex-1"></div>
            <div className="flex w-full justify-end">
              <div className="text-xs px-2 py-1 rounded-md bg-background200 text-white">
                <FaGlassCheers />
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-4">
            <span>
              <FaBookmark className="" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export default ProfileHangoutSection;
