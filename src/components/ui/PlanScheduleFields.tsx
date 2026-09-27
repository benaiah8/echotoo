/**
 * Shared date/time presentation for social-plan flows (Open Plan, Group Up, future P2P).
 * Business rules (required vs optional, submit gating) live in parent components.
 */

import { useMemo, useState } from "react";
import { PiCaretRight, PiCaretUp } from "react-icons/pi";
import CreateScheduleCalendarBody from "../create/CreateScheduleCalendarBody";
import CreateFinalizeTimeWheel from "../create/CreateFinalizeTimeWheel";
import type { CreateFlowStartTime } from "../../lib/createFlowStartTime";
import { formatPlanScheduleReadableLabel } from "../../lib/planScheduleReadableLabel";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export function formatPlanScheduleInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type PlanScheduleFieldsProps = {
  selectedDates: Date[];
  onSelectDates: (dates: Date[]) => void;
  startTime: CreateFlowStartTime | null;
  onStartTimeChange: (time: CreateFlowStartTime) => void;
  active?: boolean;
  calendarResetToken?: number;
  /** When false, calendar keeps last day only (Open Plan / Group Up single-date mode). */
  singleDateMode?: boolean;
  dateRequired?: boolean;
  timeRequired?: boolean;
  allowClear?: boolean;
  onClear?: () => void;
  showTimeWheel?: boolean;
  pastError?: string | null;
  disabled?: boolean;
  busy?: boolean;
  dateLabel?: string;
  timeLabel?: string;
  /** Collapsible summary row (Group Up). Open Plan should leave false. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
  summaryPlaceholder?: string;
  onExpandedChange?: (expanded: boolean) => void;
};

const SUMMARY_ROW_CLASS =
  "flex w-full min-w-0 items-center gap-2 rounded-2xl border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--glass-bg)_88%,transparent)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[var(--glass-blur)] transition-opacity hover:opacity-95 active:scale-[0.99] app-dark:border-white/18";

export default function PlanScheduleFields({
  selectedDates,
  onSelectDates,
  startTime,
  onStartTimeChange,
  active = true,
  calendarResetToken = 0,
  singleDateMode = true,
  dateRequired = false,
  timeRequired = false,
  allowClear = false,
  onClear,
  showTimeWheel = true,
  pastError = null,
  disabled = false,
  busy = false,
  dateLabel = peopleUiCopy.openPlanDateLabel,
  timeLabel = peopleUiCopy.openPlanTimeLabel,
  collapsible = false,
  defaultExpanded = false,
  summaryPlaceholder = peopleUiCopy.planScheduleAddDateTime,
  onExpandedChange,
}: PlanScheduleFieldsProps) {
  const interactionLocked = disabled || busy;
  const [expanded, setExpanded] = useState(defaultExpanded);

  const setExpandedState = (next: boolean) => {
    setExpanded(next);
    onExpandedChange?.(next);
  };

  const handleSelectDates = (dates: Date[]) => {
    if (!singleDateMode) {
      onSelectDates(dates);
      return;
    }
    const last = dates[dates.length - 1];
    if (!last) {
      onSelectDates([]);
      return;
    }
    onSelectDates([
      new Date(last.getFullYear(), last.getMonth(), last.getDate()),
    ]);
  };

  const clearEnabled = allowClear && selectedDates.length > 0 && !interactionLocked;

  const summaryText = useMemo(() => {
    if (selectedDates.length === 0) return null;
    return formatPlanScheduleReadableLabel({
      selectedDates,
      startTime,
    });
  }, [selectedDates, startTime]);

  const optionalSuffix = dateRequired
    ? null
    : peopleUiCopy.planScheduleOptional;

  const calendarPickMode = singleDateMode ? "single" : "multi";

  const calendarBlock = (
    <CreateScheduleCalendarBody
      selectedDates={selectedDates}
      onSelectDates={handleSelectDates}
      resetToken={calendarResetToken}
      clearEnabled={clearEnabled}
      onClear={onClear}
      pickMode={calendarPickMode}
    />
  );

  const timeBlock = showTimeWheel ? (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[var(--text)]/60">
        {timeLabel}
        {timeRequired ? null : (
          <span className="font-normal text-[var(--text)]/40">
            {" "}
            {peopleUiCopy.planScheduleOptional}
          </span>
        )}
      </p>
      <CreateFinalizeTimeWheel
        value={startTime}
        onChange={onStartTimeChange}
        active={active && !interactionLocked}
      />
    </div>
  ) : null;

  if (!collapsible) {
    return (
      <>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--text)]/60">
            {dateLabel}
            {optionalSuffix ? (
              <span className="font-normal text-[var(--text)]/40">
                {" "}
                {optionalSuffix}
              </span>
            ) : null}
          </p>
          {calendarBlock}
        </div>
        {timeBlock}
        {pastError ? (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {pastError}
          </p>
        ) : null}
      </>
    );
  }

  const displaySummary = summaryText ?? summaryPlaceholder;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--text)]/60">
          {dateLabel}
          {optionalSuffix ? (
            <span className="font-normal text-[var(--text)]/40">
              {" "}
              {optionalSuffix}
            </span>
          ) : null}
        </p>
        {expanded ? (
          <button
            type="button"
            className={SUMMARY_ROW_CLASS}
            disabled={interactionLocked}
            onClick={() => setExpandedState(false)}
            aria-expanded={true}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]/90">
              {displaySummary}
            </span>
            <PiCaretUp
              className="h-4 w-4 shrink-0 text-[var(--text)]/45"
              aria-hidden
            />
          </button>
        ) : (
          <button
            type="button"
            className={SUMMARY_ROW_CLASS}
            disabled={interactionLocked}
            onClick={() => setExpandedState(true)}
            aria-expanded={false}
          >
            <span
              className={[
                "min-w-0 flex-1 truncate text-[13px] font-medium",
                summaryText
                  ? "text-[var(--text)]/90"
                  : "text-[var(--text)]/50",
              ].join(" ")}
            >
              {displaySummary}
            </span>
            <PiCaretRight
              className="h-4 w-4 shrink-0 text-[var(--text)]/45"
              aria-hidden
            />
          </button>
        )}
      </div>
      {expanded ? (
        <>
          {calendarBlock}
          {timeBlock}
        </>
      ) : null}
      {pastError ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {pastError}
        </p>
      ) : null}
    </div>
  );
}
