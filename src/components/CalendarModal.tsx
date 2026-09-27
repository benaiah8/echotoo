// src/components/CalendarModal.tsx
import React from "react";
import CreateScheduleCalendarBody from "./create/CreateScheduleCalendarBody";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./ui/FrostedCenterModal";

interface Props {
  show: boolean;
  selectedDates: Date[];
  onSelectDates: (dates: Date[]) => void;
  /** Kept for parent compatibility; recurrence is edited outside this modal. */
  isRecurring: boolean;
  recurrenceDays: string[];
  onToggleRecurrenceDay: (day: string) => void;
  onClose: () => void;
}

export default function CalendarModal({
  show,
  selectedDates,
  onSelectDates,
  onClose,
}: Props) {
  const panelStyle: React.CSSProperties = {
    ...frostedModalPanelStyle,
    maxWidth: "min(360px, calc(100vw - 3rem))",
  };

  return (
    <FrostedCenterModal
      open={show}
      onBackdropClick={onClose}
      zTier="dialog"
      aria-label="Choose dates"
      containerClassName="px-6 sm:px-8"
    >
      <div
        className="pointer-events-auto flex w-full flex-col gap-2.5"
        style={{ maxWidth: "min(360px, calc(100vw - 3rem))" }}
      >
        <div
          className={`${frostedModalPanelClassName} flex max-h-[min(76vh,580px)] flex-col gap-3 border-2 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.14)] sm:p-5 dark:border-[color-mix(in_oklab,var(--border)_52%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_40px_rgba(0,0,0,0.35)]`}
          style={panelStyle}
        >
          <CreateScheduleCalendarBody
            selectedDates={selectedDates}
            onSelectDates={onSelectDates}
            resetToken={show}
          />
        </div>

        <div className="flex w-full justify-center px-1 pt-0.5">
          <button
            type="button"
            className="h-8 min-w-[7rem] rounded-full bg-[var(--brand)] px-6 text-[12px] font-semibold leading-none text-[var(--brand-ink)] shadow-[0_1px_0_rgba(0,0,0,0.06)] transition hover:opacity-95 active:scale-[0.99] dark:shadow-[0_1px_0_rgba(255,255,255,0.08)]"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
