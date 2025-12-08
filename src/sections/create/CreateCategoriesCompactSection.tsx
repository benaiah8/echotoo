import { useEffect, useMemo, useState } from "react";
import SecondaryDropdown from "../../components/input/dropdown/SecondaryDropdown";
import PrimaryInput from "../../components/input/PrimaryInput";
import { categoriesData as _rawCategoriesData } from "../../data/data";

type DraftMeta = { title: string; description: string };
type DraftCategories = {
  activityTypes: string[];
  themes: string[];
  audiences: string[];
  timeSeasons: string[];
  custom: string[];
};

function read<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : def;
  } catch {
    return def;
  }
}
function write<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ← MIGRATION: convert any old single-select shape into arrays
function normalizeCats(raw: any): DraftCategories {
  const arr = (v: any): string[] =>
    Array.isArray(v)
      ? v.filter(Boolean)
      : typeof v === "string" && v
      ? [v]
      : [];
  return {
    activityTypes: arr(raw?.activityTypes ?? raw?.activityType),
    themes: arr(raw?.themes ?? raw?.theme),
    audiences: arr(raw?.audiences ?? raw?.audience),
    timeSeasons: arr(raw?.timeSeasons ?? raw?.timeSeason),
    custom: arr(raw?.custom),
  };
}

const toOptions = (items: string[]) =>
  items.map((s) => ({ label: s, value: s }));

export default function CreateCategoriesCompactSection({
  onTagsChange,
  hideMetaCard = false,
}: {
  onTagsChange: (tags: string[]) => void;
  hideMetaCard?: boolean;
}) {
  // Title/description (prefilled from step 1 if present)
  const [meta, setMeta] = useState<DraftMeta>(() =>
    read<DraftMeta>("draftMeta", { title: "", description: "" })
  );

  // Read & normalize categories (handles legacy/localStorage shapes)
  const [cats, setCats] = useState<DraftCategories>(() =>
    normalizeCats(
      read<any>("draftCategories", {
        activityTypes: [],
        themes: [],
        audiences: [],
        timeSeasons: [],
        custom: [],
      })
    )
  );

  // Persist normalized back immediately (so future reads are safe)
  useEffect(() => {
    write("draftCategories", cats);
  }, []); // once on mount

  const [customInput, setCustomInput] = useState("");

  // Defensive categories data
  const categoriesData = Array.isArray(_rawCategoriesData)
    ? _rawCategoriesData
    : [];
  const getItems = (label: string) =>
    categoriesData.find((c) => c?.label === label)?.items ?? [];

  const { activityOpts, themeOpts, audienceOpts, timeSeasonOpts } =
    useMemo(() => {
      return {
        activityOpts: toOptions(getItems("By Activity Type")),
        themeOpts: toOptions(getItems("By Theme/Genre")),
        audienceOpts: toOptions(getItems("By Audience")),
        timeSeasonOpts: toOptions(getItems("By Time/Season")),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoriesData.length]);

  // keep meta in sync (used elsewhere)
  useEffect(() => write("draftMeta", meta), [meta]);

  // emit combined tags whenever cats changes
  useEffect(() => {
    write("draftCategories", cats);
    const tags = [
      ...(cats.activityTypes ?? []),
      ...(cats.themes ?? []),
      ...(cats.audiences ?? []),
      ...(cats.timeSeasons ?? []),
      ...(cats.custom ?? []),
    ];
    onTagsChange?.(tags);
  }, [cats, onTagsChange]);

  const addCustom = () => {
    const v = customInput.trim();
    if (!v) return;
    if ((cats.custom ?? []).includes(v)) return;
    setCats((prev) => ({ ...prev, custom: [...(prev.custom ?? []), v] }));
    setCustomInput("");
  };

  const removeChip = (group: keyof DraftCategories, value: string) => {
    setCats((prev) => ({
      ...prev,
      [group]: (prev[group] ?? []).filter((x) => x !== value),
    }));
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="text-[var(--text)]/80 text-sm">Categories / Tags</div>

      {/* Title & Description (editable) */}
      {!hideMetaCard && (
        <div className="bg-[var(--surface-2)] rounded-xl p-4">
          <div className="grid grid-cols-1 gap-3">
            <PrimaryInput
              label="Title"
              placeholder="Edit your title"
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            />
            <PrimaryInput
              label="Description"
              textarea
              rows={1}
              placeholder="Edit your description"
              value={meta.description}
              onChange={(e) =>
                setMeta({ ...meta, description: e.target.value })
              }
            />
          </div>
        </div>
      )}

      {/* Categories/Tags (multi) */}
      <div className="bg-[var(--surface-2)] rounded-xl p-4">
        <div className="grid grid-cols-1 gap-3">
          <SecondaryDropdown
            multi
            label="Activity Type"
            options={activityOpts}
            values={cats.activityTypes ?? []}
            onChangeValues={(vals) =>
              setCats((p) => ({ ...p, activityTypes: vals }))
            }
            className="w-full"
          />
          <SecondaryDropdown
            multi
            label="Theme/Genre"
            options={themeOpts}
            values={cats.themes ?? []}
            onChangeValues={(vals) => setCats((p) => ({ ...p, themes: vals }))}
            className="w-full"
          />
          <SecondaryDropdown
            multi
            label="Audience"
            options={audienceOpts}
            values={cats.audiences ?? []}
            onChangeValues={(vals) =>
              setCats((p) => ({ ...p, audiences: vals }))
            }
            className="w-full"
          />
          <SecondaryDropdown
            multi
            label="Time/Season"
            options={timeSeasonOpts}
            values={cats.timeSeasons ?? []}
            onChangeValues={(vals) =>
              setCats((p) => ({ ...p, timeSeasons: vals }))
            }
            className="w-full"
          />
        </div>

        {/* Chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(cats.activityTypes ?? []).map((t) => (
            <span
              key={`at-${t}`}
              className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/90 text-xs flex items-center gap-2"
            >
              {t}
              <button
                onClick={() => removeChip("activityTypes", t)}
                className="text-[var(--text)]/70 hover:text-[var(--text)]"
              >
                ×
              </button>
            </span>
          ))}
          {(cats.themes ?? []).map((t) => (
            <span
              key={`th-${t}`}
              className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/90 text-xs flex items-center gap-2"
            >
              {t}
              <button
                onClick={() => removeChip("themes", t)}
                className="text-[var(--text)]/70 hover:text-[var(--text)]"
              >
                ×
              </button>
            </span>
          ))}
          {(cats.audiences ?? []).map((t) => (
            <span
              key={`au-${t}`}
              className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/90 text-xs flex items-center gap-2"
            >
              {t}
              <button
                onClick={() => removeChip("audiences", t)}
                className="text-[var(--text)]/70 hover:text-[var(--text)]"
              >
                ×
              </button>
            </span>
          ))}
          {(cats.timeSeasons ?? []).map((t) => (
            <span
              key={`ts-${t}`}
              className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/90 text-xs flex items-center gap-2"
            >
              {t}
              <button
                onClick={() => removeChip("timeSeasons", t)}
                className="text-[var(--text)]/70 hover:text-[var(--text)]"
              >
                ×
              </button>
            </span>
          ))}
          {(cats.custom ?? []).map((t) => (
            <span
              key={`cu-${t}`}
              className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/90 text-xs flex items-center gap-2"
            >
              {t}
              <button
                onClick={() => removeChip("custom", t)}
                className="text-[var(--text)]/70 hover:text-[var(--text)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Custom tag input – dark style, smaller text */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            className="flex-1 p-2 rounded-md bg-[var(--surface)] text-[var(--text)] text-xs border border-[var(--border)] placeholder-white/50"
            placeholder="Add custom tag and press Enter"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <button
            onClick={addCustom}
            className="px-3 py-2 bg-primary text-black rounded-md text-xs"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
