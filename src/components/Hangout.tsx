import { useState } from "react";
import { MdLocationOn, MdShare } from "react-icons/md";

function Hangout() {
  const [rsvp, setRsvp] = useState(false);
  const items = [
    { label: "Today" },
    // { label: "3-hrs" },
    { label: "2", icon: <MdLocationOn /> },
  ];

  let beThere = rsvp ? 20 + 1 : 20;

  const handleShare = () => {};

  const handleRSVP = () => {
    setRsvp(!rsvp);
  };

  return (
    <button className="w-36 pb-2 relative">
      <div className="w-36 h-34 rounded-xl bg-background p-2 flex flex-col flex-1">
        <div className="flex w-full flex-wrap gap-1">
          {items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="flex items-center gap-2 bg-background200 py-1 px-2 rounded-md"
            >
              <small className="!text-[8px] font-normal">{item.label}</small>
              {item.icon && <div className="text-[10px]">{item.icon}</div>}
            </div>
          ))}
        </div>
        <small className="mt-4 font-medium items-start text-start">
          This is where The Title of The experience is{" "}
        </small>
        <div className="flex flex-1"></div>
        <div className="flex w-full justify-between mt-2">
          <div
            className="text-xs px-2 py-1 rounded-md bg-background200 text-white"
            onClick={() => handleShare()}
          >
            <MdShare />
          </div>
          <button
            className="flex h-5  overflow-hidden bg-white text-black rounded-sm cursor-pointer"
            onClick={() => handleRSVP()}
          >
            <div className="flex items-center justify-center px-1 pl-2">
              <small className="!text-[10px]">Be there</small>
            </div>
            <div
              className={`h-full ${
                rsvp ? "bg-primary text-black" : "bg-background200 text-white"
              } px-1 flex items-center justify-center rounded-l-sm`}
            >
              <small className="!text-[10px]">{beThere}</small>
            </div>
          </button>
        </div>
      </div>
    </button>
  );
}

export default Hangout;
