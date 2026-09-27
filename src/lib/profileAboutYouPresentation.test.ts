import { describe, expect, it } from "vitest";
import {
  applyAboutYouEditCancel,
  deriveAboutYouActionLabel,
  deriveAboutYouVisualState,
  formatBirthdayDisplay,
  formatGenderDisplay,
  isAboutYouBirthdayMissing,
  isAboutYouComplete,
  isAboutYouFieldIncomplete,
  isAboutYouGenderMissing,
  isBirthdayMissing,
  isGenderMissing,
  shouldConfirmAboutYouEdit,
} from "./profileAboutYouPresentation";

describe("isAboutYouComplete", () => {
  it("both null → incomplete", () => {
    expect(isAboutYouComplete(null, null)).toBe(false);
    expect(deriveAboutYouVisualState(null, null)).toBe("incomplete");
    expect(shouldConfirmAboutYouEdit(null, null)).toBe(false);
  });

  it("DOB only → incomplete, no confirm", () => {
    expect(isAboutYouComplete("1998-05-14", null)).toBe(false);
    expect(shouldConfirmAboutYouEdit("1998-05-14", null)).toBe(false);
    expect(isAboutYouBirthdayMissing("1998-05-14")).toBe(false);
    expect(isAboutYouGenderMissing(null)).toBe(true);
  });

  it("gender only → incomplete, no confirm", () => {
    expect(isAboutYouComplete(null, "female")).toBe(false);
    expect(shouldConfirmAboutYouEdit(null, "female")).toBe(false);
    expect(isAboutYouBirthdayMissing(null)).toBe(true);
    expect(isAboutYouGenderMissing("female")).toBe(false);
  });

  it("both set → complete, confirm before edit", () => {
    expect(isAboutYouComplete("1998-05-14", "male")).toBe(true);
    expect(deriveAboutYouVisualState("1998-05-14", "male")).toBe("complete");
    expect(shouldConfirmAboutYouEdit("1998-05-14", "male")).toBe(true);
  });

  it("prefer_not_to_say + DOB → complete", () => {
    expect(isAboutYouComplete("1998-05-14", "prefer_not_to_say")).toBe(true);
    expect(shouldConfirmAboutYouEdit("1998-05-14", "prefer_not_to_say")).toBe(
      true,
    );
  });
});

describe("per-field incomplete", () => {
  it("birthday missing → Birthday incomplete only", () => {
    expect(isBirthdayMissing(null)).toBe(true);
    expect(isGenderMissing("male")).toBe(false);
    expect(isAboutYouFieldIncomplete("birthday", null, "male")).toBe(true);
    expect(isAboutYouFieldIncomplete("gender", null, "male")).toBe(false);
  });

  it("gender missing → Gender incomplete only", () => {
    expect(isBirthdayMissing("1998-05-14")).toBe(false);
    expect(isGenderMissing(null)).toBe(true);
    expect(isAboutYouFieldIncomplete("birthday", "1998-05-14", null)).toBe(
      false,
    );
    expect(isAboutYouFieldIncomplete("gender", "1998-05-14", null)).toBe(true);
  });

  it("both missing → both incomplete", () => {
    expect(isAboutYouFieldIncomplete("birthday", null, null)).toBe(true);
    expect(isAboutYouFieldIncomplete("gender", null, null)).toBe(true);
  });

  it("both set → neither incomplete", () => {
    expect(
      isAboutYouFieldIncomplete("birthday", "1998-05-14", "male"),
    ).toBe(false);
    expect(
      isAboutYouFieldIncomplete("gender", "1998-05-14", "male"),
    ).toBe(false);
  });

  it("prefer_not_to_say counts as set for gender card", () => {
    expect(isGenderMissing("prefer_not_to_say")).toBe(false);
    expect(
      isAboutYouFieldIncomplete(
        "gender",
        "1998-05-14",
        "prefer_not_to_say",
      ),
    ).toBe(false);
    expect(isAboutYouComplete("1998-05-14", "prefer_not_to_say")).toBe(true);
  });
});

describe("deriveAboutYouActionLabel", () => {
  it("both empty → Add", () => {
    expect(deriveAboutYouActionLabel(null, null)).toBe("Add");
  });

  it("DOB only → Edit", () => {
    expect(deriveAboutYouActionLabel("1998-05-14", null)).toBe("Edit");
  });

  it("gender only → Edit", () => {
    expect(deriveAboutYouActionLabel(null, "female")).toBe("Edit");
  });

  it("both set → Edit", () => {
    expect(deriveAboutYouActionLabel("1998-05-14", "male")).toBe("Edit");
  });
});

describe("formatGenderDisplay", () => {
  it("maps enum values to friendly labels", () => {
    expect(formatGenderDisplay("male")).toBe("Male");
    expect(formatGenderDisplay("female")).toBe("Female");
    expect(formatGenderDisplay("prefer_not_to_say")).toBe("Prefer not to say");
  });

  it("null → Not set", () => {
    expect(formatGenderDisplay(null)).toBe("Not set");
  });
});

describe("formatBirthdayDisplay", () => {
  it("formats YYYY-MM-DD without exposing raw value", () => {
    const label = formatBirthdayDisplay("1998-05-14");
    expect(label).not.toBe("1998-05-14");
    expect(label).toMatch(/1998/);
    expect(label).toMatch(/14/);
  });

  it("null or invalid → Not set", () => {
    expect(formatBirthdayDisplay(null)).toBe("Not set");
    expect(formatBirthdayDisplay("not-a-date")).toBe("Not set");
  });
});

describe("applyAboutYouEditCancel", () => {
  it("restores edit-session baseline and clears dirty when unchanged from initial", () => {
    const baseline = { dateOfBirth: "1998-05-14", gender: "female" as const };
    const initial = { dateOfBirth: "1998-05-14", gender: "female" as const };
    const restored = applyAboutYouEditCancel(baseline, initial);
    expect(restored.dateOfBirth).toBe("1998-05-14");
    expect(restored.gender).toBe("female");
    expect(restored.dobTouched).toBe(false);
    expect(restored.genderTouched).toBe(false);
  });

  it("restores prior empty state after Add session cancel", () => {
    const baseline = { dateOfBirth: null, gender: null };
    const initial = { dateOfBirth: null, gender: null };
    const restored = applyAboutYouEditCancel(baseline, initial);
    expect(restored.dateOfBirth).toBeNull();
    expect(restored.gender).toBeNull();
    expect(restored.dobTouched).toBe(false);
    expect(restored.genderTouched).toBe(false);
  });

  it("keeps dirty when baseline differed from initial before cancel", () => {
    const baseline = { dateOfBirth: "1998-05-14", gender: null };
    const initial = { dateOfBirth: null, gender: null };
    const restored = applyAboutYouEditCancel(baseline, initial);
    expect(restored.dateOfBirth).toBe("1998-05-14");
    expect(restored.dobTouched).toBe(true);
    expect(restored.genderTouched).toBe(false);
  });

  it("restores birthday after in-session change then cancel", () => {
    const baseline = { dateOfBirth: "1998-05-14", gender: "female" as const };
    const initial = { dateOfBirth: "1998-05-14", gender: "female" as const };
    const restored = applyAboutYouEditCancel(baseline, initial);
    expect(restored.dateOfBirth).toBe("1998-05-14");
    expect(restored.gender).toBe("female");
  });
});
