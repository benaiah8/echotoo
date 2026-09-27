import { describe, expect, it } from "vitest";
import {
  filterExpiredHangouts,
  filterRailsItems,
  isHangoutDiscoveryEligible,
} from "./feedExpiryFilters";
import type { FeedItemWithDates } from "./feedSorting";

const TZ = "UTC";

function dateOnly(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function hangout(
  partial: Partial<FeedItemWithDates> & { id?: string }
): FeedItemWithDates {
  return {
    id: partial.id ?? "hangout-1",
    type: "hangout",
    created_at: "2020-01-01T00:00:00Z",
    author_id: "author-1",
    ...partial,
  } as FeedItemWithDates;
}

function experience(id = "place-1"): FeedItemWithDates {
  return {
    id,
    type: "experience",
    created_at: "2025-07-01T00:00:00Z",
    author_id: "author-1",
  } as FeedItemWithDates;
}

function eligible(
  item: FeedItemWithDates,
  nowIso: string,
  timeZone = TZ
): boolean {
  return isHangoutDiscoveryEligible(item, new Date(nowIso), timeZone);
}

describe("isHangoutDiscoveryEligible", () => {
  const wedAug26Noon = "2026-08-26T12:00:00Z";
  const thuAug27Noon = "2026-08-27T12:00:00Z";

  it("A. Place from last month → KEEP (via filterExpiredHangouts)", () => {
    const items = filterExpiredHangouts([
      experience(),
      hangout({ selected_dates: [dateOnly("2026-08-25")] }),
    ]);
    expect(items.some((i) => i.type === "experience")).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("B. Event yesterday only → REMOVE", () => {
    expect(
      eligible(hangout({ selected_dates: [dateOnly("2026-08-25")] }), wedAug26Noon)
    ).toBe(false);
  });

  it("C. Event today, no time → KEEP", () => {
    expect(
      eligible(hangout({ selected_dates: [dateOnly("2026-08-26")] }), wedAug26Noon)
    ).toBe(true);
  });

  it("D. Event today, start passed by 3 hours → KEEP", () => {
    expect(
      eligible(
        hangout({ selected_dates: ["2026-08-26T18:00:00.000Z"] }),
        "2026-08-26T21:00:00Z"
      )
    ).toBe(true);
  });

  it("E. Same Event next local day → REMOVE", () => {
    expect(
      eligible(
        hangout({ selected_dates: ["2026-08-26T18:00:00.000Z"] }),
        thuAug27Noon
      )
    ).toBe(false);
  });

  it("F. Event tomorrow → KEEP", () => {
    expect(
      eligible(hangout({ selected_dates: [dateOnly("2026-08-27")] }), wedAug26Noon)
    ).toBe(true);
  });

  it("G. Multi-date past + future → KEEP", () => {
    expect(
      eligible(
        hangout({
          selected_dates: [dateOnly("2026-08-20"), dateOnly("2026-08-27")],
        }),
        wedAug26Noon
      )
    ).toBe(true);
  });

  it("H. Multi-date all past → REMOVE", () => {
    expect(
      eligible(
        hangout({
          selected_dates: [dateOnly("2026-08-20"), dateOnly("2026-08-21")],
        }),
        wedAug26Noon
      )
    ).toBe(false);
  });

  it("I. Valid recurring Event with future occurrence → KEEP", () => {
    expect(
      eligible(
        hangout({
          selected_dates: [dateOnly("2026-08-20")],
          is_recurring: true,
          recurrence_days: ["SA"],
        }),
        wedAug26Noon
      )
    ).toBe(true);
  });

  it("J. Invalid/exhausted recurrence + all dates past → REMOVE", () => {
    expect(
      eligible(
        hangout({
          selected_dates: [dateOnly("2026-08-20")],
          is_recurring: true,
          recurrence_days: [],
        }),
        wedAug26Noon
      )
    ).toBe(false);
  });

  it("K. Unscheduled Event → KEEP", () => {
    expect(
      eligible(
        hangout({ selected_dates: [], is_recurring: false }),
        wedAug26Noon
      )
    ).toBe(true);
  });

  it("L. Timezone boundary — do not expire early from UTC shift", () => {
    const tz = "America/Los_Angeles";
    expect(
      eligible(
        hangout({ selected_dates: ["2026-08-26T07:00:00.000Z"] }),
        "2026-08-26T20:00:00Z",
        tz
      )
    ).toBe(true);
  });

  it("Addis midnight ISO stays eligible through that Addis calendar day", () => {
    const iso = "2026-09-07T21:00:00.000Z";
    expect(
      eligible(hangout({ selected_dates: [iso] }), "2026-09-08T02:00:00.000Z", "Africa/Addis_Ababa")
    ).toBe(true);
    expect(
      eligible(hangout({ selected_dates: [iso] }), "2026-09-09T00:00:00.000Z", "Africa/Addis_Ababa")
    ).toBe(false);
  });

  it("yesterday-only hangout is excluded in Addis", () => {
    expect(
      eligible(
        hangout({ selected_dates: ["2026-09-06T21:00:00.000Z"] }),
        "2026-09-08T02:00:00.000Z",
        "Africa/Addis_Ababa"
      )
    ).toBe(false);
  });

  it("tomorrow Addis midnight ISO remains eligible", () => {
    expect(
      eligible(
        hangout({ selected_dates: ["2026-09-08T21:00:00.000Z"] }),
        "2026-09-08T02:00:00.000Z",
        "Africa/Addis_Ababa"
      )
    ).toBe(true);
  });

  it("multi-date past + future stays eligible in Addis", () => {
    expect(
      eligible(
        hangout({
          selected_dates: [
            "2026-09-05T21:00:00.000Z",
            "2026-09-08T21:00:00.000Z",
          ],
        }),
        "2026-09-08T02:00:00.000Z",
        "Africa/Addis_Ababa"
      )
    ).toBe(true);
  });
});

describe("filterRailsItems", () => {
  it("excludes unscheduled hangouts but keeps eligible scheduled hangouts", () => {
    const scheduled = hangout({
      id: "hangout-future",
      selected_dates: [dateOnly("2026-08-27")],
    });
    const items = filterRailsItems(
      [
        experience(),
        hangout({ id: "hangout-unscheduled", selected_dates: [], is_recurring: false }),
        scheduled,
        hangout({ id: "hangout-past", selected_dates: [dateOnly("2026-08-20")] }),
      ],
      new Date("2026-08-26T12:00:00Z")
    );
    expect(items.map((i) => i.id)).toEqual(["place-1", "hangout-future"]);
  });
});
