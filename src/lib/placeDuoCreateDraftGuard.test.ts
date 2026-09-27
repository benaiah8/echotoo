import { describe, expect, it } from "vitest";
import {
  isPlaceDuoCreateDraftDirty,
  resolvePlaceDuoCreateBackAction,
  resolvePlaceDuoCreateDismissRequest,
} from "./placeDuoCreateDraftGuard";

describe("isPlaceDuoCreateDraftDirty", () => {
  it("clean when note empty and no date/time", () => {
    expect(
      isPlaceDuoCreateDraftDirty({
        noteDraft: "   ",
        selectedDate: null,
        selectedTime: null,
      })
    ).toBe(false);
  });

  it("dirty when note non-empty", () => {
    expect(
      isPlaceDuoCreateDraftDirty({
        noteDraft: "hi",
        selectedDate: null,
        selectedTime: null,
      })
    ).toBe(true);
  });

  it("dirty when date selected", () => {
    expect(
      isPlaceDuoCreateDraftDirty({
        noteDraft: "",
        selectedDate: new Date(2026, 8, 18),
        selectedTime: null,
      })
    ).toBe(true);
  });

  it("dirty when time selected", () => {
    expect(
      isPlaceDuoCreateDraftDirty({
        noteDraft: "",
        selectedDate: null,
        selectedTime: { hours: 20, minutes: 0 },
      })
    ).toBe(true);
  });
});

describe("resolvePlaceDuoCreateBackAction", () => {
  const base = {
    createOpen: true,
    discardConfirmOpen: false,
    dirty: true,
    keyboardEditableFocused: false,
    busy: false,
  };

  it("blurs keyboard first when editable focused", () => {
    expect(
      resolvePlaceDuoCreateBackAction({
        ...base,
        keyboardEditableFocused: true,
      })
    ).toEqual({ kind: "blur-keyboard" });
  });

  it("dismisses discard confirm on second back (non-destructive)", () => {
    expect(
      resolvePlaceDuoCreateBackAction({
        ...base,
        discardConfirmOpen: true,
      })
    ).toEqual({ kind: "dismiss-discard-confirm" });
  });

  it("opens discard confirm when dirty", () => {
    expect(resolvePlaceDuoCreateBackAction(base)).toEqual({
      kind: "open-discard-confirm",
    });
  });

  it("closes overlay when clean", () => {
    expect(
      resolvePlaceDuoCreateBackAction({ ...base, dirty: false })
    ).toEqual({ kind: "close-overlay" });
  });

  it("noops when busy", () => {
    expect(
      resolvePlaceDuoCreateBackAction({ ...base, busy: true })
    ).toEqual({ kind: "noop-busy" });
  });
});

describe("resolvePlaceDuoCreateDismissRequest", () => {
  it("opens confirm when dirty", () => {
    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: true,
        busy: false,
      })
    ).toEqual({ kind: "open-discard-confirm" });
  });

  it("closes when clean", () => {
    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: false,
        dirty: false,
        busy: false,
      })
    ).toEqual({ kind: "close-overlay" });
  });

  it("noops while confirm already open", () => {
    expect(
      resolvePlaceDuoCreateDismissRequest({
        createOpen: true,
        discardConfirmOpen: true,
        dirty: true,
        busy: false,
      })
    ).toEqual({ kind: "noop-confirm-open" });
  });
});
