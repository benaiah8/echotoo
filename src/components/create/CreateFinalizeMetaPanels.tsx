/**
 * Real create-flow controls for Finalize metadata tabs (same UI as CreateCategoryPage).
 */
import { useMemo } from "react";
import { PiCalendarBlank } from "react-icons/pi";
import PrimaryToggle from "../input/PrimaryToggle";
import VisibilityPillToggle from "../input/VisibilityPillToggle";
import HorizontalNumberWheel from "../input/HorizontalNumberWheel";
import { CREATE_FLOW_WEEKDAYS } from "../../lib/createFlowScheduleConstants";
import {
  type CreateFlowDateSummaryGroup,
  formatFinalizeRecurrenceSummaryLine,
  formatFinalizeSelectedDatesSummaryLine,
} from "../../lib/createFlowDateSummary";

type Visibility = "public" | "friends";

export function FinalizeDateSchedulePanel({
  dateSummary,
  selectedDates,
  isRecurring,
  setIsRecurring,
  recurrenceDays,
  toggleDay,
  onOpenCalendar,
}: {
  dateSummary: CreateFlowDateSummaryGroup[];
  selectedDates: Date[];
  isRecurring: boolean;
  setIsRecurring: (v: boolean) => void;
  recurrenceDays: string[];
  toggleDay: (code: string) => void;
  onOpenCalendar: () => void;
}) {
  const selectedDatesSummaryLine = useMemo(
    () => formatFinalizeSelectedDatesSummaryLine(dateSummary, selectedDates),
    [dateSummary, selectedDates]
  );

  const recurrenceSummaryLine = useMemo(
    () => formatFinalizeRecurrenceSummaryLine(isRecurring, recurrenceDays),
    [isRecurring, recurrenceDays]
  );

  const hasSummaryContent =
    Boolean(selectedDatesSummaryLine) || Boolean(recurrenceSummaryLine);

  return (
    <div className="flex flex-col gap-3">
      {hasSummaryContent ? (
        <div className="relative z-[1] rounded-xl border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {selectedDatesSummaryLine ? (
            <p className="text-[11px] leading-snug text-[var(--text)]/82 dark:text-white/88">
              {selectedDatesSummaryLine}
            </p>
          ) : null}
          {recurrenceSummaryLine ? (
            <p
              className={
                selectedDatesSummaryLine
                  ? "mt-1 text-[11px] leading-snug text-[var(--text)]/68 dark:text-white/72"
                  : "text-[11px] leading-snug text-[var(--text)]/68 dark:text-white/72"
              }
            >
              {recurrenceSummaryLine}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="relative z-0 flex flex-row items-center gap-2">
        <button
          type="button"
          onClick={onOpenCalendar}
          className="flex min-h-[2.5rem] min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[color-mix(in_oklab,var(--surface)_16%,transparent)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--text)]/90 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_0_14px_rgba(255,255,255,0.07)] transition hover:border-[var(--border)]/70 hover:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.1),0_0_18px_rgba(255,255,255,0.09)] active:scale-[0.99] dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] dark:text-white/92 dark:shadow-[0_3px_12px_rgba(0,0,0,0.45)] dark:hover:border-white dark:hover:bg-[color-mix(in_oklab,var(--surface)_22%,transparent)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--surface)_22%,transparent)] text-[var(--brand)]">
            <PiCalendarBlank className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {selectedDates.length ? "Edit in calendar" : "Choose dates"}
          </span>
        </button>

        <div
          className={[
            "flex min-h-[2.5rem] shrink-0 items-center gap-2 rounded-full px-3 py-2 transition-colors",
            isRecurring
              ? "border border-[color-mix(in_oklab,var(--brand)_48%,var(--border))] bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] shadow-[0_2px_10px_rgba(0,0,0,0.1),0_0_12px_color-mix(in_oklab,var(--brand)_14%,transparent)] dark:border-[color-mix(in_oklab,var(--brand)_42%,transparent)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.4),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]"
              : "border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_16%,transparent)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
          role="group"
          aria-label="Repeat weekly"
        >
          <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-[var(--text)]/88 dark:text-white/90">
            Repeat weekly
          </span>
          <PrimaryToggle
            value={isRecurring}
            onChange={setIsRecurring}
            compact
          />
        </div>
      </div>

      {isRecurring ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {CREATE_FLOW_WEEKDAYS.map((d) => (
            <button
              key={d.code}
              type="button"
              onClick={() => toggleDay(d.code)}
              className={`text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)]/55 dark:border-white/35
                    ${
                      recurrenceDays.includes(d.code)
                        ? "bg-[var(--brand)] text-[var(--brand-ink)] border-[color-mix(in_oklab,var(--brand)_48%,var(--border))] dark:border-[color-mix(in_oklab,var(--brand)_42%,transparent)]"
                        : "bg-transparent text-[var(--text)]/75 dark:text-white/82 dark:hover:bg-white/8"
                    }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FinalizeVisibilityPanel({
  visibility,
  onVisibilityChange,
}: {
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-[var(--text)]/88 dark:text-white/90">
        Who can see this
      </p>
      <VisibilityPillToggle
        value={visibility}
        onChange={onVisibilityChange}
        tone="default"
      />
    </div>
  );
}

export function FinalizeRsvpPanel({
  rsvpEnabled,
  setRsvpEnabled,
  rsvpCapacity,
  setRsvpCapacity,
}: {
  rsvpEnabled: boolean;
  setRsvpEnabled: (v: boolean) => void;
  rsvpCapacity: number;
  setRsvpCapacity: (v: number) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-2 transition-opacity duration-200 ${
        !rsvpEnabled ? "opacity-80 dark:opacity-90" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-[var(--text)]/88 dark:text-white/90">
          RSVP capacity
        </p>
        <button
          type="button"
          className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-[3px] transition-colors ${
            rsvpEnabled ? "bg-[var(--brand)]" : "bg-gray-300 dark:bg-gray-600"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setRsvpEnabled(!rsvpEnabled);
          }}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
              rsvpEnabled ? "translate-x-[14px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {rsvpEnabled && (
        <HorizontalNumberWheel
          value={rsvpCapacity}
          onChange={setRsvpCapacity}
          max={99}
        />
      )}
    </div>
  );
}
