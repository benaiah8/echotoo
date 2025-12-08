import { useState, forwardRef } from "react";
import { MdErrorOutline } from "react-icons/md";
import DatePicker from "./DatePicker";
import DropdownContainer from "../dropdown/DropdownContainer";
import moment from "moment";

interface PrimaryDatePickerProps {
  label: string;
  className?: string;
  error?: boolean;
  left?: boolean;
  date?: string;
  minDate?: string;
  maxDate?: string;
  onDateChange?: (date?: string) => void;
}

const PrimaryDatePicker = forwardRef<HTMLInputElement, PrimaryDatePickerProps>(
  (
    {
      label,
      className = "",
      error = false,
      date,
      onDateChange,
      minDate = moment().format("YYYY-MM-DD"),
      maxDate,
      left = true,
    },
    ref
  ) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleDateSelect = (selectedDate: string) => {
      onDateChange && onDateChange(selectedDate);
      if (isDropdownOpen) setIsDropdownOpen(false);
      if (ref) {
      }
    };

    return (
      <DropdownContainer
        className={`w-full ${className}`}
        maxHeight=""
        left={left}
        dropdown={(closeDropdown) => (
          <DatePicker
            date={date || undefined}
            minDate={minDate}
            maxDate={maxDate}
            onSelectionDone={({ date: selectedDate }) => {
              handleDateSelect(selectedDate || "");
              closeDropdown();
            }}
          />
        )}
        parentToggle={setIsDropdownOpen}
      >
        <div
          className={`flex flex-col justify-center border-b transition-all cursor-pointer h-12 ${
            error ? "border-tertiary" : "border-gray-700"
          }`}
        >
          <div className="w-full flex items-center gap-2 text-[var(--text)] px-1">
            <div className="flex-1">
              <small
                className={`block text-xs text-pText transition-opacity duration-300 ${
                  date ? "opacity-100" : "opacity-0"
                }`}
              >
                {label}
              </small>
              <span className={date ? "text-[var(--text)]" : "text-pText"}>
                {date ? `${moment(date).format("DD/MM/YYYY")}` : label}
                {date && (
                  <small className="ml-1 text-sm text-pText">
                    ({moment(date).format("ddd")})
                  </small>
                )}
              </span>
            </div>

            {error && <MdErrorOutline className="text-tertiary text-2xl" />}
          </div>
        </div>
      </DropdownContainer>
    );
  }
);

export default PrimaryDatePicker;
