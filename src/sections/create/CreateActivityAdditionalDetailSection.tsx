// src/sections/create/CreateActivityAdditionalDetailSection.tsx
import { useMemo, useState } from "react";
import { MdClose } from "react-icons/md";
import { ActivityType } from "../../types/post";
import SecondaryDropdown from "../../components/input/dropdown/SecondaryDropdown";
import PrimaryInput from "../../components/input/PrimaryInput";
import { additionalActiviesData } from "../../data/data";

interface CreateActivityAdditionalDetailSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
}

type InfoItem = { title: string; value: string; isCustom?: boolean };

export default function CreateActivityAdditionalDetailSection({
  activity,
  handleChange,
}: CreateActivityAdditionalDetailSectionProps) {
  const a: any = activity; // local widen
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Ensure "Duration" is one of the addable options
  const addableOptions = useMemo(() => {
    const base = Array.isArray(additionalActiviesData)
      ? additionalActiviesData.map((t) => String(t))
      : [];
    return base.includes("Duration") ? base : ["Duration", ...base];
  }, []);

  const setAdditionalInfo = (next: InfoItem[]) =>
    handleChange("additionalInfo", next);

  const removeAt = (idx: number) => {
    const next = (a?.additionalInfo || []).filter(
      (_: InfoItem, i: number) => i !== idx
    );
    setAdditionalInfo(next);
    if (editingIndex === idx) setEditingIndex(null);
  };

  const upsertAt = (idx: number, patch: Partial<InfoItem>) => {
    const next = (a?.additionalInfo || []).map((it: InfoItem, i: number) =>
      i === idx ? { ...it, ...patch } : it
    );
    setAdditionalInfo(next);
  };

  const addItem = (title: string) => {
    const next = [
      ...(a?.additionalInfo || []),
      {
        title,
        value: "",
        isCustom: title.toLowerCase() === "other",
      } as InfoItem,
    ];
    setAdditionalInfo(next);
    setEditingIndex(next.length - 1); // jump into edit on add
  };

  const hasAdditionalInfo = (a?.additionalInfo || []).length > 0;

  return (
    <section className="w-full mt-3">
      {hasAdditionalInfo ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3 flex flex-col gap-3">
          {/* Selected items as rectangular tags */}
          <div className="flex flex-wrap gap-2">
            {(a?.additionalInfo || []).map((it: InfoItem, idx: number) => {
              const isOther = it.title.toLowerCase() === "other";

              return (
                <span
                  key={`${it.title}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-[var(--text)] border border-[var(--border)] max-w-full bg-[var(--surface)]/50"
                  title={
                    isOther
                      ? it.title
                      : `${it.title}${it.value ? `: ${it.value}` : ""}`
                  }
                >
                  <button
                    type="button"
                    onClick={() => setEditingIndex(idx)}
                    className="hover:opacity-90 truncate max-w-[200px]"
                  >
                    {it.title}
                  </button>
                  <button
                    type="button"
                    className="opacity-80 hover:opacity-100 flex-shrink-0"
                    aria-label="Remove"
                    onClick={() => removeAt(idx)}
                    title="Remove"
                  >
                    <MdClose size={14} />
                  </button>
                </span>
              );
            })}
          </div>

          {/* Inline editor for the currently selected item - now inside the main section */}
          {editingIndex !== null && a?.additionalInfo?.[editingIndex] && (
            <div className="border border-[var(--border)] rounded-lg px-3 py-3 bg-[var(--surface)]/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text)]/70">
                  Edit <strong>{a.additionalInfo[editingIndex].title}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingIndex(null)}
                  className="text-xs px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
                >
                  Close
                </button>
              </div>

              {/* For custom items, allow editing the title */}
              {a.additionalInfo[editingIndex].isCustom && (
                <div className="mb-3">
                  <PrimaryInput
                    label="Title"
                    placeholder="Enter custom title"
                    value={a.additionalInfo[editingIndex].title}
                    rows={1}
                    textarea
                    onChange={(e) => {
                      const newTitle = String(e.target.value);
                      upsertAt(editingIndex, { title: newTitle });
                    }}
                  />
                </div>
              )}

              <PrimaryInput
                label={
                  a.additionalInfo[editingIndex].title === "Duration"
                    ? "Duration (e.g., 1h 30m)"
                    : "Value"
                }
                placeholder={
                  a.additionalInfo[editingIndex].title === "Duration"
                    ? "e.g., 45m, 1h, 2h 15m"
                    : "Type here"
                }
                value={a.additionalInfo[editingIndex].value || ""}
                rows={1}
                textarea
                onChange={(e) =>
                  upsertAt(editingIndex, { value: String(e.target.value) })
                }
              />

              {/* Save/Clear buttons */}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingIndex(null)}
                  className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90 active:scale-[0.99] transition"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => upsertAt(editingIndex, { value: "" })}
                  className="text-xs rounded-lg px-3 py-1.5 border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Full width dropdown to add new additional info */}
          <div className="w-full">
            <SecondaryDropdown
              className="w-full"
              label="Add additional info"
              value=""
              options={addableOptions.map((label) => ({ label, value: label }))}
              onChange={(val) => addItem(val)}
            />
          </div>
        </div>
      ) : (
        /* No box when empty - just the dropdown */
        <div className="w-full">
          <SecondaryDropdown
            className="w-full"
            label="Add additional info"
            value=""
            options={addableOptions.map((label) => ({ label, value: label }))}
            onChange={(val) => addItem(val)}
          />
        </div>
      )}
    </section>
  );
}
