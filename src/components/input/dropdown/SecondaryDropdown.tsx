import React, { useRef, useState, type ReactNode } from "react";
import { PiCaretDown, PiCheck } from "react-icons/pi";
import DropdownContainer from "./DropdownContainer";

export type SecondaryDropdownOption = {
  label: string;
  value: string;
  icon?: ReactNode;
};

interface Props {
  label?: string;
  // single-select API (existing)
  value?: string;
  onChange?: (value: string) => void;

  // multi-select API (new)
  multi?: boolean;
  values?: string[];
  onChangeValues?: (values: string[]) => void;

  options: SecondaryDropdownOption[];
  className?: string;
  dropdownClassName?: string;
  /** Replaces default trigger chrome (border, height, padding). Portal/dropdown unchanged. */
  triggerClassName?: string;
  /** Optional icon or element before the label (e.g. search affordance). */
  triggerPrefix?: ReactNode;
  /**
   * Create-flow / Activities: themed menu surface, search row, and option rows
   * (portal positioning unchanged).
   */
  createFlowMenu?: boolean;
  disabled?: boolean;
}

const SecondaryDropdown: React.FC<Props> = ({
  label = "",
  value = "",
  onChange,
  multi = false,
  values = [],
  onChangeValues,
  options,
  className = "",
  dropdownClassName = "",
  triggerClassName,
  triggerPrefix,
  createFlowMenu = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** Create-flow: always show search inside the single menu panel (no separate “search layer”). */
  const showSearch = createFlowMenu ? true : options.length > 5;

  const filtered = options.filter(
    (option) =>
      option.label.toLowerCase().includes(search.toLowerCase()) ||
      option.value.toLowerCase().includes(search.toLowerCase())
  );

  const handleParentToggle = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  };

  const toggleMulti = (val: string) => {
    if (!onChangeValues) return;
    if (values.includes(val)) {
      onChangeValues(values.filter((v) => v !== val));
    } else {
      onChangeValues([...values, val]);
    }
  };

  const selectedSingle = options.find((opt) => opt.value === value);
  const displayLabel = multi
    ? values.length
      ? `${label}${values.length ? ` (${values.length})` : ""}`
      : label || "Select"
    : selectedSingle?.label || label || "Select";

  const menuShellClass = createFlowMenu
    ? "flex w-full min-w-[260px] max-w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl text-[var(--text)]"
    : "flex w-fit max-w-[320px] flex-col text-[var(--text)]";

  const searchClass = createFlowMenu
    ? "w-full border-b border-[var(--create-border-panel-line-soft)]/80 bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] px-3 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text)]/38 outline-none transition focus-visible:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)]/25"
    : "border-b border-gray-500 bg-transparent px-3 py-2 text-sm outline-none";

  const optionBtnClass = (isSelected: boolean) =>
    createFlowMenu
      ? [
          "mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs text-[var(--text)]/92 transition",
          "hover:bg-[color-mix(in_oklab,var(--surface)_48%,transparent)] active:scale-[0.99] active:bg-[color-mix(in_oklab,var(--surface)_36%,transparent)]",
          isSelected
            ? "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] ring-1 ring-[var(--brand)]/25"
            : "",
        ].join(" ")
      : `px-4 py-2 text-left text-xs w-full flex items-center justify-between ${
          isSelected ? "hover:bg-[rgba(255,255,255,0.08)]" : ""
        }`;

  const emptyClass = createFlowMenu
    ? "px-4 py-3 text-xs text-[var(--text)]/45"
    : "px-4 py-2 text-sm text-gray-400";

  const portalMenuClass = createFlowMenu
    ? `!max-h-none !overflow-hidden min-w-[260px] max-w-[min(320px,calc(100vw-32px))] !rounded-2xl !border !border-[var(--create-border-panel-line-soft)] !bg-[color-mix(in_oklab,var(--surface)_55%,transparent)] !text-[var(--text)] !shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] !backdrop-blur-xl !backdrop-saturate-150 supports-[backdrop-filter]:!bg-[color-mix(in_oklab,var(--surface)_42%,transparent)] ${dropdownClassName}`
    : `w-fit ${dropdownClassName}`;

  const defaultTrigger =
    "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2";
  const triggerMerged = triggerClassName
    ? [triggerClassName, triggerPrefix ? "gap-2" : ""].filter(Boolean).join(" ")
    : defaultTrigger;

  return (
    <DropdownContainer
      className={className}
      dropdownClassName={portalMenuClass}
      left
      disabled={disabled}
      barePortal={createFlowMenu}
      parentToggle={handleParentToggle}
      dropdown={(closeDropdown) => (
        <div className={menuShellClass}>
          {showSearch && (
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Filter types…"
              className={searchClass}
            />
          )}
          <div
            className={
              createFlowMenu
                ? "max-h-56 scroll-hide overflow-y-auto py-1.5"
                : "max-h-56 scroll-hide overflow-y-auto"
            }
          >
            {filtered.length > 0 ? (
              filtered.map((option) => {
                const isSelected = multi
                  ? values.includes(option.value)
                  : value === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={optionBtnClass(isSelected)}
                    onClick={() => {
                      if (multi) {
                        toggleMulti(option.value);
                      } else {
                        onChange?.(option.value);
                        closeDropdown();
                      }
                    }}
                  >
                    {option.icon ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--surface)_40%,transparent)] text-[var(--text)]/90">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 leading-snug">{option.label}</span>
                    {multi && isSelected && <PiCheck className="shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className={emptyClass}>No matches found</div>
            )}
          </div>

          {multi && (
            <div className="border-t border-[var(--border)] p-2">
              <button
                type="button"
                onClick={() => closeDropdown()}
                className="w-full rounded py-2 text-xs bg-primary text-black"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    >
      <div className={triggerMerged}>
        {triggerPrefix ? (
          <span className="pointer-events-none flex shrink-0 items-center">
            {triggerPrefix}
          </span>
        ) : null}
        <span
          className={`${
            triggerClassName
              ? "min-w-0 flex-1 text-left text-[11px] font-medium leading-snug"
              : "text-sm"
          } ${
            value || values.length
              ? "text-[var(--text)]"
              : "text-[var(--text)]/60"
          }`}
        >
          {displayLabel}
        </span>
        <PiCaretDown
          className={`shrink-0 transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
    </DropdownContainer>
  );
};

export default SecondaryDropdown;
