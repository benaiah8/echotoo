import { describe, expect, it } from "vitest";
import {
  canCloseProfilePhotoPrompt,
  canFireProfilePhotoPromptContinue,
  deriveProfilePhotoPromptCta,
  deriveProfilePhotoPromptSentence,
  deriveProfilePhotoPromptSentenceByCount,
  deriveProfilePhotoPromptSentenceParts,
} from "./profilePhotoPromptOverlayPresentation";

describe("deriveProfilePhotoPromptCta", () => {
  it("0 photos — Continue anyway, subtle", () => {
    const cta = deriveProfilePhotoPromptCta(0);
    expect(cta.showContinueAnyway).toBe(true);
    expect(cta.primaryLabel).toBe("Continue anyway");
    expect(cta.continueStyle).toBe("subtle");
    expect(cta.isComplete).toBe(false);
  });

  it("1 photo — Continue anyway", () => {
    const cta = deriveProfilePhotoPromptCta(1);
    expect(cta.showContinueAnyway).toBe(true);
    expect(cta.primaryLabel).toBe("Continue anyway");
    expect(cta.continueStyle).toBe("subtle");
  });

  it("2 photos — Continue (not anyway), medium emphasis", () => {
    const cta = deriveProfilePhotoPromptCta(2);
    expect(cta.showContinueAnyway).toBe(false);
    expect(cta.primaryLabel).toBe("Continue");
    expect(cta.continueStyle).toBe("medium");
    expect(cta.isComplete).toBe(false);
  });

  it("3 photos — primary Continue", () => {
    const cta = deriveProfilePhotoPromptCta(3);
    expect(cta.showContinueAnyway).toBe(false);
    expect(cta.primaryLabel).toBe("Continue");
    expect(cta.continueStyle).toBe("primary");
    expect(cta.isComplete).toBe(true);
  });

  it("respects custom labels", () => {
    const cta = deriveProfilePhotoPromptCta(3, {
      continueLabel: "Done",
      continueAnywayLabel: "Skip for now",
    });
    expect(cta.primaryLabel).toBe("Done");

    const partial = deriveProfilePhotoPromptCta(1, {
      continueAnywayLabel: "Done",
    });
    expect(partial.primaryLabel).toBe("Done");
  });
});

describe("deriveProfilePhotoPromptSentenceParts", () => {
  it("0 photos — accent Add two photos", () => {
    expect(deriveProfilePhotoPromptSentenceParts(0)).toEqual({
      accent: "Add two photos",
      rest: " so people know who they're making plans with.",
      full: "Add two photos so people know who they're making plans with.",
    });
  });

  it("1 photo — accent Add one more photo", () => {
    expect(deriveProfilePhotoPromptSentenceParts(1)).toEqual({
      accent: "Add one more photo",
      rest: " so people can get a better sense of you.",
      full: "Add one more photo so people can get a better sense of you.",
    });
  });

  it("2 photos — includes Add", () => {
    expect(deriveProfilePhotoPromptSentenceParts(2)).toEqual({
      accent: "Add one more photo",
      rest: " so people can get a fuller sense of you.",
      full: "Add one more photo so people can get a fuller sense of you.",
    });
  });
});

describe("deriveProfilePhotoPromptSentenceByCount", () => {
  it("0 photos — two photos encouragement", () => {
    expect(deriveProfilePhotoPromptSentenceByCount(0)).toBe(
      "Add two photos so people know who they're making plans with.",
    );
  });

  it("1 photo — one more encouragement", () => {
    expect(deriveProfilePhotoPromptSentenceByCount(1)).toBe(
      "Add one more photo so people can get a better sense of you.",
    );
  });

  it("2 photos — add one more fuller sense", () => {
    expect(deriveProfilePhotoPromptSentenceByCount(2)).toBe(
      "Add one more photo so people can get a fuller sense of you.",
    );
  });

  it("3 photos — empty (prompt should not open)", () => {
    expect(deriveProfilePhotoPromptSentenceByCount(3)).toBe("");
  });
});

describe("deriveProfilePhotoPromptSentence", () => {
  it("prefers title as single sentence", () => {
    expect(
      deriveProfilePhotoPromptSentence(
        "Add photos once so people know who they're pairing up with.",
        "ignored",
      ),
    ).toBe("Add photos once so people know who they're pairing up with.");
  });
});

describe("busy / close / continue guards", () => {
  it("disables continue and close while busy", () => {
    expect(canFireProfilePhotoPromptContinue(true)).toBe(false);
    expect(canCloseProfilePhotoPrompt(true)).toBe(false);
  });

  it("allows continue and close when idle", () => {
    expect(canFireProfilePhotoPromptContinue(false)).toBe(true);
    expect(canCloseProfilePhotoPrompt(false)).toBe(true);
  });
});

describe("close does not imply continue", () => {
  it("close guard is independent of photo count", () => {
    expect(canCloseProfilePhotoPrompt(false)).toBe(true);
    expect(canFireProfilePhotoPromptContinue(false)).toBe(true);
  });
});
