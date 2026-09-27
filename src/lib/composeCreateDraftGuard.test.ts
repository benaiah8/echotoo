import { describe, expect, it } from "vitest";
import {
  isGroupCreateDraftDirty,
  resolveComposeCreateBackAction,
  resolveComposeCreateDismissRequest,
} from "./composeCreateDraftGuard";

describe("isGroupCreateDraftDirty", () => {
  it("clean when both empty", () => {
    expect(
      isGroupCreateDraftDirty({ titleDraft: "  ", descriptionDraft: "" })
    ).toBe(false);
  });

  it("dirty when title set", () => {
    expect(
      isGroupCreateDraftDirty({ titleDraft: "Crew", descriptionDraft: "" })
    ).toBe(true);
  });

  it("dirty when description set", () => {
    expect(
      isGroupCreateDraftDirty({ titleDraft: "", descriptionDraft: "plan" })
    ).toBe(true);
  });
});

describe("resolveComposeCreateBackAction", () => {
  const base = {
    createOpen: true,
    discardConfirmOpen: false,
    dirty: true,
    keyboardEditableFocused: false,
    busy: false,
  };

  it("blurs keyboard first", () => {
    expect(
      resolveComposeCreateBackAction({
        ...base,
        keyboardEditableFocused: true,
      })
    ).toEqual({ kind: "blur-keyboard" });
  });

  it("dismisses confirm on second back", () => {
    expect(
      resolveComposeCreateBackAction({
        ...base,
        discardConfirmOpen: true,
      })
    ).toEqual({ kind: "dismiss-discard-confirm" });
  });

  it("opens confirm when dirty", () => {
    expect(resolveComposeCreateBackAction(base)).toEqual({
      kind: "open-discard-confirm",
    });
  });
});

describe("resolveComposeCreateDismissRequest", () => {
  it("opens confirm when dirty", () => {
    expect(
      resolveComposeCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: true,
        busy: false,
      })
    ).toEqual({ kind: "open-discard-confirm" });
  });
});
