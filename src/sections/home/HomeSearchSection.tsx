import { useState } from "react";
import { FiSearch } from "react-icons/fi";

export default function HomeSearchSection() {
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ Default selected filters
  const [selected, setSelected] = useState<string[]>(["current", "today"]);

  const items = [
    { label: "Current Location", value: "current" },
    { label: "Today", value: "today" },
    { label: "Surprise me", value: "surprise" },
    { label: "Trending", value: "trending" },
  ];

  const toggleFilter = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <div className="w-full max-w-md bg-background rounded-xl h-fit flex flex-col">
      {/* 🔍 Search Bar */}
      <div className="relative flex items-center p-3 pb-1 pt-2 h-fit">
        <span>
          <FiSearch size={20} />
        </span>
        <input
          type="text"
          placeholder="Where To?"
          className="w-full pl-2 pr-10 py-2 border-none text-white text-[10px] font-normal bg-transparent outline-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 🎯 Filters */}
      <div className="flex w-full gap-2 px-2 py-2 rounded-xl bg-background200 overflow-x-auto scroll-hide">
        {items.map((item, index) => {
          const isSelected = selected.includes(item.value);
          return (
            <button
              key={index}
              onClick={() => toggleFilter(item.value)}
              className={`text-[10px] font-medium whitespace-nowrap px-2 py-1 rounded-full transition-all duration-200
                ${
                  isSelected
                    ? "text-primary200 bg-primary200/10 ring-1 ring-primary200 shadow-sm"
                    : "text-white hover:bg-white/10"
                }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
