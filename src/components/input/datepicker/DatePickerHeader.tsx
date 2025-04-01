import React, { useState, useRef, useEffect } from "react";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
import moment, { Moment } from "moment";

interface DatePickerHeaderProps {
  setCurrentMonth: React.Dispatch<React.SetStateAction<Moment>>;
  month: Moment;
  minDate?: string | Moment;
  maxDate?: string | Moment;
  hide?: "first" | "second" | null;
}

const DatePickerHeader: React.FC<DatePickerHeaderProps> = ({
  setCurrentMonth,
  month,
  minDate = moment().subtract(100, "years"),
  maxDate = moment().add(20, "years"),
  hide,
}) => {
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedYearRef = useRef<HTMLDivElement | null>(null);

  const parsedMinDate = moment.isMoment(minDate)
    ? minDate
    : moment(minDate, "YYYY-MM-DD");
  const parsedMaxDate = moment.isMoment(maxDate)
    ? maxDate
    : moment(maxDate, "YYYY-MM-DD");

  const minYear = parsedMinDate.year();
  const maxYear = parsedMaxDate.year();
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i
  );

  const handleYearSelect = (year: number) => {
    if (year >= minYear && year <= maxYear) {
      setCurrentMonth((prev) => prev.clone().year(year));
      setIsYearPickerOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsYearPickerOpen(false);
      }
    };

    if (isYearPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isYearPickerOpen]);

  useEffect(() => {
    if (isYearPickerOpen && selectedYearRef.current) {
      selectedYearRef.current.scrollIntoView({
        block: "center",
      });
    }
  }, [isYearPickerOpen]);

  return (
    <div className="flex items-center justify-between bg-black px-4 py-2 text-sm relative">
      {!hide || hide !== "first" ? (
        <button
          onClick={() =>
            setCurrentMonth((prev) => {
              const newMonth = prev.clone().subtract(1, "month");
              return newMonth.isBefore(minDate, "month") ? prev : newMonth;
            })
          }
          disabled={month.isSameOrBefore(minDate, "month")}
          className={`${
            month.isSameOrBefore(minDate, "month")
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          <IoIosArrowBack />
        </button>
      ) : (
        <div></div>
      )}

      <div className="relative" ref={dropdownRef}>
        <div
          className="text-center font-semibold cursor-pointer"
          onClick={() => setIsYearPickerOpen(!isYearPickerOpen)}
        >
          {month.format("MMMM YYYY")}
        </div>

        {isYearPickerOpen && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-white shadow-lg scroll-hide rounded-md max-h-40 overflow-y-auto w-24 z-10">
            {years.map((year) => (
              <div
                key={year}
                ref={year === month.year() ? selectedYearRef : null}
                onClick={() => handleYearSelect(year)}
                className={`px-4 py-2 text-center cursor-pointer transition-all ${
                  year === month.year()
                    ? "bg-primary text-white"
                    : "hover:bg-primaryLight"
                }`}
              >
                {year}
              </div>
            ))}
          </div>
        )}
      </div>

      {!hide || hide !== "second" ? (
        <button
          onClick={() =>
            setCurrentMonth((prev) => {
              const newMonth = prev.clone().add(1, "month");
              return newMonth.isAfter(maxDate, "month") ? prev : newMonth;
            })
          }
          disabled={month.isSameOrAfter(maxDate, "month")}
          className={`${
            month.isSameOrAfter(maxDate, "month")
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          <IoIosArrowForward />
        </button>
      ) : (
        <div></div>
      )}
    </div>
  );
};

export default DatePickerHeader;
