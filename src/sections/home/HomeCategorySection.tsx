import  { useMemo, useState } from "react";

// 🔘 Reusable Category Button
function CategoryButton({
  category,
  isSelected,
  onClick,
}: {
  category: string;
  isSelected: boolean;
  onClick: (cat: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(category)}
      className={`py-1 px-3 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
        isSelected ? "bg-white text-black" : "bg-background200 text-white"
      }`}
    >
      {category}
    </button>
  );
}

// 📦 Main Component
function HomeCategorySection() {
  const categories = [
    "Family",
    "Dining", // fixed spelling
    "Dinner",
    "Date",
    "Hangout",
    "Gaming",
    "Outdoor",
    "Fitness",
    "Learning",
  ];

  const [selected, setSelected] = useState<string[]>([]);

  // 🔍 Split selected and unselected
  const selectedCategories = useMemo(
    () => categories.filter((c) => selected.includes(c)),
    [categories, selected]
  );
  const unselectedCategories = useMemo(
    () => categories.filter((c) => !selected.includes(c)),
    [categories, selected]
  );

  // 🔁 Toggle category
  const toggleCategory = (cat: string) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="w-full bg-background rounded-lg p-2 mt-2 overflow-hidden">
      <div className="flex items-center w-full gap-1">
        {/* 📌 Selected Categories (left-aligned, max 50%) */}
        <div className="flex gap-1 rounded flex-shrink-0 max-w-[40%] overflow-x-auto scroll-hide pr-2">
          {selectedCategories.map((category, index) => (
            <CategoryButton
              key={`selected-${index}`}
              category={category}
              isSelected={true}
              onClick={toggleCategory}
            />
          ))}
        </div>

        {/* 🚀 Unselected Categories (scrollable) */}
        <div className="flex gap-2 overflow-x-auto scroll-hide">
          {unselectedCategories.map((category, index) => (
            <CategoryButton
              key={`unselected-${index}`}
              category={category}
              isSelected={false}
              onClick={toggleCategory}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomeCategorySection;
