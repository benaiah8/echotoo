import { useCallback, useMemo, useState } from "react";
import CreateScheduleCalendarBody from "../create/CreateScheduleCalendarBody";
import { useHomeCalendarMonthCounts } from "../../hooks/useHomeCalendarMonthCounts";
import {
  addisYmdToPickerDate,
  isAddisYmdBeforeToday,
  pickerDateToAddisYmd,
  viewerLocalOccurrence,
} from "../../lib/homeVerticalFilters";
import { pickerMonthToStartYmd } from "../../lib/homeCalendarMonthCountsCache";

type Props = {
  customOccursOn: string | null;
  onSelectCustomDate: (occursOn: string) => void;
  /** Calendar section expanded — enables lazy count fetch. */
  calendarVisible: boolean;
  friendsFilter: boolean;
  homeRefreshEpoch?: number;
  /** Increment when drawer opens to sync month anchor. */
  resetToken: boolean;
};

export default function HomeFilterCalendarPanel({
  customOccursOn,
  onSelectCustomDate,
  calendarVisible,
  friendsFilter,
  homeRefreshEpoch = 0,
  resetToken,
}: Props) {
  const selectedDates = useMemo(() => {
    if (!customOccursOn) return [];
    const d = addisYmdToPickerDate(customOccursOn);
    return d ? [d] : [];
  }, [customOccursOn]);

  const disabledDays = useMemo(
    () => (date: Date) => isAddisYmdBeforeToday(pickerDateToAddisYmd(date)),
    []
  );

  const addisToday = viewerLocalOccurrence(0);
  const initialMonth = useMemo(() => {
    void resetToken;
    if (addisToday?.occursOn) {
      const d = addisYmdToPickerDate(addisToday.occursOn);
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [addisToday?.occursOn, resetToken]);

  const [displayMonth, setDisplayMonth] = useState(initialMonth);

  const countsState = useHomeCalendarMonthCounts({
    enabled: calendarVisible,
    displayMonth,
    friendsOnly: friendsFilter,
    refreshEpoch: homeRefreshEpoch,
  });

  const homeDayEventCounts = useMemo(() => {
    if (!calendarVisible) return undefined;
    if (countsState.status === "loading") {
      return { status: "loading" as const };
    }
    if (countsState.status === "error") {
      return { status: "error" as const };
    }
    if (countsState.status === "ready" && countsState.countsByYmd) {
      return {
        status: "ready" as const,
        countsByYmd: countsState.countsByYmd,
      };
    }
    return { status: "loading" as const };
  }, [calendarVisible, countsState]);

  const handleDisplayMonthChange = useCallback((month: Date) => {
    setDisplayMonth(new Date(month.getFullYear(), month.getMonth(), 1));
  }, []);

  const startMonth = useMemo(() => initialMonth, [initialMonth]);

  const handleSelectDates = useCallback(
    (dates: Date[]) => {
      const day = dates[0];
      if (!day) return;
      const occursOn = pickerDateToAddisYmd(day);
      if (isAddisYmdBeforeToday(occursOn)) return;
      onSelectCustomDate(occursOn);
    },
    [onSelectCustomDate]
  );

  const countsHint =
    countsState.status === "error" && !countsState.missingRpc
      ? "Couldn\u2019t load event counts"
      : countsState.status === "error" && countsState.missingRpc
        ? null
        : null;

  return (
    <div
      className="w-full min-w-0 bg-transparent p-0"
      data-tour-target="home-filter-calendar"
      data-home-filters-calendar="true"
      data-home-calendar-month={pickerMonthToStartYmd(displayMonth)}
    >
      <CreateScheduleCalendarBody
        pickMode="single"
        showFooterControls={false}
        selectedDates={selectedDates}
        onSelectDates={handleSelectDates}
        resetToken={resetToken}
        disabledDays={disabledDays}
        startMonth={startMonth}
        onDisplayMonthChange={handleDisplayMonthChange}
        homeDayEventCounts={homeDayEventCounts}
        dayPickerClassName="rdp-theme--full-width"
      />
      {countsHint ? (
        <p
          className="mt-1 text-center text-[9px] leading-tight text-[var(--text)]/45"
          role="status"
        >
          {countsHint}
        </p>
      ) : null}
    </div>
  );
}
