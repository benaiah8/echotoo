// src/components/CalendarModal.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DayPicker } from "react-day-picker";
import { RRule } from "rrule";
import "react-day-picker/dist/style.css";

const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [firstSelectedDate, setFirstSelectedDate] = useState<Date | null>(null);

  // --- Gesture tunables
  const DOUBLE_TAP_MS = 350; // within this window, treat as double tap
  const lastTapRef = useRef<number>(0);

  // ——— utils
  const normalize = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a?: Date | null, b?: Date | null) =>
    !!a && !!b && a.getTime() === b.getTime();

  const sortDays = (arr: Date[]) =>
    [...arr].map(normalize).sort((a, b) => a.getTime() - b.getTime());

  const daysBetween = (a: Date, b: Date) => {
    const start = normalize(a);
    const end = normalize(b);
    const step = start.getTime() <= end.getTime() ? 1 : -1;
    const out: Date[] = [];
    const cur = new Date(start);
    while ((step === 1 && cur <= end) || (step === -1 && cur >= end)) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + step);
    }
    return out;
  };

  // Ensure we always show "now" when the modal opens
  useEffect(() => {
    if (show) {
      const now = new Date();
      setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setFirstSelectedDate(null); // Reset anchor date when modal opens
    }
  }, [show]);

  // ——— Selection logic
  const setIndividual = (day: Date) => {
    // toggle behavior for individual days
    const key = normalize(day).getTime();
    const map = new Map(selectedDates.map((d) => [normalize(d).getTime(), d]));
    const wasRemoving = map.has(key);

    if (wasRemoving) {
      map.delete(key);
    } else {
      map.set(key, normalize(day));
    }

    const newDates = sortDays(Array.from(map.values()));
    onSelectDates(newDates);

    // Set first selected date for range creation (only when adding the very first date)
    if (!wasRemoving && selectedDates.length === 0 && newDates.length === 1) {
      setFirstSelectedDate(newDates[0]);
    }

    // Reset first selected date if all dates are cleared
    if (newDates.length === 0) {
      setFirstSelectedDate(null);
    }
  };

  const setRangeFrom = (a: Date, b: Date) => {
    onSelectDates(sortDays(daysBetween(a, b)));
  };

  // Clear all selected dates - memoized to ensure stability
  const clearAllDates = useCallback(() => {
    // Force a fresh empty array to ensure proper clearing
    const emptyArray: Date[] = [];
    onSelectDates(emptyArray);
    setFirstSelectedDate(null);
  }, [onSelectDates]);

  // Handle day selection with improved logic
  const handleDayClick = (day: Date) => {
    const now = Date.now();
    const isDouble = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    const normalizedDay = normalize(day);
    const isCurrentlySelected = selectedDates.some((d) =>
      sameDay(d, normalizedDay)
    );

    if (isDouble) {
      // Double tap: create range from firstSelectedDate to current day
      if (firstSelectedDate && !sameDay(firstSelectedDate, normalizedDay)) {
        setRangeFrom(firstSelectedDate, normalizedDay);
        setFirstSelectedDate(normalizedDay); // Set new anchor for potential further ranges
      } else {
        setIndividual(normalizedDay);
        setFirstSelectedDate(normalizedDay);
      }
    } else {
      // Single tap logic
      if (isCurrentlySelected && selectedDates.length > 1) {
        // If clicking on a selected date in a range, remove the range and keep only that date
        onSelectDates([normalizedDay]);
        setFirstSelectedDate(normalizedDay);
      } else if (isCurrentlySelected) {
        // If clicking on the only selected date, clear it
        onSelectDates([]);
        setFirstSelectedDate(null);
      } else {
        // Adding new date
        if (firstSelectedDate && !sameDay(firstSelectedDate, normalizedDay)) {
          // Create range if we have a first date
          setRangeFrom(firstSelectedDate, normalizedDay);
          setFirstSelectedDate(normalizedDay);
        } else {
          // Just add individual date
          setIndividual(normalizedDay);
          if (!firstSelectedDate) {
            setFirstSelectedDate(normalizedDay);
          }
        }
      }
    }
  };

  // ——— Modifiers for range styling (rect bar + strong end caps)
  const dayKey = (d: Date) => normalize(d).getTime();
  const selSet = useMemo(
    () => new Set(selectedDates.map(dayKey)),
    [selectedDates]
  );

  const isSelected = (d: Date) => selSet.has(dayKey(d));
  const prevSelected = (d: Date) => {
    const p = new Date(d);
    p.setDate(p.getDate() - 1);
    return isSelected(p);
  };
  const nextSelected = (d: Date) => {
    const n = new Date(d);
    n.setDate(n.getDate() + 1);
    return isSelected(n);
  };

  const modifiers = {
    rangeStart: (d: Date) =>
      isSelected(d) && !prevSelected(d) && nextSelected(d),
    rangeEnd: (d: Date) => isSelected(d) && prevSelected(d) && !nextSelected(d),
    rangeMiddle: (d: Date) =>
      isSelected(d) && prevSelected(d) && nextSelected(d),
    singleOnly: (d: Date) =>
      isSelected(d) && !prevSelected(d) && !nextSelected(d),
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface)]/70"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] rounded-lg w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pt-2">
          <DayPicker
            mode="multiple"
            selected={selectedDates}
            onDayClick={handleDayClick}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            className="rdp-theme w-full"
            modifiers={modifiers}
            modifiersClassNames={{
              rangeStart: "range-start",
              rangeEnd: "range-end",
              rangeMiddle: "range-middle",
              singleOnly: "single-only",
            }}
            styles={{
              head_cell: {
                color: "var(--text)",
                fontWeight: 600,
                backgroundColor: "transparent",
              },
              cell: { color: "var(--text)", backgroundColor: "transparent" },
              day: { color: "var(--text)", backgroundColor: "transparent" },
              day_selected: {
                backgroundColor: "var(--brand)",
                color: "var(--brand-ink)",
                borderRadius: "4px",
                border: "none",
                boxShadow: "none",
                outline: "none",
              },
              caption: {
                color: "var(--text)",
                fontWeight: 600,
                backgroundColor: "transparent",
              },
              nav_button: {
                color: "var(--text)",
                backgroundColor: "transparent",
              },
              table: { backgroundColor: "transparent" },
              months: { backgroundColor: "transparent" },
              month: { backgroundColor: "transparent" },
            }}
          />
        </div>

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
                      ? "bg-primary text-black"
                      : "bg-[var(--surface-2)] text-[var(--text)]"
                  }`}
                >
                  {weekdayNames[i]}
                </button>
              );
            })}
          </div>
        )}

        {/* Clear and Done buttons */}
        <div className="px-2 pb-2 mt-2 flex items-center gap-2">
          <button
            type="button"
            className={`w-10 h-10 rounded font-semibold transition-opacity ${
              selectedDates.length > 0
                ? "bg-[var(--surface-2)] text-[var(--text)] hover:opacity-90 cursor-pointer"
                : "bg-[var(--surface)] text-[var(--muted)] cursor-not-allowed opacity-50"
            } border border-[var(--border)] flex items-center justify-center`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearAllDates();
            }}
          >
            ✕
          </button>

          <button
            className="flex-1 bg-[var(--text)] text-[var(--bg)] border border-[var(--border)] py-2 rounded font-semibold hover:opacity-90 transition-opacity"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
