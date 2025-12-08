import { useMemo, useState, useEffect } from "react";
import { getAvailableTags } from "../../api/queries/getPublicFeed";

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
      className={`py-1 px-3 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap border ${
        isSelected
          ? "bg-white text-black border-white"
          : "text-[var(--text)] bg-transparent border-white/25 hover:hover:bg-[rgba(255,255,255,0.08)]"
      }`}
    >
      {category}
    </button>
  );
}

// 📦 Main Component
function HomeCategorySection({
  selected = [],
  onTagsChange,
  onClear,
}: {
  selected?: string[];
  onTagsChange?: (tags: string[]) => void;
  onClear?: () => void;
} = {}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSelected, setInternalSelected] = useState<string[]>(selected);

  // Load available tags from posts
  useEffect(() => {
    const loadTags = async () => {
      try {
        setLoading(true);
        const availableTags = await getAvailableTags();
        setCategories(availableTags);
      } catch (error) {
        console.error("Error loading available tags:", error);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    loadTags();
  }, []);

  // Sync with external state
  useEffect(() => {
    setInternalSelected(selected);
  }, [selected]);

  // 🔍 Split selected and unselected
  const selectedCategories = useMemo(
    () => categories.filter((c) => internalSelected.includes(c)),
    [categories, internalSelected]
  );
  const unselectedCategories = useMemo(
    () => categories.filter((c) => !internalSelected.includes(c)),
    [categories, internalSelected]
  );

  // 🔁 Toggle category
  const toggleCategory = (cat: string) => {
    const newSelected = internalSelected.includes(cat)
      ? internalSelected.filter((c) => c !== cat)
      : [...internalSelected, cat];
    setInternalSelected(newSelected);
    onTagsChange?.(newSelected);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="w-full rounded-lg overflow-hidden">
        <div className="flex items-center w-full gap-2">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="py-1 px-3 rounded-md bg-[var(--text)]/10 animate-pulse"
                style={{
                  width: `${60 + Math.random() * 40}px`,
                  height: "24px",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Don't render anything if no categories are available
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-lg overflow-hidden">
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

        {/* 🗑️ Clear Button */}
        {selectedCategories.length > 0 && onClear && (
          <button
            onClick={onClear}
            className="ml-2 py-1 px-3 rounded-md text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors whitespace-nowrap"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}

export default HomeCategorySection;
