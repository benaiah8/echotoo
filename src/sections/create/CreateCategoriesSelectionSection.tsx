import { useState } from "react";
import Collapsible from "../../components/Collapsible";
import { IoIosArrowDown } from "react-icons/io";
import PrimarySelectable from "../../components/input/PrimarySelectable";

interface CreateCategoriesSelectionSectionProps {
  categories: { label: string; items: string[] };
  selected: string[];
  onSelect: (selected: string) => void;
  index: number;
}

function CreateCategoriesSelectionSection({
  categories,
  onSelect,
  selected,
  index,
}: CreateCategoriesSelectionSectionProps) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="bg-background200 w-full rounded-lg p-4 py-2 flex flex-col mt-3">
      <div
        className="w-full items-center justify-between flex cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <small className="">{categories.label}</small>
        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
      <Collapsible open={open}>
        <div className="w-full py-2 flex gap-2 flex-wrap m-2">
          {categories.items?.map((cat, catIndex) => (
            <PrimarySelectable
              key={catIndex}
              className="w-fit"
              label={cat}
              selected={Boolean(selected?.find((selec) => selec === cat))}
              onSelect={() => onSelect(cat)}
            />
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

export default CreateCategoriesSelectionSection;
