import PrimaryInput from "../../components/input/PrimaryInput";
import { useState } from "react";
import { categoriesData } from "../../data/data";
import PrimarySelectable from "../../components/input/PrimarySelectable";

function CreateActivityCategoriesSection() {
  const [tag, setTag] = useState("");
  const [categories, setCategories] = useState(categoriesData);
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
              setCategories([...categories, tag]);
              setTag("");
            }}
          >
            <small>Add</small>
          </button>
        </div>
        <div className="flex flex-1 flex-wrap mt-3 gap-2">
          {categories?.map((cat, catIndex) => (
            <PrimarySelectable
              key={catIndex}
              label={cat}
              selected={Boolean(selected?.find((selec) => selec === cat))}
              onSelect={() => handleSelect(cat)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default CreateActivityCategoriesSection;
