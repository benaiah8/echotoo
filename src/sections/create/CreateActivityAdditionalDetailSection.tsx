// src/sections/create/CreateActivityAdditionalDetailSection.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { PiCaretDown, PiMagnifyingGlass, PiX } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import SecondaryDropdown from "../../components/input/dropdown/SecondaryDropdown";
import PrimaryInput from "../../components/input/PrimaryInput";
import { additionalActiviesData } from "../../data/data";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import {
  clampString,
  charFieldRingClassForTone,
  charLimitTone,
} from "../../lib/createFlowLimitUtils";

const L = CREATE_FLOW_LIMITS.activities;

interface CreateActivityAdditionalDetailSectionProps {
  activity: ActivityType;
  handleChange: (field: string, value: any) => void;
  /** Shared add-on panel: skip outer collapsible chrome */
  embedded?: boolean;
}

type InfoItem = { title: string; value: string; isCustom?: boolean };

/** Preset row that uses free-form title (new "Custom" + legacy "Other"). */
function isCustomPresetTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === "other" || t === "custom";
}

/** Show "Custom" in UI when legacy data still stores "Other". */
function displayChipTitle(title: string): string {
  return title.trim().toLowerCase() === "other" ? "Custom" : title;
}

const SECTION_HEADER_BTN =
  "group flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)]/50 " +
  "bg-[color-mix(in_oklab,var(--surface)_35%,transparent)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
  "transition hover:bg-[color-mix(in_oklab,var(--surface)_48%,transparent)] active:scale-[0.99] " +
  "dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] " +
  "dark:hover:bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]";

/** Shared add-on panel: search affordance, matches pill / create-flow tone */
const EMBEDDED_ADD_TRIGGER =
  "flex h-9 w-full items-center rounded-full border border-[var(--border)]/45 " +
  "bg-[color-mix(in_oklab,var(--surface)_16%,transparent)] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
  "transition hover:bg-[color-mix(in_oklab,var(--surface)_24%,transparent)] " +
  "dark:border-white";

const EMBEDDED_GROUP =
  "rounded-xl border border-[var(--border)]/45 bg-[color-mix(in_oklab,var(--surface)_10%,transparent)] p-2.5 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-white";

export default function CreateActivityAdditionalDetailSection({
  activity,
  handleChange,
  embedded = false,
}: CreateActivityAdditionalDetailSectionProps) {
  const a: any = activity;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editingIndexRef = useRef<number | null>(null);
  editingIndexRef.current = editingIndex;

  const editorPanelRef = useRef<HTMLDivElement>(null);
  const editorBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pointerdown on chips/dropdown before textarea blur — avoids closing before click handlers run. */
  const editorInteractionRef = useRef(false);

  const infoCount = (a?.additionalInfo || []).length;
  const [sectionOpen, setSectionOpen] = useState(() => infoCount > 0);

  useEffect(() => {
    if (infoCount > 0) setSectionOpen(true);
  }, [infoCount]);

  useEffect(() => {
    return () => {
      if (editorBlurTimerRef.current) clearTimeout(editorBlurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (editorBlurTimerRef.current) {
      clearTimeout(editorBlurTimerRef.current);
      editorBlurTimerRef.current = null;
    }
  }, [editingIndex]);

  const scheduleEditorBlurClose = () => {
    if (editorBlurTimerRef.current) clearTimeout(editorBlurTimerRef.current);
    editorBlurTimerRef.current = setTimeout(() => {
      editorBlurTimerRef.current = null;

      const interacting = editorInteractionRef.current;
      editorInteractionRef.current = false;
      if (interacting) return;

      if (editingIndexRef.current === null) return;

      const panel = editorPanelRef.current;
      const ae = document.activeElement as HTMLElement | null;
      if (panel?.contains(ae)) return;
      if (ae?.closest("[data-dropdown-portal]")) return;

      setEditingIndex(null);
    }, 120);
  };

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
    if ((a?.additionalInfo || []).length >= L.maxAdditionalDetailItemsPerStop) {
      return;
    }
    const next = [
      ...(a?.additionalInfo || []),
      {
        title,
        value: "",
        isCustom: isCustomPresetTitle(title),
      } as InfoItem,
    ];
    setAdditionalInfo(next);
    setEditingIndex(next.length - 1);
  };

  const hasAdditionalInfo = infoCount > 0;

  const listOuterClass =
    "flex flex-col gap-3 rounded-xl border border-[var(--border)]/45 bg-[var(--surface)]/22 px-3 py-3 dark:border-white";

  const editorShellClass = embedded
    ? "mt-2 border-t border-white/20 pt-2.5"
    : "rounded-lg border border-[var(--border)]/50 bg-[var(--surface)]/40 px-3 py-3";

  const chipClassName = embedded
    ? "inline-flex max-w-full items-center gap-0.5 rounded-full border border-[var(--border)]/35 bg-[color-mix(in_oklab,var(--surface)_26%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]/88 dark:border-white"
    : "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-[var(--text)] border border-[var(--border)]/55 max-w-full bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] dark:border-[var(--border)]/45";

  const chipGapClass = embedded
    ? "flex flex-wrap gap-1.5"
    : "flex flex-wrap gap-2";

  const atDetailItemLimit = infoCount >= L.maxAdditionalDetailItemsPerStop;

  const addDropdownProps = {
    className: "w-full" as const,
    label: (embedded
      ? "Search or add details"
      : "Add additional info") as string,
    value: "" as const,
    options: addableOptions.map((label) => ({ label, value: label })),
    onChange: (val: string) => addItem(val),
    triggerClassName: embedded ? EMBEDDED_ADD_TRIGGER : undefined,
    createFlowMenu: embedded,
    disabled: atDetailItemLimit,
    triggerPrefix: embedded ? (
      <PiMagnifyingGlass
        className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/45"
        aria-hidden
      />
    ) : undefined,
  };

  const chipsBlock = (
    <div
      className={chipGapClass}
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          editorInteractionRef.current = true;
        }
      }}
    >
      {(a?.additionalInfo || []).map((it: InfoItem, idx: number) => {
        const chipLabel = displayChipTitle(it.title);
        const summary = `${it.title}${it.value ? `: ${it.value}` : ""}`;
        return (
          <span
            key={`${it.title}-${idx}`}
            className={chipClassName}
            title={summary}
          >
            <button
              type="button"
              onClick={() => setEditingIndex(idx)}
              className="max-w-[200px] truncate text-left font-medium hover:opacity-90"
            >
              {chipLabel}
            </button>
            <button
              type="button"
              className="flex-shrink-0 opacity-80 hover:opacity-100"
              aria-label="Remove"
              onClick={() => removeAt(idx)}
              title="Remove"
            >
              <PiX size={embedded ? 13 : 14} />
            </button>
          </span>
        );
      })}
    </div>
  );

  const editorBlock =
    editingIndex !== null && a?.additionalInfo?.[editingIndex] ? (
      <div ref={editorPanelRef} className={editorShellClass}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--text)]/70">
            Edit{" "}
            <strong>
              {displayChipTitle(a.additionalInfo[editingIndex].title)}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => setEditingIndex(null)}
            className="text-xs px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
          >
            Close
          </button>
        </div>

        {(a.additionalInfo[editingIndex].isCustom ||
          isCustomPresetTitle(a.additionalInfo[editingIndex].title)) && (
          <div className="mb-3">
            <PrimaryInput
              label="Title"
              placeholder="Enter custom title"
              value={a.additionalInfo[editingIndex].title}
              rows={1}
              textarea
              maxLength={L.additionalDetailCustomTitleMaxChars}
              counterMax={L.additionalDetailCustomTitleMaxChars}
              className={charFieldRingClassForTone(
                charLimitTone(
                  (a.additionalInfo[editingIndex].title || "").length,
                  L.additionalDetailCustomTitleMaxChars
                )
              )}
              onChange={(e) => {
                const newTitle = clampString(
                  String(e.target.value),
                  L.additionalDetailCustomTitleMaxChars
                );
                upsertAt(editingIndex, {
                  title: newTitle,
                  isCustom: isCustomPresetTitle(newTitle),
                });
              }}
              onBlur={scheduleEditorBlurClose}
            />
          </div>
        )}

        <div className="w-full">
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
            maxLength={L.additionalDetailValueMaxChars}
            counterMax={L.additionalDetailValueMaxChars}
            className={charFieldRingClassForTone(
              charLimitTone(
                (a.additionalInfo[editingIndex].value || "").length,
                L.additionalDetailValueMaxChars
              )
            )}
            onChange={(e) =>
              upsertAt(editingIndex, {
                value: clampString(
                  String(e.target.value),
                  L.additionalDetailValueMaxChars
                ),
              })
            }
            onBlur={scheduleEditorBlurClose}
          />
        </div>

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
    ) : null;

  const addDropdownBlock = (
    <div
      className="w-full"
      onPointerDownCapture={() => {
        editorInteractionRef.current = true;
      }}
    >
      <SecondaryDropdown {...addDropdownProps} />
      {atDetailItemLimit ? (
        <p
          className="mt-1.5 text-center text-[10px] text-[var(--text)]/42"
          role="status"
        >
          Max {L.maxAdditionalDetailItemsPerStop} details for this stop
        </p>
      ) : null}
    </div>
  );

  const inner = hasAdditionalInfo ? (
    embedded ? (
      <div className={EMBEDDED_GROUP}>
        {chipsBlock}
        {editorBlock}
        <div className="mt-2">{addDropdownBlock}</div>
      </div>
    ) : (
      <div className={listOuterClass}>
        {chipsBlock}
        {editorBlock}
        {addDropdownBlock}
      </div>
    )
  ) : embedded ? (
    <div className={EMBEDDED_GROUP}>{addDropdownBlock}</div>
  ) : (
    <div
      className="w-full rounded-xl border border-[var(--border)]/45 bg-[var(--surface)]/15 px-3 py-3 dark:border-white"
      onPointerDownCapture={() => {
        editorInteractionRef.current = true;
      }}
    >
      <SecondaryDropdown {...addDropdownProps} />
    </div>
  );

  if (embedded) {
    return <section className="w-full">{inner}</section>;
  }

  return (
    <section className="w-full mt-3">
      <button
        type="button"
        className={SECTION_HEADER_BTN}
        onClick={() => setSectionOpen((o) => !o)}
        aria-expanded={sectionOpen}
        id="activity-more-details-disclosure"
      >
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text)]/92">
            More details
          </span>
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--text)]/45">
            Dress code, duration, contacts…
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[var(--border)]/50 bg-[var(--surface)]/25 px-2 py-0.5 text-[11px] font-medium text-[var(--text)]/65 tabular-nums dark:border-white">
            {infoCount}
          </span>
          <PiCaretDown
            className={`h-4 w-4 shrink-0 text-[var(--text)]/50 transition-transform duration-200 ${
              sectionOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
      </button>

      {sectionOpen && (
        <div
          className="mt-2"
          role="region"
          aria-labelledby="activity-more-details-disclosure"
        >
          {inner}
        </div>
      )}
    </section>
  );
}
