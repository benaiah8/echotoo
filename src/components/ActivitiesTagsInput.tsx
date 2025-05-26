// src/components/ActivitiesTagsInput.tsx
import { useRef, useState, useEffect } from "react";
import { IoIosArrowDown } from "react-icons/io";
import { activitiesData } from "../data/data";

export default function ActivitiesTagsInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (newTags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const suggestions = activitiesData
    .map((a) => a.title)
    .filter(
      (t) => !tags.includes(t) && t.toLowerCase().includes(input.toLowerCase())
    );

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 0);
  }, [open]);

  const addTag = (t: string) => {
    if (t && !tags.includes(t)) {
      onChange([...tags, t]);
      setInput("");
    }
  };
  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="bg-background200 text-white rounded-full px-2 py-1 flex items-center gap-1 text-xs"
          >
            {t}
            <button onClick={() => removeTag(t)}>×</button>
          </span>
        ))}
      </div>
      <div className="relative">
        <div
          className="flex items-center justify-between border border-gray-600 rounded px-3 py-2"
          onClick={() => setOpen((o) => !o)}
        >
          <input
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addTag(input.trim());
                e.preventDefault();
              }
            }}
            placeholder="Add or pick activities"
            className="flex-1 bg-transparent text-sm text-white outline-none"
          />
          <IoIosArrowDown
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
        {open && (
          <div className="absolute z-10 bg-background rounded-md mt-1 w-full max-h-40 overflow-auto text-white">
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <div
                  key={s}
                  className="px-3 py-1 text-xs hover:bg-background200 cursor-pointer"
                  onClick={() => {
                    addTag(s);
                    setOpen(false);
                  }}
                >
                  {s}
                </div>
              ))
            ) : (
              <div className="px-3 py-1 text-xs text-gray-500">No matches</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
