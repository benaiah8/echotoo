import { useRef, useState, useEffect } from "react";
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
    const v = t.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
      setInput("");
      setOpen(false);
      ref.current?.focus();
    }
  };

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTag(input);
  };

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Selected activity chips */}
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-lg px-2 sm:px-3 py-2 flex items-center gap-1 text-xs bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] max-w-full"
          >
            <span className="truncate max-w-[100px] sm:max-w-none">{t}</span>
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="opacity-80 hover:opacity-100 flex-shrink-0"
              aria-label={`Remove ${t}`}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Input + Add button */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 h-10 overflow-hidden min-w-0">
          <input
            ref={ref}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // small delay so list clicks don't blur-close too early
              setTimeout(() => setOpen(false), 120);
            }}
            enterKeyHint="done"
            placeholder="Add or pick activities"
            className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none min-w-0 w-0"
          />

          {/* Themed rectangular commit button - Fixed for mobile */}
          <button
            type="submit"
            className="text-xs font-semibold rounded-lg px-2 sm:px-3 py-1 bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)] hover:opacity-90 active:scale-[0.99] transition flex-shrink-0 whitespace-nowrap"
            aria-label="Add activity"
            title="Add"
          >
            <span className="hidden sm:inline">Add</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>

        {open && (
          <div
            role="listbox"
            className="absolute z-10 bg-[var(--surface)] rounded-md mt-1 w-full max-h-56 overflow-auto text-[var(--text)] border border-[var(--border)] shadow"
          >
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <div
                  key={s}
                  role="option"
                  className="px-3 py-2 text-sm hover:bg-[var(--surface-2)]/50 cursor-pointer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(s)}
                >
                  {s}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-[var(--text)]/60">
                Click "Add" to create custom activity
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
