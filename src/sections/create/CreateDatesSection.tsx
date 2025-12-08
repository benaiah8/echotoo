import { useState } from "react";
import CalendarModal from "../../components/CalendarModal";
import PrimaryToggle from "../../components/input/PrimaryToggle";

type Props = {
  selectedDates: Date[];
  setSelectedDates: (dates: Date[]) => void;
  isRecurring: boolean;
  setIsRecurring: (v: boolean) => void;
  recurrenceDays: string[];
  setRecurrenceDays: (days: string[]) => void;
};

const WEEKDAYS: { code: string; label: string }[] = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

export default function CreateDatesSection({
  selectedDates,
  setSelectedDates,
  isRecurring,
  setIsRecurring,
  recurrenceDays,
  setRecurrenceDays,
}: Props) {
  const [show, setShow] = useState(false);

  const summary =
    selectedDates.length > 0
      ? selectedDates.map((d) => d.toLocaleDateString()).join(", ")
      : "Select date(s)";

  const toggleDay = (code: string) =>
    setRecurrenceDays(
      recurrenceDays.includes(code)
        ? recurrenceDays.filter((d) => d !== code)
        : [...recurrenceDays, code]
    );

  return (
    <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
      <h3 className="text-sm font-medium text-[var(--text)]/85">
        Dates & repeat
      </h3>
      <div className="border-t border-[var(--border)] mt-2 mb-3" />

      <button
        type="button"
        onClick={() => setShow(true)}
        className="w-full text-left px-3 py-2 rounded-md border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
      >
        {summary}
      </button>

      <div className="flex items-center gap-3 mt-3">
        <span className="text-xs text-[var(--text)]/80">Repeat weekly?</span>
        <PrimaryToggle value={isRecurring} onChange={setIsRecurring} />
      </div>

      {/* quick weekday chips when repeat is ON */}
      {isRecurring && (
        <div className="flex flex-wrap gap-2 mt-3">
          {WEEKDAYS.map((d) => (
            <button
              key={d.code}
              type="button"
              onClick={() => toggleDay(d.code)}
              className={`text-xs px-2 py-1 rounded-full border border-[var(--border)]
                ${
                  recurrenceDays.includes(d.code)
                    ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                    : "bg-transparent text-[var(--text)]/85"
                }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Modal */}
      <CalendarModal
        show={show}
        selectedDates={selectedDates}
        onSelectDates={(ds) => setSelectedDates(ds || [])}
        isRecurring={isRecurring}
        recurrenceDays={recurrenceDays}
        onToggleRecurrenceDay={toggleDay}
        onClose={() => setShow(false)}
      />
    </section>
  );
}
