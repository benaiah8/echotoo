import { describe, expect, it } from "vitest";
import {
  formatPostDetailScheduleStatus,
  getPostScheduleLabel,
} from "./postScheduleLabel";

const TZ = "UTC";

function hangoutLabel(
  nowIso: string,
  selectedDates: string[],
  opts?: {
    timeZone?: string;
    isRecurring?: boolean;
    recurrenceDays?: string[];
  }
): string {
  return getPostScheduleLabel({
    type: "hangout",
    createdAt: "2020-01-01T00:00:00Z",
    selectedDates,
    now: new Date(nowIso),
    timeZone: opts?.timeZone ?? TZ,
    isRecurring: opts?.isRecurring,
    recurrenceDays: opts?.recurrenceDays,
  }).label;
}

/** Date-only fixtures: midnight UTC (no explicit start time in UTC). */
function dateOnly(day: string): string {
  return `${day}T00:00:00.000Z`;
}

describe("getPostScheduleLabel relative event wording", () => {
  const wedAug26 = "2026-08-26T12:00:00Z";

  it("uses Today / Tomorrow / This weekday for the current ISO week (Wed Aug 26 2026)", () => {
    expect(hangoutLabel(wedAug26, [dateOnly("2026-08-26")])).toBe("Today");
    expect(hangoutLabel(wedAug26, [dateOnly("2026-08-27")])).toBe("Tomorrow");
    expect(hangoutLabel(wedAug26, [dateOnly("2026-08-28")])).toBe("This Friday");
    expect(hangoutLabel(wedAug26, [dateOnly("2026-08-29")])).toBe(
      "This Saturday"
    );
    expect(hangoutLabel(wedAug26, [dateOnly("2026-08-30")])).toBe("This Sunday");
  });

  it("uses Next weekday for the immediately following calendar week", () => {
    expect(hangoutLabel(wedAug26, [dateOnly("2026-09-05")])).toBe(
      "Next Saturday"
    );
  });

  it("does not call a following-week Monday 'This Monday' when today is Saturday", () => {
    const satAug29 = "2026-08-29T12:00:00Z";
    expect(hangoutLabel(satAug29, [dateOnly("2026-08-31")])).toBe("Next Monday");
    expect(hangoutLabel(satAug29, [dateOnly("2026-08-31")])).not.toBe(
      "This Monday"
    );
  });

  it("preserves timezone-aware calendar-day boundaries (US Pacific)", () => {
    const tz = "America/Los_Angeles";
    const result = getPostScheduleLabel({
      type: "hangout",
      createdAt: "2020-01-01T00:00:00Z",
      selectedDates: ["2026-08-29T07:00:00.000Z"],
      now: new Date("2026-08-26T07:00:00Z"),
      timeZone: tz,
    });
    expect(result.label).toBe("This Saturday");
  });
});

describe("getPostScheduleLabel start-time wording", () => {
  const day = "2026-08-26";

  it("A. today with no start time stays date-only", () => {
    expect(hangoutLabel(`${day}T15:00:00Z`, [dateOnly(day)])).toBe("Today");
  });

  it("B. today · in 2h when start is two hours away", () => {
    expect(
      hangoutLabel(`${day}T16:00:00Z`, [`${day}T18:10:00.000Z`])
    ).toBe("Today · in 2h");
  });

  it("C. today · in 45m when start is forty-five minutes away", () => {
    expect(
      hangoutLabel(`${day}T17:15:00Z`, [`${day}T18:00:00.000Z`])
    ).toBe("Today · in 45m");
  });

  it("D. today at start time → Happening now", () => {
    expect(
      hangoutLabel(`${day}T18:00:00Z`, [`${day}T18:00:00.000Z`])
    ).toBe("Happening now");
  });

  it("E. today after start passed → Happening now (no end time)", () => {
    expect(
      hangoutLabel(`${day}T21:00:00Z`, [`${day}T18:00:00.000Z`])
    ).toBe("Happening now");
  });

  it("F. tomorrow with start time", () => {
    expect(
      hangoutLabel(`${day}T12:00:00Z`, ["2026-08-27T18:00:00.000Z"])
    ).toBe("Tomorrow · 6 PM");
  });

  it("G. this Saturday with start time", () => {
    expect(
      hangoutLabel(`${day}T12:00:00Z`, ["2026-08-29T21:00:00.000Z"])
    ).toBe("This Saturday · 9 PM");
  });

  it("H. next Saturday with start time", () => {
    expect(
      hangoutLabel(`${day}T12:00:00Z`, ["2026-09-05T19:30:00.000Z"])
    ).toBe("Next Saturday · 7:30 PM");
  });

  it("I. yesterday start passed must not say Happening now", () => {
    expect(
      hangoutLabel(`${day}T12:00:00Z`, ["2026-08-25T18:00:00.000Z"])
    ).toBe("Event passed");
  });

  it("J. timezone boundary — LA viewer, start not early/late from UTC shift", () => {
    const tz = "America/Los_Angeles";
    const label = hangoutLabel(
      "2026-08-27T06:00:00Z",
      ["2026-08-28T02:00:00.000Z"],
      { timeZone: tz }
    );
    expect(label).toBe("Tomorrow · 7 PM");
    expect(label).not.toBe("Happening now");
  });

  it("K. multiple dates uses the next upcoming occurrence", () => {
    expect(
      hangoutLabel(`${day}T12:00:00Z`, [
        "2026-08-25T18:00:00.000Z",
        "2026-08-29T21:00:00.000Z",
      ])
    ).toBe("This Saturday · 9 PM");
  });

  it("recurring occurrence today after start → Happening now", () => {
    const sat = "2026-08-29";
    expect(
      hangoutLabel(`${sat}T22:00:00Z`, [`${sat}T20:00:00.000Z`], {
        isRecurring: true,
        recurrenceDays: ["SA"],
      })
    ).toBe("Happening now");
  });
});

describe("getPostScheduleLabel matched occurrence override", () => {
  const addisTueMorning = "2026-09-08T02:00:00.000Z";
  const todayAndTomorrow = [
    "2026-09-07T21:00:00.000Z",
    "2026-09-08T21:00:00.000Z",
  ];

  it("uses the matched day instead of the nearest upcoming date", () => {
    expect(
      getPostScheduleLabel({
        type: "hangout",
        createdAt: "2020-01-01T00:00:00Z",
        selectedDates: todayAndTomorrow,
        now: new Date(addisTueMorning),
        timeZone: "Africa/Addis_Ababa",
        matchedOccurrenceDayKey: "2026-09-09",
      }).label
    ).toBe("Tomorrow");
    expect(
      getPostScheduleLabel({
        type: "hangout",
        createdAt: "2020-01-01T00:00:00Z",
        selectedDates: todayAndTomorrow,
        now: new Date(addisTueMorning),
        timeZone: "Africa/Addis_Ababa",
        matchedOccurrenceDayKey: "2026-09-08",
      }).label
    ).toBe("Today");
  });

  it("labels This Saturday when the matched weekend day is Saturday", () => {
    expect(
      getPostScheduleLabel({
        type: "hangout",
        createdAt: "2020-01-01T00:00:00Z",
        selectedDates: [
          "2026-09-07T21:00:00.000Z",
          "2026-09-11T21:00:00.000Z",
        ],
        now: new Date(addisTueMorning),
        timeZone: "Africa/Addis_Ababa",
        matchedOccurrenceDayKey: "2026-09-12",
      }).label
    ).toBe("This Saturday");
  });

  it("without matched day keeps nearest-upcoming Today for a Today+Tomorrow post", () => {
    expect(
      hangoutLabel(addisTueMorning, todayAndTomorrow, {
        timeZone: "Africa/Addis_Ababa",
      })
    ).toBe("Today");
  });

  it("experience without occurrence context is unchanged", () => {
    expect(
      getPostScheduleLabel({
        type: "experience",
        createdAt: "2026-09-08T00:00:00.000Z",
        now: new Date("2026-09-08T12:00:00.000Z"),
        timeZone: "UTC",
      }).label
    ).toBe("posted today");
  });
});

describe("formatPostDetailScheduleStatus presentation aliases", () => {
  const day = "2026-08-26";

  function statusFor(
    nowIso: string,
    selectedDates: string[],
    opts?: {
      isRecurring?: boolean;
      recurrenceDays?: string[];
      type?: "hangout" | "experience";
    }
  ): string | null {
    return formatPostDetailScheduleStatus(
      getPostScheduleLabel({
        type: opts?.type ?? "hangout",
        createdAt: "2020-01-01T00:00:00Z",
        selectedDates,
        now: new Date(nowIso),
        timeZone: TZ,
        isRecurring: opts?.isRecurring,
        recurrenceDays: opts?.recurrenceDays,
      })
    );
  }

  it("A. explicit future time → Starts in Nh", () => {
    expect(statusFor(`${day}T16:00:00Z`, [`${day}T18:10:00.000Z`])).toBe(
      "Starts in 2h"
    );
  });

  it("B. explicit near time → Starts in Nm", () => {
    expect(statusFor(`${day}T17:15:00Z`, [`${day}T18:00:00.000Z`])).toBe(
      "Starts in 45m"
    );
  });

  it("C. same-day after start → Happening now", () => {
    expect(statusFor(`${day}T21:00:00Z`, [`${day}T18:00:00.000Z`])).toBe(
      "Happening now"
    );
  });

  it("D. no explicit time → no clock/status invention", () => {
    expect(statusFor(`${day}T15:00:00Z`, [dateOnly(day)])).toBeNull();
  });

  it("E. passed hangout → Event passed", () => {
    expect(statusFor(`${day}T12:00:00Z`, ["2026-08-25T18:00:00.000Z"])).toBe(
      "Event passed"
    );
  });

  it("E2. experience posted-ago is not shown as schedule status", () => {
    expect(
      statusFor(`${day}T12:00:00Z`, [], {
        type: "experience",
      })
    ).toBeNull();
  });

  it("F. recurring uses relevant occurrence (today after start)", () => {
    const sat = "2026-08-29";
    expect(
      statusFor(`${sat}T22:00:00Z`, [`${sat}T20:00:00.000Z`], {
        isRecurring: true,
        recurrenceDays: ["SA"],
      })
    ).toBe("Happening now");
  });

  it("G. multi-date uses next upcoming occurrence (not past first date)", () => {
    expect(
      statusFor(`${day}T12:00:00Z`, [
        "2026-08-25T18:00:00.000Z",
        "2026-08-29T21:00:00.000Z",
      ])
    ).toBeNull(); // Saturday · 9 PM — no relative hour line
    expect(
      statusFor(`${day}T16:00:00Z`, [
        "2026-08-25T18:00:00.000Z",
        `${day}T18:10:00.000Z`,
      ])
    ).toBe("Starts in 2h");
  });

  it("does not alias Tomorrow · clock into a Starts-in line", () => {
    expect(
      statusFor(`${day}T12:00:00Z`, ["2026-08-27T18:00:00.000Z"])
    ).toBeNull();
  });
});
