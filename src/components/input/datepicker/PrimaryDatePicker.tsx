import { useState, forwardRef } from "react";
import { MdCalendarMonth, MdErrorOutline } from "react-icons/md";
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
          className={`flex flex-col px-2 h-14 items-center justify-center rounded-md border transition-all cursor-pointer ${
            error ? "border-tertiary" : "border-outline"
          }`}
        >
          <div className="w-full flex items-center justify-between gap-2">
            <h5 className="text-pText ">
              <MdCalendarMonth />
            </h5>

            <div className="flex flex-col flex-1 items-start transition-all duration-500 justify-center">
              {/* {selectedDate && ( */}
              <small
                className={`text-pText ${date ? "opacity-100" : "opacity-0"}`}
              >
                {label}
              </small>
              <span className={date ? "text-black" : "text-pText"}>
                {date ? `${moment(date).format("DD/MM/YYYY")}` : label}{" "}
                {date ? (
                  <small className="text-pText">
                    ({moment(date).format("ddd")})
                  </small>
                ) : (
                  <></>
                )}
              </span>
            </div>

            {error && (
              <span className="text-tertiary !text-2xl">
                <MdErrorOutline />
              </span>
            )}
          </div>
        </div>
      </DropdownContainer>
    );
  }
);

export default PrimaryDatePicker;
