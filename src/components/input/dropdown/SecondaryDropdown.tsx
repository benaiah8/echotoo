import React, { useRef, useState } from "react";
import { IoIosArrowDown, IoIosCheckmark } from "react-icons/io";
import DropdownContainer from "./DropdownContainer";

interface Option {
  label: string;
  value: string;
}

interface Props {
  label?: string;
  // single-select API (existing)
  value?: string;
  onChange?: (value: string) => void;

  // multi-select API (new)
  multi?: boolean;
  values?: string[];
  onChangeValues?: (values: string[]) => void;

  options: Option[];
  className?: string;
  dropdownClassName?: string;
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
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showSearch = options.length > 5;

  const filtered = options.filter(
    (option) =>
      option.label.toLowerCase().includes(search.toLowerCase()) ||
      option.value.includes(search)
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

  return (
    <DropdownContainer
      className={className}
      dropdownClassName={`w-fit ${dropdownClassName}`}
      left
      parentToggle={handleParentToggle}
      dropdown={(closeDropdown) => (
        <div className="flex flex-col w-fit max-w-[320px] text-[var(--text)]">
          {showSearch && (
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="px-3 py-2 text-sm border-b border-gray-500 outline-none bg-transparent"
            />
          )}
          <div className="max-h-56 overflow-y-auto scroll-hide">
            {filtered.length > 0 ? (
              filtered.map((option) => {
                const isSelected = multi
                  ? values.includes(option.value)
                  : value === option.value;

                return (
                  <button
                    key={option.value}
                    className={`px-4 py-2 text-left text-xs w-full flex items-center justify-between ${
                      isSelected ? "hover:bg-[rgba(255,255,255,0.08)]" : ""
                    }`}
                    onClick={() => {
                      if (multi) {
                        toggleMulti(option.value);
                        // DO NOT close in multi mode; let users pick many
                      } else {
                        onChange?.(option.value);
                        closeDropdown();
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    {multi && isSelected && <IoIosCheckmark />}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-2 text-sm text-gray-400">
                No matches found
              </div>
            )}
          </div>

          {multi && (
            <div className="p-2 border-t border-[var(--border)]">
              <button
                onClick={() => closeDropdown()}
                className="w-full py-2 text-xs bg-primary text-black rounded"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] w-full h-10">
        <span
          className={`text-sm ${
            value || values.length
              ? "text-[var(--text)]"
              : "text-[var(--text)]/60"
          }`}
        >
          {displayLabel}
        </span>
        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
    </DropdownContainer>
  );
};

export default SecondaryDropdown;
