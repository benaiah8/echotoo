import { useState } from "react";
import { FiSearch } from "react-icons/fi";

export default function HomeSearchSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState("current");

  const items = [
    { label: "Current Location", value: "current" },
    { label: "Today", value: "today" },
    { label: "Surprise me", value: "surprise" },
  ];

  return (
    <div className="w-full max-w-md bg-background rounded-xl h-fit flex flex-col">
      <div className="relative flex items-center p-3 pb-1 pt-2 h-fit">
        <span>
          <FiSearch size={20} />
        </span>
        <input
          type="text"
          placeholder="Where To?"
          className="w-full pl-2 pr-10 py-2 border-none text-white text-sm font-normal"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {/* <span>
          <FiSliders size={20} />
        </span> */}
      </div>
      <div className="flex w-full gap-2 px-4 py-2 rounded-xl bg-background200">
        {items.map((item, index) => (
          <button
            key={index}
            className={`text-sm ${
              item.value === selected ? "text-primary200" : "text-white"
            }`}
            onClick={() => setSelected(item.value)}
          >
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
