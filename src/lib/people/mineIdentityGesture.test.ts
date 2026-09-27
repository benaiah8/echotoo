import { describe, expect, it } from "vitest";
import {
  peopleIdentityMovedPastTapThreshold,
  peopleMineEmblaAllowsDragFromTarget,
} from "./mineIdentityGesture";
import { PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX } from "./peopleCandidateMediaPresentation";

function mockClosestTarget(
  matchSelector: string | null
): EventTarget {
  return {
    closest: (sel: string) =>
      matchSelector && sel === matchSelector ? {} : null,
  } as unknown as EventTarget;
}

describe("peopleMineEmblaAllowsDragFromTarget", () => {
  it("blocks when carousel is locked", () => {
    expect(
      peopleMineEmblaAllowsDragFromTarget(true, mockClosestTarget(null))
    ).toBe(false);
  });

  it("allows identity name / bio targets", () => {
    // Identity hits are no longer Embla-excluded — closest fullscreen only matters.
    expect(
      peopleMineEmblaAllowsDragFromTarget(false, mockClosestTarget(null))
    ).toBe(true);
  });

  it("blocks fullscreen hit targets", () => {
    expect(
      peopleMineEmblaAllowsDragFromTarget(
        false,
        mockClosestTarget("[data-people-mine-fullscreen-hit]")
      )
    ).toBe(false);
  });

  it("allows ordinary / null targets", () => {
    expect(peopleMineEmblaAllowsDragFromTarget(false, null)).toBe(true);
    expect(
      peopleMineEmblaAllowsDragFromTarget(false, mockClosestTarget(null))
    ).toBe(true);
  });
});

describe("peopleIdentityMovedPastTapThreshold", () => {
  const origin = { x: 100, y: 200 };

  it("stays within threshold for stationary taps", () => {
    expect(peopleIdentityMovedPastTapThreshold(origin, 100, 200)).toBe(
      false
    );
    expect(
      peopleIdentityMovedPastTapThreshold(
        origin,
        100 + PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
        200
      )
    ).toBe(false);
  });

  it("suppresses after horizontal or vertical move past 10px", () => {
    expect(
      peopleIdentityMovedPastTapThreshold(
        origin,
        100 + PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX + 1,
        200
      )
    ).toBe(true);
    expect(
      peopleIdentityMovedPastTapThreshold(
        origin,
        100,
        200 + PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX + 1
      )
    ).toBe(true);
  });
});
