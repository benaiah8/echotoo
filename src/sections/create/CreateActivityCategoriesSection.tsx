import PrimaryInput from "../../components/input/PrimaryInput";
import { useState } from "react";
import { categoriesData } from "../../data/data";
import CreateCategoriesSelectionSection from "./CreateCategoriesSelectionSection";

function CreateActivityCategoriesSection() {
  const [tag, setTag] = useState("");
  const [categories, setCategories] = useState<
    {
      label: string;
      items: string[];
    }[]
  >(categoriesData);
  const [selected, setSelected] = useState<string[]>([]);

  const handleSelect = (option: string) => {
    let found = selected?.find((opt) => opt === option);
    if (found) {
      setSelected([...selected?.filter((opt) => opt !== option)]);
    } else {
      setSelected([...selected, option]);
    }
  };

  return (
    <div className="bg-background w-full rounded-lg p-4 py-2 flex flex-col mt-3">
      <div className="w-full items-center justify-between flex cursor-pointer">
        <small className="">Categories/Tags</small>
      </div>
      <div className="w-full py-2 flex flex-col gap-2">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <PrimaryInput
              placeholder="You can write your own custom categories"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </div>
          <button
            className="px-3 py-1 rounded-md bg-primary text-black font-medium"
            onClick={() => {
              setCategories(
                categories.map((cat) =>
                  cat.label === "Custom"
                    ? { ...cat, items: [...cat.items, tag] }
                    : cat
                )
              );
              setTag("");
            }}
          >
            <small>Add</small>
          </button>
        </div>
        <div className="flex flex-1 flex-wrap mt-3 ">
          {categories?.map((cat, catIndex) => (
            <CreateCategoriesSelectionSection
              key={catIndex}
              categories={cat}
              selected={selected}
              index={catIndex}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CreateActivityCategoriesSection;
