import { useState, forwardRef } from "react";
import { MdCalendarMonth, MdErrorOutline } from "react-icons/md";
import DatePicker from "./DatePicker";
import DropdownContainer from "../dropdown/DropdownContainer";
import moment from "moment";

interface PrimaryDateRangePickerProps {
  startLabel: string;
  endLabel: string;
  className?: string;
  error?: boolean;
  dualMonth?: boolean;
  startDate?: string;
  endDate?: string;
  minDate?: string;
  maxDate?: string;
  onDateChange?: (range: { start: string; end: string }) => void;
}

const PrimaryDateRangePicker = forwardRef<
  HTMLInputElement,
  PrimaryDateRangePickerProps
>(
  (
    {
      startLabel,
      endLabel,
      className = "",
      error = false,
      startDate,
      endDate,
      dualMonth = true,
      minDate = moment().format("YYYY-MM-DD"),
      maxDate,
      onDateChange,
    },
    ref
  ) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleDateSelect = (selectedStart: string, selectedEnd: string) => {
      onDateChange && onDateChange({ start: selectedStart, end: selectedEnd });
      if (isDropdownOpen) setIsDropdownOpen(false);
      if (ref) {
      }
    };

    return (
      <DropdownContainer
        className={`w-full ${className}`}
        maxHeight=""
        dropdown={(closeDropdown) => (
          <DatePicker
            range={true}
            dualMonth={dualMonth}
            start={startDate || undefined}
            end={endDate || undefined}
            minDate={minDate}
            maxDate={maxDate}
            onSelectionDone={({ start, end }) => {
              handleDateSelect(start || "", end || "");
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
          <div className="w-full flex items-center justify-between gap-2 h-full">
            <h5 className="text-pText ">
              <MdCalendarMonth />
            </h5>

            <div className="flex flex-col flex-1 items-start transition-all duration-500 justify-center">
              <small
                className={`text-pText ${
                  startDate || endDate ? "opacity-100" : "opacity-0"
                }`}
              >
                {startLabel}
              </small>
              <span className={startDate ? "text-black" : "text-pText"}>
                {startDate
                  ? `${moment(startDate).format("DD/MM/YYYY")}`
                  : startLabel}{" "}
                {startDate ? (
                  <small className="text-pText">
                    ({moment(startDate).format("ddd")})
                  </small>
                ) : (
                  <></>
                )}
              </span>
            </div>
            <div className="flex flex-col flex-1 items-start transition-all duration-500 justify-center border-l border-outline pl-3 h-full">
              <small
                className={`text-pText ${
                  startDate || endDate ? "opacity-100" : "opacity-0"
                }`}
              >
                {endLabel}
              </small>
              <span className={endDate ? "text-black" : "text-pText"}>
                {endDate ? `${moment(endDate).format("DD/MM/YYYY")}` : endLabel}{" "}
                {endDate ? (
                  <small className="text-pText">
                    ({moment(endDate).format("ddd")})
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

export default PrimaryDateRangePicker;
