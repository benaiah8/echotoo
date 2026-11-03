/**
 * People creation / placeholder copy contracts (presentation only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleCreationCopy", () => {
  const pairUp = read("components/ui/PairUpActiveOverlay.tsx");
  const openPlan = read("components/ui/OpenPlanActiveOverlay.tsx");
  const request = read("components/people/OpenPlanRequestNoteComposer.tsx");

  it("shares one continuous public note placeholder for Duo and Open Plans", () => {
    expect(peopleUiCopy.noteSheetPlaceholder).toBe(
      "What's on your mind? What are you looking for?"
    );
    expect(peopleUiCopy.noteSheetPlaceholderLine1).toBe(
      peopleUiCopy.noteSheetPlaceholder
    );
    expect(pairUp).toContain("peopleUiCopy.noteSheetPlaceholder");
    expect(openPlan).toContain("peopleUiCopy.noteSheetPlaceholder");
    expect(pairUp).not.toContain("noteSheetPlaceholderLine2");
    expect(openPlan).not.toContain("noteSheetPlaceholderLine2");
  });

  it("keeps Open Plan request messaging private and distinct", () => {
    expect(peopleUiCopy.openPlanRequestTitle).toBe("Request to join");
    expect(peopleUiCopy.openPlanRequestNoteLabel).toBe(
      "Message to the host (optional)"
    );
    expect(peopleUiCopy.openPlanRequestNotePlaceholder).toBe(
      "Say hi and share why you'd like to join…"
    );
    expect(peopleUiCopy.openPlanRequestSend).toBe("Send request");
    expect(request).toContain("openPlanRequestNotePlaceholder");
    expect(request).not.toContain("noteSheetPlaceholder");
  });

  it("updates Group Up and empty-state copy without changing limits", () => {
    expect(peopleUiCopy.groupUpNamePlaceholder).toBe(
      "e.g. Saturday hiking crew"
    );
    expect(peopleUiCopy.groupUpDescriptionPlaceholder).toContain(
      "What's the plan?"
    );
    expect(peopleUiCopy.groupUpCreateNameRequired).toBe("Add a group name.");
    expect(peopleUiCopy.groupUpCreateDescriptionRequired).toBe(
      "Add a short description."
    );
    expect(peopleUiCopy.groupUpNoteEmpty).toBe("No description yet");
    expect(peopleUiCopy.duoNoteEmpty).toBe("No note yet");
    expect(peopleUiCopy.openPlansNoteEmpty).toBe("No note on this plan");
    expect(peopleUiCopy.deckEmptyBody).toContain("tap Duo");
    expect(peopleUiCopy.groupUpBrowseYoursEmptyTitle).toBe("No groups yet");
    expect(peopleUiCopy.commentComposerPlaceholderBreakTheIce).toBe("Say hi…");
  });
});
