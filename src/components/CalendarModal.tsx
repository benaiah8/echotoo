import React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { RRule } from "rrule";

const weekdays = ["MO","TU","WE","TH","FR","SA","SU"];
const weekdayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

interface Props {
  show: boolean;
  selectedDates: Date[];
  onSelectDates: (dates: Date[]) => void;
  isRecurring: boolean;
  recurrenceDays: string[];
  onToggleRecurrenceDay: (day: string) => void;
  onClose: () => void;
}

export default function CalendarModal({
  show,
  selectedDates,
  onSelectDates,
  isRecurring,
  recurrenceDays,
  onToggleRecurrenceDay,
  onClose,
}: Props) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Calendar centered, no blank right space */}
        <div className="flex justify-center">
          <DayPicker
  mode="multiple"
  selected={selectedDates}
  onSelect={onSelectDates}
  className="rdp-theme w-full"
/>

        </div>

        {/* Recurring days */}
        {isRecurring && (
          <div className="flex flex-wrap gap-2 mt-4">
            {weekdays.map((d, i) => {
              const sel = recurrenceDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => onToggleRecurrenceDay(d)}
                  className={`text-xs font-medium px-2 py-1 rounded ${
                    sel
                      ? "bg-primary200 text-black"
                      : "bg-background200 text-white"
                  }`}
                >
                  {weekdayNames[i]}
                </button>
              );
            })}
          </div>
        )}

        {/* Done button full width */}
        <button
          className="mt-4 w-full bg-primary200 text-black py-2 rounded"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
