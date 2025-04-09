import React, { useRef, useState } from "react";
import { IoIosArrowDown } from "react-icons/io";
import DropdownContainer from "./DropdownContainer";

interface Option {
  label: string;
  value: string;
}

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
  dropdownClassName?: string;
}

const SecondaryDropdown: React.FC<Props> = ({
  value,
  onChange,
  options,
  className = "",
  dropdownClassName = "",
  label = "",
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((opt) => opt.value === value);

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

  const handleSelect = (val: string) => {
    onChange(val);
  };

  return (
    <DropdownContainer
      className={className}
      dropdownClassName={`w-fit ${dropdownClassName}`}
      left
      parentToggle={handleParentToggle}
      dropdown={(closeDropdown) => (
        <div className="flex flex-col w-fit max-w-[300px] text-white">
          {showSearch && (
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="px-3 py-2 text-sm border-b border-gray-400 outline-none"
            />
          )}
          <div className="max-h-48 overflow-y-auto scroll-hide">
            {filtered.length > 0 ? (
              filtered.map((option) => (
                <button
                  key={option.value}
                  className="px-4 py-2 text-left text-xs w-full"
                  onClick={() => {
                    handleSelect(option.value);
                    closeDropdown();
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-gray-400">
                No matches found
              </div>
            )}
          </div>
        </div>
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 h-10 rounded-md border border-gray-400 w-full">
        <div className="flex flex-col flex-1 items-start transition-all duration-500 justify-center">
          {/* <small
            className={`text-white ${value ? "opacity-100" : "opacity-0"}`}
          >
            {label}
          </small> */}
          <small className={value ? "text-white" : "text-gray-400"}>
            {value ? `${selected ? selected.label : label}` : label}{" "}
          </small>
        </div>

        <IoIosArrowDown
          className={`transition-all ${open ? "rotate-180" : ""}`}
        />
      </div>
    </DropdownContainer>
  );
};

export default SecondaryDropdown;
