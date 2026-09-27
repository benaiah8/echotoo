import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasValidSavedStructuredSchedule,
  intendedPostTypeFromStructuredSchedule,
  resolveAdminRepublishTypeGate,
  resolveCreatePostTypeForSession,
  resolvePublishedEditScheduleSaveDecision,
  shouldBlockPublishedEditSaveForScheduleTypeLock,
  shouldConvertExperienceToHangoutOnScheduleCommit,
  shouldRequestEventToPlaceOnFinalScheduleRemoval,
  shouldRouteDateChipRemoveToEventToPlace,
  withOwnerRepublishTypeKey,
} from "./createFlowPostType";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("resolveCreatePostTypeForSession", () => {
  it("fresh Event chooser: URL hangout wins over stale stored Place", () => {
    expect(
      resolveCreatePostTypeForSession({
        urlType: "hangout",
        storedType: "experience",
        resumeDraft: false,
        isResumedSession: false,
      }),
    ).toBe("hangout");
  });

  it("continue draft: stored Place wins over mismatched URL", () => {
    expect(
      resolveCreatePostTypeForSession({
        urlType: "hangout",
        storedType: "experience",
        resumeDraft: true,
      }),
    ).toBe("experience");
  });

  it("missing URL during active session uses stored conversion type", () => {
    expect(
      resolveCreatePostTypeForSession({
        urlType: null,
        storedType: "hangout",
        resumeDraft: false,
      }),
    ).toBe("hangout");
  });

  it("no stored type and no URL defaults to Place", () => {
    expect(
      resolveCreatePostTypeForSession({
        urlType: null,
        storedType: null,
        resumeDraft: false,
      }),
    ).toBe("experience");
  });
});

describe("hasValidSavedStructuredSchedule", () => {
  it("rejects empty / time-only equivalent (no structured fields)", () => {
    expect(
      hasValidSavedStructuredSchedule({
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(false);
  });

  it("accepts dates, recurrence days, or recurring flag", () => {
    expect(
      hasValidSavedStructuredSchedule({
        selectedDatesLength: 1,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(true);
    expect(
      hasValidSavedStructuredSchedule({
        selectedDatesLength: 0,
        recurrenceDaysLength: 1,
        isRecurring: false,
      }),
    ).toBe(true);
    expect(
      hasValidSavedStructuredSchedule({
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: true,
      }),
    ).toBe(true);
  });
});

describe("shouldConvertExperienceToHangoutOnScheduleCommit", () => {
  const valid = {
    selectedDatesLength: 1,
    recurrenceDaysLength: 0,
    isRecurring: false,
  } as const;

  it("A: fresh Post cancel-equivalent — no conversion without valid schedule", () => {
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: false,
        createPostType: "experience",
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(false);
  });

  it("B: fresh Post + valid Done converts experience → hangout", () => {
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: false,
        createPostType: "experience",
        ...valid,
      }),
    ).toBe(true);
  });

  it("C: already Event does not re-run Place→Event conversion", () => {
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: false,
        createPostType: "hangout",
        ...valid,
      }),
    ).toBe(false);
  });

  it("D: Settings Post→Event path uses same Done gate (not immediate)", () => {
    // Selecting Event only opens the editor; conversion still requires this gate.
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: false,
        createPostType: "experience",
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(false);
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: false,
        createPostType: "experience",
        ...valid,
      }),
    ).toBe(true);
  });

  it("E: edit mode never converts on schedule commit", () => {
    expect(
      shouldConvertExperienceToHangoutOnScheduleCommit({
        isEditMode: true,
        createPostType: "experience",
        ...valid,
      }),
    ).toBe(false);
  });
});

describe("shouldRequestEventToPlaceOnFinalScheduleRemoval", () => {
  const empty = {
    selectedDatesLength: 0,
    recurrenceDaysLength: 0,
    isRecurring: false,
  } as const;

  it("A: partial Event schedule edit still valid — no conversion request", () => {
    expect(
      shouldRequestEventToPlaceOnFinalScheduleRemoval({
        isEditMode: false,
        createPostType: "hangout",
        selectedDatesLength: 1,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(false);
  });

  it("B: final schedule cleared on Done requests Event → Place confirm", () => {
    expect(
      shouldRequestEventToPlaceOnFinalScheduleRemoval({
        isEditMode: false,
        createPostType: "hangout",
        ...empty,
      }),
    ).toBe(true);
  });

  it("E Phase A: Post empty commit does not request Event → Place", () => {
    expect(
      shouldRequestEventToPlaceOnFinalScheduleRemoval({
        isEditMode: false,
        createPostType: "experience",
        ...empty,
      }),
    ).toBe(false);
  });

  it("G: edit mode never requests Event → Place on empty schedule commit", () => {
    expect(
      shouldRequestEventToPlaceOnFinalScheduleRemoval({
        isEditMode: true,
        createPostType: "hangout",
        ...empty,
      }),
    ).toBe(false);
  });

  it("time-only does not count as valid (empty structured fields)", () => {
    expect(
      shouldRequestEventToPlaceOnFinalScheduleRemoval({
        isEditMode: false,
        createPostType: "hangout",
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe(true);
  });
});

describe("shouldRouteDateChipRemoveToEventToPlace", () => {
  it("C: CREATE Event date chip Remove routes to Event → Place", () => {
    expect(
      shouldRouteDateChipRemoveToEventToPlace({
        isEditMode: false,
        createPostType: "hangout",
      }),
    ).toBe(true);
  });

  it("does not route Place chip or edit-mode remove", () => {
    expect(
      shouldRouteDateChipRemoveToEventToPlace({
        isEditMode: false,
        createPostType: "experience",
      }),
    ).toBe(false);
    expect(
      shouldRouteDateChipRemoveToEventToPlace({
        isEditMode: true,
        createPostType: "hangout",
      }),
    ).toBe(false);
  });
});

describe("intendedPostTypeFromStructuredSchedule", () => {
  it("valid structured schedule → hangout (Event)", () => {
    expect(
      intendedPostTypeFromStructuredSchedule({
        selectedDatesLength: 1,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe("hangout");
  });

  it("no structured schedule → experience (Post); time-only excluded", () => {
    expect(
      intendedPostTypeFromStructuredSchedule({
        selectedDatesLength: 0,
        recurrenceDaysLength: 0,
        isRecurring: false,
      }),
    ).toBe("experience");
  });
});

describe("shouldBlockPublishedEditSaveForScheduleTypeLock", () => {
  it("consistent Post: no schedule → allow; add schedule → block", () => {
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ block: false });
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ block: true, kind: "post_gained_schedule" });
  });

  it("consistent Event: keep schedule → allow; clear schedule → block", () => {
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ block: false });
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ block: true, kind: "event_lost_schedule" });
  });

  it("historical mismatched Post: unchanged schedule → allow; repair → allow", () => {
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ block: false });
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ block: false });
  });

  it("historical mismatched Event: unchanged empty → allow; repair → allow", () => {
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ block: false });
    expect(
      shouldBlockPublishedEditSaveForScheduleTypeLock({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ block: false });
  });
});

describe("resolvePublishedEditScheduleSaveDecision", () => {
  it("consistent Post: schedule gained → conversion (owner and admin same)", () => {
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ action: "allow" });
    const conversion = {
      action: "request_conversion" as const,
      kind: "experience_to_hangout" as const,
    };
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual(conversion);
  });

  it("consistent Event: schedule cleared → conversion (owner and admin same)", () => {
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ action: "allow" });
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({
      action: "request_conversion",
      kind: "hangout_to_experience",
    });
  });

  it("historical mismatched Post: unchanged or repair → allow (no conversion)", () => {
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ action: "allow" });
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "experience",
        initialHasStructuredSchedule: true,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ action: "allow" });
  });

  it("historical mismatched Event: unchanged or repair → allow (no conversion)", () => {
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: false,
      }),
    ).toEqual({ action: "allow" });
    expect(
      resolvePublishedEditScheduleSaveDecision({
        originalPublishedType: "hangout",
        initialHasStructuredSchedule: false,
        currentHasStructuredSchedule: true,
      }),
    ).toEqual({ action: "allow" });
  });
});

describe("resolveAdminRepublishTypeGate", () => {
  it("ordinary admin edit keeps existing type", () => {
    expect(
      resolveAdminRepublishTypeGate({
        originalPostType: "experience",
        postType: "experience",
        confirmedTypeConversion: null,
      }),
    ).toEqual({ nextType: "experience", confirmedSwitch: false });
    expect(
      resolveAdminRepublishTypeGate({
        originalPostType: "hangout",
        postType: "hangout",
        confirmedTypeConversion: null,
      }),
    ).toEqual({ nextType: "hangout", confirmedSwitch: false });
  });

  it("confirmed Post → Event unlocks hangout", () => {
    expect(
      resolveAdminRepublishTypeGate({
        originalPostType: "experience",
        postType: "hangout",
        confirmedTypeConversion: "hangout",
      }),
    ).toEqual({ nextType: "hangout", confirmedSwitch: true });
  });

  it("confirmed Event → Post unlocks experience", () => {
    expect(
      resolveAdminRepublishTypeGate({
        originalPostType: "hangout",
        postType: "experience",
        confirmedTypeConversion: "experience",
      }),
    ).toEqual({ nextType: "experience", confirmedSwitch: true });
  });

  it("unconfirmed or mismatched type switch is rejected", () => {
    expect(() =>
      resolveAdminRepublishTypeGate({
        originalPostType: "experience",
        postType: "hangout",
        confirmedTypeConversion: null,
      }),
    ).toThrow("Post type cannot be changed");
    expect(() =>
      resolveAdminRepublishTypeGate({
        originalPostType: "experience",
        postType: "hangout",
        confirmedTypeConversion: "experience",
      }),
    ).toThrow("Post type cannot be changed");
  });
});

describe("withOwnerRepublishTypeKey", () => {
  it("ordinary owner edit omits type", () => {
    expect(
      withOwnerRepublishTypeKey(
        { type: "hangout", caption: "x", rating_enabled: true },
        null,
      ),
    ).toEqual({ caption: "x", rating_enabled: true });
  });

  it("confirmed Post → Event includes hangout and leaves rating flag to caller", () => {
    expect(
      withOwnerRepublishTypeKey(
        {
          type: "experience",
          caption: "x",
          rating_enabled: false,
          rsvp_capacity: null,
        },
        "hangout",
      ),
    ).toEqual({
      type: "hangout",
      caption: "x",
      rating_enabled: false,
      rsvp_capacity: null,
    });
  });

  it("confirmed Event → Post includes experience", () => {
    expect(
      withOwnerRepublishTypeKey(
        {
          type: "hangout",
          caption: "x",
          rating_enabled: false,
          rsvp_capacity: null,
        },
        "experience",
      ),
    ).toEqual({
      type: "experience",
      caption: "x",
      rating_enabled: false,
      rsvp_capacity: null,
    });
  });
});

describe("CreateFinalize published conversion dialog contract", () => {
  it("conversion dialog is two-action; admin unsupported copy is gone", () => {
    const page = readRepo("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain('cancelLabel="Cancel"');
    expect(page).toContain("Change to Event");
    expect(page).toContain("Change to Post");
    expect(page).toContain("Ratings will be turned off, but existing rating history will be kept.");
    expect(page).toContain("RSVP history will be kept, but Event RSVP capacity will be removed.");
    expect(page).not.toContain("isn't supported yet");
    expect(page).not.toContain("block_admin");
    expect(page).toContain('action === "request_conversion"');
    expect(page).toContain("confirmedOwnerTypeConversion: isEditMode");
  });
});
