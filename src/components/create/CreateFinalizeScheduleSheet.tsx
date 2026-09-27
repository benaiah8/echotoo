/**
 * V4 Finalize Date/Time scheduling sheet.
 * Working copy until Done; X / backdrop discard.
 * Calendar ↔ Wheel is presentation-only (sheet-local dateSurface).
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PiCalendarBlank, PiClock, PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { CREATE_FLOW_WEEKDAYS } from "../../lib/createFlowScheduleConstants";
import { formatScheduleSheetSummaryLine } from "../../lib/createFlowDateSummary";
import {
  extractExplicitStartTime,
  stampStartTimeOnDates,
  type CreateFlowStartTime,
} from "../../lib/createFlowStartTime";
import {
  applyCreateScheduleWheelDateChange,
  getCreateScheduleWheelFocusDate,
  getCreateScheduleWheelTechnicalBounds,
} from "../../lib/createFinalizeScheduleWheelAdapter";
import CreateScheduleCalendarBody from "./CreateScheduleCalendarBody";
import CreateFinalizeTimeWheel from "./CreateFinalizeTimeWheel";
import FutureDateWheel from "../date/FutureDateWheel";
import FutureDateSurfaceToggle, {
  type FutureDatePickerSurface,
} from "../date/FutureDateSurfaceToggle";

type SheetTab = "date" | "time";

export type CreateFinalizeScheduleCommit = {
  selectedDates: Date[];
  recurrenceDays: string[];
  isRecurring: boolean;
  pendingStartTime: CreateFlowStartTime | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCommit: (next: CreateFinalizeScheduleCommit) => void;
  selectedDates: Date[];
  recurrenceDays: string[];
  pendingStartTime: CreateFlowStartTime | null;
};

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8";

const tabBase =
  "flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold transition active:scale-[0.99]";

const tabIdle = `${tabBase} border border-[var(--border)]/70 bg-[var(--surface-2)]/70 text-[var(--text)]/90`;
const tabOn = `${tabBase} bg-[var(--brand)] text-[var(--brand-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]`;
const doneClass =
  "flex h-10 min-h-10 min-w-0 flex-[1.15] items-center justify-center rounded-full bg-amber-400/90 px-3 text-[13px] font-semibold text-neutral-900 transition active:scale-[0.99]";

const SUMMARY_IDLE =
  "border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--glass-bg)_88%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] app-dark:border-white/18 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";

const SUMMARY_ACK =
  "border-[color-mix(in_oklab,var(--brand)_55%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_16%,var(--glass-bg))] shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent),0_0_16px_color-mix(in_oklab,var(--brand)_22%,transparent)]";

const ACK_MS = 420;

function cloneDates(dates: Date[]): Date[] {
  return dates.map((d) => new Date(d.getTime()));
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function CreateFinalizeScheduleSheet({
  open,
  onClose,
  onCommit,
  selectedDates,
  recurrenceDays,
  pendingStartTime,
}: Props) {
  const [tab, setTab] = useState<SheetTab>("date");
  const [dateSurface, setDateSurface] =
    useState<FutureDatePickerSurface>("calendar");
  const [workingDates, setWorkingDates] = useState<Date[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [workingStartTime, setWorkingStartTime] =
    useState<CreateFlowStartTime | null>(null);
  const [calendarResetToken, setCalendarResetToken] = useState(0);
  const [summaryAck, setSummaryAck] = useState(false);
  const [summaryMultiline, setSummaryMultiline] = useState(false);
  const suppressAckRef = useRef(true);
  const summaryTextRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    suppressAckRef.current = true;
    setSummaryAck(false);
    setTab("date");
    setDateSurface("calendar");
    setWorkingDates(cloneDates(selectedDates));
    setWorkingDays([...recurrenceDays]);
    setWorkingStartTime(
      extractExplicitStartTime(selectedDates) ?? pendingStartTime
    );
    setCalendarResetToken((n) => n + 1);
  }, [open, pendingStartTime, recurrenceDays, selectedDates]);

  const summary = useMemo(
    () =>
      formatScheduleSheetSummaryLine({
        selectedDates: workingDates,
        recurrenceDayCodes: workingDays,
        startTime: workingStartTime,
      }),
    [workingDates, workingDays, workingStartTime]
  );

  const wheelBounds = useMemo(
    () => getCreateScheduleWheelTechnicalBounds(),
    []
  );

  const wheelFocusDate = useMemo(
    () => getCreateScheduleWheelFocusDate(workingDates),
    [workingDates]
  );

  useEffect(() => {
    if (!open) return;
    if (suppressAckRef.current) {
      suppressAckRef.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    setSummaryAck(true);
    const id = window.setTimeout(() => setSummaryAck(false), ACK_MS);
    return () => window.clearTimeout(id);
  }, [open, summary]);

  useLayoutEffect(() => {
    const el = summaryTextRef.current;
    if (!el) return;
    const measure = () => {
      const lhRaw = getComputedStyle(el).lineHeight;
      const lh = Number.parseFloat(lhRaw);
      const line = Number.isFinite(lh) && lh > 0 ? lh : 18;
      setSummaryMultiline(el.scrollHeight > line * 1.35);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [summary, open]);

  const toggleWeekday = (code: string) => {
    setWorkingDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  const clearSchedule = () => {
    setWorkingDates([]);
    setWorkingDays([]);
    setWorkingStartTime(null);
  };

  const clearStartTimeOnly = () => {
    setWorkingStartTime(null);
    setWorkingDates((prev) => stampStartTimeOnDates(prev, null));
  };

  const handleSelectDates = (dates: Date[]) => {
    setWorkingDates(stampStartTimeOnDates(dates, workingStartTime));
  };

  const handleWheelDateChange = (next: Date) => {
    setWorkingDates((prev) =>
      applyCreateScheduleWheelDateChange(prev, next, workingStartTime)
    );
  };

  const discard = () => {
    onClose();
  };

  const commit = () => {
    const nextDays = [...workingDays];
    const nextRecurring = nextDays.length > 0;
    const nextDates =
      workingDates.length > 0
        ? stampStartTimeOnDates(workingDates, workingStartTime)
        : [];
    onCommit({
      selectedDates: nextDates,
      recurrenceDays: nextDays,
      isRecurring: nextRecurring,
      pendingStartTime: nextDates.length > 0 ? null : workingStartTime,
    });
  };

  const weekdayChips = (
    <div
      className="grid w-full grid-cols-7 justify-items-center gap-y-1"
      role="group"
      aria-label="Repeat on weekdays"
    >
      {CREATE_FLOW_WEEKDAYS.map((d) => {
        const on = workingDays.includes(d.code);
        return (
          <button
            key={d.code}
            type="button"
            aria-label={d.ariaLabel}
            aria-pressed={on}
            onClick={() => toggleWeekday(d.code)}
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none transition",
              on
                ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                : "border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface)_16%,transparent)] text-[var(--text)]/80 hover:bg-[color-mix(in_oklab,var(--surface)_26%,transparent)]",
            ].join(" ")}
          >
            {d.chipLabel}
          </button>
        );
      })}
    </div>
  );

  return (
    <BottomDrawer
      open={open}
      onClose={discard}
      transparentSheet
      backdropVariant="strong"
      portalClassName="z-[130]"
      maxHeight="88vh"
      shrinkSheetToContent
      showCloseButton={false}
      contentClassName="px-4 pt-1"
    >
      <div
        className={`${glassPeoplePanelClass} mx-auto flex max-h-[min(82vh,40rem)] w-full max-w-lg flex-col`}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule"
      >
        <div className="flex shrink-0 items-start gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div
              className={[
                "max-w-full px-3 py-1.5 transition-[background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
                summaryMultiline
                  ? "w-full rounded-2xl"
                  : "w-fit rounded-full",
                summaryAck ? SUMMARY_ACK : SUMMARY_IDLE,
              ].join(" ")}
            >
              <p
                ref={summaryTextRef}
                className="line-clamp-2 text-[13px] font-medium leading-snug text-[var(--text)]/92 sm:text-[14px]"
              >
                {summary}
              </p>
            </div>
          </div>
          {tab === "date" ? (
            <FutureDateSurfaceToggle
              value={dateSurface}
              onChange={setDateSurface}
              className="mt-0.5"
            />
          ) : null}
          <button
            type="button"
            className={`${closeBtnClass} mt-0.5`}
            aria-label="Close"
            onClick={discard}
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3">
          {/* Keep calendar mounted while sheet open so Multi/Range UI state survives wheel. */}
          <div
            className={
              tab === "date" && dateSurface === "calendar" ? undefined : "hidden"
            }
          >
            <CreateScheduleCalendarBody
              selectedDates={workingDates}
              onSelectDates={handleSelectDates}
              resetToken={calendarResetToken}
              extraBelowControls={weekdayChips}
              onClear={clearSchedule}
              clearEnabled={
                workingDates.length > 0 ||
                workingDays.length > 0 ||
                workingStartTime != null
              }
            />
          </div>
          <div
            className={
              tab === "date" && dateSurface === "wheel" ? undefined : "hidden"
            }
          >
            <div className="flex w-full min-w-0 flex-col gap-2.5">
              <div className="rounded-2xl border border-[color-mix(in_oklab,var(--border)_42%,transparent)] bg-transparent px-2 py-2">
                <FutureDateWheel
                  value={wheelFocusDate}
                  onChange={handleWheelDateChange}
                  minDate={wheelBounds.minDate}
                  maxDate={wheelBounds.maxDate}
                  active={open && tab === "date" && dateSurface === "wheel"}
                />
              </div>
              {weekdayChips}
            </div>
          </div>
          <div className={tab === "time" ? undefined : "hidden"}>
            <CreateFinalizeTimeWheel
              value={workingStartTime}
              onChange={setWorkingStartTime}
              onClear={clearStartTimeOnly}
              active={open && tab === "time"}
            />
          </div>
        </div>

        <div className="shrink-0 px-3 py-2.5">
          <div
            className="flex items-center gap-2"
            role="tablist"
            aria-label="Schedule views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "date"}
              className={tab === "date" ? tabOn : tabIdle}
              onClick={() => setTab("date")}
            >
              <PiCalendarBlank className="h-4 w-4 shrink-0" aria-hidden />
              Date
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "time"}
              className={tab === "time" ? tabOn : tabIdle}
              onClick={() => setTab("time")}
            >
              <PiClock className="h-4 w-4 shrink-0" aria-hidden />
              Time
            </button>
            <button type="button" className={doneClass} onClick={commit}>
              Done
            </button>
          </div>
        </div>
      </div>
    </BottomDrawer>
  );
}
