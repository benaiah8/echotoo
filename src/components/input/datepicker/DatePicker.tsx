import React, { useState, useEffect } from "react";
import moment, { Moment } from "moment";
import DatePickerHeader from "./DatePickerHeader";

export type DisabledDays =
  | string[]
  | ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];

interface DatePickerProps {
  range?: boolean;
  dualMonth?: boolean;
  disabledDates?: DisabledDays;
  date?: string;
  start?: string;
  end?: string;
  minDate?: string; // 🔹 Optional minimum date
  maxDate?: string;
  onSelectionDone?: (selection: {
    date?: string;
    start?: string;
    end?: string;
  }) => void;
}

const weekdays = [
  { label: "Mo", value: "Mon" },
  { label: "Tu", value: "Tue" },
  { label: "We", value: "Wed" },
  { label: "Th", value: "Thu" },
  { label: "Fr", value: "Fri" },
  { label: "Sa", value: "Sat" },
  { label: "Su", value: "Sun" },
];

const DatePicker: React.FC<DatePickerProps> = ({
  range = false,
  dualMonth = false,
  disabledDates = [],
  date: externalDate,
  start: externalStart,
  end: externalEnd,
  minDate,
  maxDate,
  onSelectionDone,
}) => {
  const [currentMonth, setCurrentMonth] = useState<Moment>(
    moment().startOf("month")
  );
  const nextMonth = moment(currentMonth).add(1, "month");

  const [selectedDate, setSelectedDate] = useState<string | null>(
    externalDate || null
  );
  const [rangeStart, setRangeStart] = useState<string | null>(
    externalStart || null
  );
  const [rangeEnd, setRangeEnd] = useState<string | null>(externalEnd || null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(externalDate || null);
  }, [externalDate]);

  useEffect(() => {
    setRangeStart(externalStart || null);
    setRangeEnd(externalEnd || null);
  }, [externalStart, externalEnd]);

  const getDaysInMonth = (month: Moment) =>
    Array.from({ length: month.daysInMonth() }, (_, i) => i + 1);

  const formatDate = (date: Moment) => date.format("YYYY-MM-DD");

  const handleDateSelect = (day: number, month: Moment) => {
    const selected = formatDate(moment(month).date(day));

    if (isDisabled(selected)) return;

    if (!range) {
      setSelectedDate(selected);
      onSelectionDone?.({ date: selected });
    } else {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(selected);
        setRangeEnd(null);
      } else if (moment(selected).isSameOrBefore(moment(rangeStart))) {
        setRangeStart(selected);
        setRangeEnd(null);
      } else {
        setRangeEnd(selected);
        onSelectionDone?.({ start: rangeStart, end: selected });
      }
    }
  };

  // useEffect(() => {
  //   if (range && rangeStart && rangeEnd) {
  //     onSelectionDone?.({ start: rangeStart, end: rangeEnd });
  //   }
  // }, [rangeStart, rangeEnd]);

  const isDisabled = (date: string) => {
    if (!disabledDates && !minDate && !maxDate) return false;

    const dateMoment = moment(date, "YYYY-MM-DD");

    return (
      (minDate && dateMoment.isBefore(moment(minDate, "YYYY-MM-DD"))) ||
      (maxDate && dateMoment.isAfter(moment(maxDate, "YYYY-MM-DD"))) ||
      disabledDates.some(
        (d) =>
          moment(d, "YYYY-MM-DD", true).isValid() &&
          moment(d).isSame(date, "day")
      ) ||
      disabledDates.some(
        (day) =>
          typeof day === "string" &&
          weekdays.some(
            (w) => w.value === day && moment(date).format("ddd") === day
          )
      )
    );
  };

  const renderMonth = (month: Moment, hideFirstPreviousButton?: boolean) => {
    const startOfMonth = month.clone().startOf("month");
    const firstDayOfWeek = startOfMonth.isoWeekday();

    return (
      <div>
        <DatePickerHeader
          minDate={minDate}
          maxDate={maxDate}
          setCurrentMonth={setCurrentMonth}
          month={month}
          hide={
            !dualMonth ? null : hideFirstPreviousButton ? "first" : "second"
          }
        />

        <div className="p-2 flex flex-col">
          <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium w-[320px]">
            {weekdays.map(({ label }) => (
              <span
                key={label}
                className="!text-xs w-9 items-center justify-center flex"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 mt-2 w-[320px]">
            {Array.from({ length: firstDayOfWeek - 1 }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="w-9 h-9 flex-shrink-0 text-xs"
              ></div>
            ))}

            {getDaysInMonth(month).map((day) => {
              const date = formatDate(moment(month).date(day));
              const isDisabledDate = isDisabled(date);
              const isSelected = !range && selectedDate === date;
              const isToday = formatDate(moment()) === date;

              const isStart = rangeStart === date;
              const isEnd = rangeEnd === date;
              const isInRange =
                rangeStart &&
                rangeEnd &&
                moment(date).isAfter(moment(rangeStart)) &&
                moment(date).isBefore(moment(rangeEnd));

              const isHoveredInRange =
                rangeStart &&
                !rangeEnd &&
                hoveredDate &&
                moment(hoveredDate).isAfter(moment(rangeStart)) &&
                moment(date).isAfter(moment(rangeStart)) &&
                moment(date).isBefore(moment(hoveredDate));

              return (
                <button
                  key={day}
                  className={`w-9 h-9 flex items-center justify-center rounded-sm flex-shrink-0 text-xs cursor-pointer transition-all
                    ${
                      isDisabledDate
                        ? "!bg-outline text-pText hover:!bg-outline !cursor-not-allowed"
                        : ""
                    }
                    ${isSelected ? "bg-white text-black" : "text-white"}
                    ${isToday ? "border border-white" : ""}
                    ${isStart ? "bg-white " : ""}
                    ${isEnd ? "bg-white " : ""}
                    ${isInRange ? "bg-primaryLight" : ""}
                    ${isHoveredInRange ? "bg-primaryLight" : ""}
                    ${
                      !isHoveredInRange &&
                      !isInRange &&
                      !isEnd &&
                      !isStart &&
                      !isToday &&
                      !isSelected
                        ? "hover:bg-primaryLight"
                        : ""
                    }
                    `}
                  onClick={() => handleDateSelect(day, month)}
                  onMouseEnter={() => !isDisabledDate && setHoveredDate(date)}
                  onMouseLeave={() => !isDisabledDate && setHoveredDate(null)}
                  disabled={isDisabledDate}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-background shadow-sm rounded-lg flex flex-col lg:flex-row gap-2 text-white">
      {renderMonth(currentMonth)}
      {dualMonth && renderMonth(nextMonth, true)}
    </div>
  );
};

export default DatePicker;
