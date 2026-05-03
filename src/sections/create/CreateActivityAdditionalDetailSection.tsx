// src/sections/create/CreateActivityAdditionalDetailSection.tsx
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PiCaretDown, PiCheck, PiEraser, PiX } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import PrimaryInput from "../../components/input/PrimaryInput";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import {
  ADDITIONAL_INFO_DROPDOWN_ORDER,
  additionalInfoChipInlineIconClasses,
  additionalInfoIconWrapClasses,
  additionalInfoToneChipClasses,
  getAdditionalInfoDisplayLabel,
  getAdditionalInfoIcon,
  getAdditionalInfoValueFieldLabel,
  getAdditionalInfoValuePlaceholder,
  resolveAdditionalInfoEntry,
  type AdditionalInfoTone,
} from "../../lib/activityAdditionalInfoRegistry";
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
  return getAdditionalInfoDisplayLabel(title);
}

const SECTION_HEADER_BTN =
  "group flex w-full items-center justify-between gap-2 rounded-[var(--create-radius-panel)] border border-[var(--create-border-panel-line-soft)] " +
  "bg-[color-mix(in_oklab,var(--surface)_35%,transparent)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] " +
  "transition hover:bg-[color-mix(in_oklab,var(--surface)_48%,transparent)] active:scale-[0.99] " +
  "app-dark:border-[var(--create-border-panel-line)] app-dark:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] " +
  "app-dark:hover:bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]";

/** Combobox input — full-width searchable control (light + dark) */
const COMBO_INPUT_EMBEDDED =
  "w-full min-w-0 h-10 rounded-full border border-[var(--create-border-panel-line-soft)] " +
  "bg-[color-mix(in_oklab,var(--surface)_65%,transparent)] px-3 pr-9 text-left text-sm text-[var(--text)] " +
  "placeholder:text-[var(--text)]/44 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md outline-none transition " +
  "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--brand)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] " +
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] app-dark:placeholder:text-[var(--text)]/42 " +
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] app-dark:focus-visible:ring-[color-mix(in_oklab,var(--brand)_36%,transparent)] app-dark:focus-visible:ring-offset-[var(--bg)] " +
  "app-dark:border-[var(--create-border-panel-line)] disabled:cursor-not-allowed disabled:opacity-45";

const COMBO_INPUT_STANDALONE =
  "w-full min-w-0 h-10 rounded-xl border border-[var(--create-border-panel-line-soft)] " +
  "bg-[color-mix(in_oklab,var(--surface)_62%,transparent)] px-3 pr-9 text-left text-sm text-[var(--text)] " +
  "placeholder:text-[var(--text)]/44 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md outline-none transition " +
  "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--brand)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] " +
  "app-dark:bg-[color-mix(in_oklab,var(--surface)_20%,transparent)] app-dark:placeholder:text-[var(--text)]/42 " +
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] app-dark:border-[var(--create-border-panel-line)] app-dark:focus-visible:ring-[color-mix(in_oklab,var(--brand)_36%,transparent)] " +
  "disabled:cursor-not-allowed disabled:opacity-45";

/** Result list — same width as input; frosted panel */
const COMBO_LIST =
  "absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 min-w-0 overflow-y-auto scroll-hide rounded-2xl border " +
  "border-[var(--create-border-panel-line-soft)] bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] py-1 " +
  "shadow-[0_16px_48px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl backdrop-saturate-150 " +
  "app-dark:border-[var(--create-border-panel-line)] app-dark:bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] " +
  "app-dark:shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)]";

const COMBO_OPTION =
  "flex w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left text-xs text-[var(--text)]/88 transition " +
  "hover:bg-[color-mix(in_oklab,var(--surface)_38%,transparent)] active:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] " +
  "app-dark:text-[var(--text)]/92 app-dark:hover:bg-[color-mix(in_oklab,var(--surface)_44%,transparent)] app-dark:active:bg-[color-mix(in_oklab,var(--surface)_34%,transparent)]";

/** Tabs only — sits above the bordered editor (not inside it). */
const TAB_ROW_WRAP = "flex w-full min-w-0 flex-wrap gap-1.5 py-0.5";

/** Bordered editor only: field + actions (tabs excluded). */
const EDITOR_BOX_ONLY =
  "rounded-[var(--create-radius-panel)] border border-[var(--create-border-panel-line-soft)] " +
  "bg-[color-mix(in_oklab,var(--surface)_36%,transparent)] px-2.5 py-2 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] " +
  "app-dark:border-[var(--create-border-panel-line)] app-dark:bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] " +
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

const TAB_CHIP_BASE =
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition sm:text-xs";

/** Inactive tab chips — neutral, consistent. */
const TAB_CHIP_INACTIVE =
  "border border-[var(--create-border-panel-line-soft)] bg-[color-mix(in_oklab,var(--surface)_58%,transparent)] text-[var(--text)]/76 " +
  "app-dark:border-[var(--create-border-panel-line)] app-dark:bg-[color-mix(in_oklab,var(--surface)_24%,transparent)] app-dark:text-[var(--text)]/73";

/**
 * Active tab: light theme = darker filled pill; dark theme = light / white-ish fill.
 */
const TAB_CHIP_ACTIVE =
  "border border-[color-mix(in_oklab,var(--text)_18%,var(--border))] bg-[color-mix(in_oklab,var(--text)_12%,var(--surface))] text-[var(--text)] " +
  "shadow-[inset_0_1px_0_rgba(0,0,0,0.045)] " +
  "app-dark:border-white/26 app-dark:bg-[color-mix(in_oklab,white_18%,var(--surface))] app-dark:text-[var(--text)] " +
  "app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.075)]";

type ComboOption = {
  label: string;
  value: string;
  icon: ReactNode;
  tone: AdditionalInfoTone;
};

function AdditionalInfoTypeCombobox({
  options,
  onSelect,
  disabled,
  embedded,
}: {
  options: ComboOption[];
  onSelect: (value: string) => void;
  disabled: boolean;
  embedded: boolean;
}) {
  const comboId = useId();
  const listboxId = `${comboId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const pick = (value: string) => {
    onSelect(value);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const inputClass = embedded ? COMBO_INPUT_EMBEDDED : COMBO_INPUT_STANDALONE;

  return (
    <div
      ref={rootRef}
      className="relative w-full min-w-0"
      data-additional-info-combobox=""
    >
      <div className="relative w-full">
        <input
          ref={inputRef}
          id={`${comboId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled}
          autoComplete="off"
          placeholder="Search detail types…"
          className={inputClass}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        <PiCaretDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40 transition-transform app-dark:text-[var(--text)]/35 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </div>

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className={COMBO_LIST}
          data-additional-info-combobox-menu=""
        >
          {filtered.length ? (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                className={COMBO_OPTION}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt.value)}
              >
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    additionalInfoIconWrapClasses(opt.tone),
                  ].join(" ")}
                >
                  {opt.icon}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{opt.label}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-center text-[11px] text-[var(--text)]/50">
              No matches — try another search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EMBEDDED_GROUP =
  "rounded-[var(--create-radius-panel)] border border-[var(--create-border-subtle)] bg-[color-mix(in_oklab,var(--surface)_10%,transparent)] p-2.5 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] app-dark:border-[var(--create-border-panel-line)]";

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
  const additionalInfoValueInputId = useId();
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
      if (ae?.closest("[data-additional-info-combobox]")) return;

      setEditingIndex(null);
    }, 120);
  };

  const addableOptionLabels = useMemo(() => {
    const ordered = [...ADDITIONAL_INFO_DROPDOWN_ORDER];
    if (!ordered.includes("Duration")) {
      const i = ordered.indexOf("Custom");
      const next =
        i >= 0
          ? [...ordered.slice(0, i + 1), "Duration", ...ordered.slice(i + 1)]
          : ["Duration", ...ordered];
      return next;
    }
    return ordered;
  }, []);

  const dropdownOptions = useMemo(
    () =>
      addableOptionLabels.map((optLabel) => {
        const meta = resolveAdditionalInfoEntry(optLabel);
        const IconComp = meta?.Icon ?? getAdditionalInfoIcon(optLabel);
        const tone: AdditionalInfoTone = meta?.tone ?? "neutral";
        return {
          label: optLabel,
          value: optLabel,
          tone,
          icon: (
            <IconComp
              className="h-3.5 w-3.5 shrink-0 text-current"
              aria-hidden
            />
          ),
        };
      }),
    [addableOptionLabels]
  );

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
    "flex flex-col gap-3 rounded-[var(--create-radius-panel)] border border-[var(--create-border-subtle)] bg-[var(--surface)]/22 px-3 py-3 app-dark:border-[var(--create-border-panel-line)]";

  /** Avoid double chrome when tabbed editor shell provides its own border. */
  const listOuterEditingClass = "flex flex-col gap-3 w-full";

  const chipBase = embedded
    ? "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium text-[var(--text)]/92 app-dark:border-[var(--create-border-panel-line)]"
    : "inline-flex max-w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium text-[var(--text)]/92";

  const chipGapClass = embedded
    ? "flex flex-wrap gap-1.5"
    : "flex flex-wrap gap-2";

  const atDetailItemLimit = infoCount >= L.maxAdditionalDetailItemsPerStop;

  const detailChips = (tabbed: boolean) => (
    <div
      className={tabbed ? TAB_ROW_WRAP : chipGapClass}
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          editorInteractionRef.current = true;
        }
      }}
    >
      {(a?.additionalInfo || []).map((it: InfoItem, idx: number) => {
        const chipLabel = displayChipTitle(it.title);
        const summary = `${it.title}${it.value ? `: ${it.value}` : ""}`;
        const meta = resolveAdditionalInfoEntry(it.title);
        const tone: AdditionalInfoTone = meta?.tone ?? "neutral";
        const IconComp = meta?.Icon ?? getAdditionalInfoIcon(it.title);
        const chipClasses = tabbed
          ? [
              TAB_CHIP_BASE,
              editingIndex === idx ? TAB_CHIP_ACTIVE : TAB_CHIP_INACTIVE,
            ].join(" ")
          : [chipBase, additionalInfoToneChipClasses(tone)].join(" ");

        const iconClasses = tabbed
          ? editingIndex === idx
            ? ["h-3 w-3 shrink-0", additionalInfoChipInlineIconClasses(tone)].join(
                " "
              )
            : "h-3 w-3 shrink-0 opacity-[0.72]"
          : ["h-3 w-3 shrink-0", additionalInfoChipInlineIconClasses(tone)].join(
              " "
            );

        return (
          <span key={`${it.title}-${idx}`} className={chipClasses} title={summary}>
            <IconComp className={iconClasses} aria-hidden />
            <button
              type="button"
              onClick={() => setEditingIndex(idx)}
              className="max-w-[160px] truncate text-left font-semibold hover:opacity-90 sm:max-w-[200px]"
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

  const editorPanelBody =
    editingIndex !== null && a?.additionalInfo?.[editingIndex] ? (
      <div ref={editorPanelRef}>
        {(a.additionalInfo[editingIndex].isCustom ||
          isCustomPresetTitle(a.additionalInfo[editingIndex].title)) && (
          <div className="mb-2">
            <PrimaryInput
              aria-label="Name for this detail"
              placeholder="Name this detail…"
              label={undefined}
              editorChrome
              value={a.additionalInfo[editingIndex].title}
              rows={1}
              textarea
              maxLength={L.additionalDetailCustomTitleMaxChars}
              className={
                "!min-h-[2.5rem] !py-1.5 " +
                charFieldRingClassForTone(
                  charLimitTone(
                    (a.additionalInfo[editingIndex].title || "").length,
                    L.additionalDetailCustomTitleMaxChars
                  )
                )
              }
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

        <PrimaryInput
          id={additionalInfoValueInputId}
          label={undefined}
          aria-label={getAdditionalInfoValueFieldLabel(
            a.additionalInfo[editingIndex].title
          )}
          placeholder={getAdditionalInfoValuePlaceholder(
            a.additionalInfo[editingIndex].title
          )}
          value={a.additionalInfo[editingIndex].value || ""}
          rows={2}
          textarea
          editorChrome
          compactCounter
          counterCorner="top-right"
          maxLength={L.additionalDetailValueMaxChars}
          counterMax={L.additionalDetailValueMaxChars}
          className={
            "!min-h-[3.75rem] !pt-1 !pb-1.5 " +
            charFieldRingClassForTone(
              charLimitTone(
                (a.additionalInfo[editingIndex].value || "").length,
                L.additionalDetailValueMaxChars
              )
            )
          }
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

        <div className="mt-2.5 grid w-full grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setEditingIndex(null)}
            className="flex h-6 min-h-0 w-full min-w-0 items-center justify-center gap-1 rounded-full border border-[var(--text)]/18 bg-white px-2 text-[11px] font-semibold leading-none text-[var(--brand-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.07)] ring-1 ring-[var(--text)]/[0.07] transition hover:bg-[color-mix(in_oklab,var(--surface)_6%,white)] active:scale-[0.99] app-dark:border-white/32 app-dark:bg-white app-dark:text-[var(--brand-ink)] app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.42)] app-dark:ring-white/28 app-dark:hover:bg-white/96"
          >
            <PiX className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Close
          </button>
          <button
            type="button"
            onClick={() => setEditingIndex(null)}
            className="flex h-6 min-h-0 w-full min-w-0 items-center justify-center gap-1 rounded-full bg-[var(--brand)] px-2 text-[11px] font-semibold leading-none text-[var(--brand-ink)] shadow-[0_1px_0_rgba(0,0,0,0.08)] ring-1 ring-[color-mix(in_oklab,var(--brand-ink)_18%,var(--brand))] transition hover:brightness-[1.04] active:scale-[0.99] app-dark:shadow-[0_1px_0_rgba(255,255,255,0.08)] app-dark:ring-[color-mix(in_oklab,white_22%,var(--brand))]"
          >
            <PiCheck className="h-3.5 w-3.5 shrink-0 opacity-95" aria-hidden />
            Save
          </button>
          <button
            type="button"
            onClick={() => upsertAt(editingIndex, { value: "" })}
            aria-label="Clear text for this detail"
            title="Clears what you typed; keeps this detail type"
            className="flex h-6 min-h-0 w-full min-w-0 items-center justify-center gap-1 rounded-full border border-[var(--create-border-panel-line-soft)] bg-[color-mix(in_oklab,var(--surface)_48%,transparent)] px-2 text-[11px] font-medium leading-none text-[var(--text)]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition hover:bg-[color-mix(in_oklab,var(--surface)_62%,transparent)] active:scale-[0.99] app-dark:border-[var(--create-border-panel-line)] app-dark:bg-[color-mix(in_oklab,var(--surface)_30%,transparent)] app-dark:text-[var(--text)]/92 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <PiEraser className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Clear
          </button>
        </div>
      </div>
    ) : null;

  const chipsAndEditor =
    editingIndex !== null ? (
      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="w-full min-w-0">{detailChips(true)}</div>
        <div className={EDITOR_BOX_ONLY}>{editorPanelBody}</div>
      </div>
    ) : (
      detailChips(false)
    );

  const addDropdownBlock = (
    <div
      className="w-full min-w-0"
      onPointerDownCapture={() => {
        editorInteractionRef.current = true;
      }}
    >
      <AdditionalInfoTypeCombobox
        options={dropdownOptions}
        embedded={embedded}
        disabled={atDetailItemLimit}
        onSelect={(val) => addItem(val)}
      />
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
        {chipsAndEditor}
        <div className="mt-2">{addDropdownBlock}</div>
      </div>
    ) : (
      <div
        className={
          editingIndex !== null ? listOuterEditingClass : listOuterClass
        }
      >
        {chipsAndEditor}
        {addDropdownBlock}
      </div>
    )
  ) : embedded ? (
    <div className={EMBEDDED_GROUP}>{addDropdownBlock}</div>
  ) : (
    <div
      className="w-full min-w-0 rounded-[var(--create-radius-panel)] border border-[var(--create-border-subtle)] bg-[var(--surface)]/15 px-3 py-3 app-dark:border-[var(--create-border-panel-line)]"
      onPointerDownCapture={() => {
        editorInteractionRef.current = true;
      }}
    >
      <AdditionalInfoTypeCombobox
        options={dropdownOptions}
        embedded={false}
        disabled={atDetailItemLimit}
        onSelect={(val) => addItem(val)}
      />
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
          <span className="rounded-full border border-[var(--create-border-panel-line-soft)] bg-[var(--surface)]/25 px-2 py-0.5 text-[11px] font-medium text-[var(--text)]/65 tabular-nums app-dark:border-[var(--create-border-panel-line)]">
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
