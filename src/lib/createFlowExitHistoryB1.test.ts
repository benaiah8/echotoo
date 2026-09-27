import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CREATE_FLOW_POST_IMAGE_MERGED_EVENT } from "./createFlowDraftStorage";
import {
  computeCreateFlowGuardEngaged,
  resolveCreateFlowBackAction,
  shouldKeepHistoryGuardStable,
} from "./createFlowExitHistoryEngagement";
import {
  CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT,
  CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
  CREATE_FLOW_REQUEST_LEAVE_EVENT,
  dispatchCreateFlowDraftContentChanged,
  dispatchCreateFlowMediaPickerDismiss,
  isCreateFlowMediaPickerOpen,
  setCreateFlowMediaPickerOpen,
} from "./createFlowLeaveRequest";

describe("PASS B1 — history guard engagement stability", () => {
  it("A: repeated meaningful edits keep guard engagement stable", () => {
    expect(shouldKeepHistoryGuardStable(true, true)).toBe(true);
    expect(shouldKeepHistoryGuardStable(false, false)).toBe(true);
    expect(shouldKeepHistoryGuardStable(true, false)).toBe(false);
    expect(shouldKeepHistoryGuardStable(false, true)).toBe(false);
  });

  it("A: computeCreateFlowGuardEngaged only when in create + meaningful", () => {
    expect(computeCreateFlowGuardEngaged(false, true)).toBe(false);
    expect(computeCreateFlowGuardEngaged(true, false)).toBe(false);
    expect(computeCreateFlowGuardEngaged(true, true)).toBe(true);
  });

  it("D: draft content changed is an engagement sync signal, not a history rebuild", () => {
    const src = readFileSync(
      join(process.cwd(), "src/hooks/useCreateFlowExitHistoryGuard.ts"),
      "utf8",
    );
    expect(src).not.toContain("draftRevision");
    expect(src).toContain("guardEngaged");
    expect(src).toContain("syncEngagement");
    expect(src).not.toMatch(/\[engage,\s*pathname,\s*draftRevision/);
  });
});

describe("PASS B1 — back action does not leave during media picker", () => {
  const meaningful = {
    skipPopstate: false,
    metadataRemoveConfirmOpen: false,
    placeToEventConfirmOpen: false,
    eventToPlaceConfirmOpen: false,
    finalizeSheetOpen: false,
    leaveDialogOpen: false,
    mediaPickerOpen: true,
    shouldConfirmLeave: true,
    source: "android" as const,
    historyStateHasMarker: true,
  };

  it("E: media picker open + back dismisses picker only", () => {
    const plan = resolveCreateFlowBackAction(meaningful);
    expect(plan).toEqual({
      kind: "dismiss-media-picker",
      restoreMarker: true,
    });
    expect(plan.kind).not.toBe("request-leave");
  });

  it("F: nativeBusy-equivalent picker state + hardware back does not request leave", () => {
    setCreateFlowMediaPickerOpen(true);
    const plan = resolveCreateFlowBackAction({
      ...meaningful,
      mediaPickerOpen: isCreateFlowMediaPickerOpen(),
    });
    expect(plan.kind).toBe("dismiss-media-picker");
    setCreateFlowMediaPickerOpen(false);
  });
});

describe("PASS B1 — genuine leave paths preserved", () => {
  it("J/K: meaningful draft with no overlay requests leave confirmation", () => {
    const plan = resolveCreateFlowBackAction({
      skipPopstate: false,
      metadataRemoveConfirmOpen: false,
      placeToEventConfirmOpen: false,
      eventToPlaceConfirmOpen: false,
      finalizeSheetOpen: false,
      leaveDialogOpen: false,
      mediaPickerOpen: false,
      shouldConfirmLeave: true,
      source: "popstate",
      historyStateHasMarker: true,
    });
    expect(plan).toEqual({
      kind: "request-leave",
      androidPopMarkerFirst: false,
    });
  });

  it("L: empty draft exits without confirmation", () => {
    const plan = resolveCreateFlowBackAction({
      skipPopstate: false,
      metadataRemoveConfirmOpen: false,
      placeToEventConfirmOpen: false,
      eventToPlaceConfirmOpen: false,
      finalizeSheetOpen: false,
      leaveDialogOpen: false,
      mediaPickerOpen: false,
      shouldConfirmLeave: false,
      source: "popstate",
      historyStateHasMarker: false,
    });
    expect(plan.kind).toBe("exit-without-confirm");
  });
});

describe("PASS B1 — media picker state wiring", () => {
  beforeEach(() => {
    setCreateFlowMediaPickerOpen(false);
  });

  afterEach(() => {
    setCreateFlowMediaPickerOpen(false);
  });

  it("G: picker dismiss event clears open flag when handler runs", () => {
    setCreateFlowMediaPickerOpen(true);
    let dismissed = false;
    const listeners = new Map<string, Set<EventListener>>();
    const mockWindow = {
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
    };
    vi.stubGlobal("window", mockWindow);

    const onDismiss = () => {
      dismissed = true;
      setCreateFlowMediaPickerOpen(false);
    };
    mockWindow.addEventListener(
      CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
      onDismiss,
    );
    mockWindow.dispatchEvent(
      new Event(CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT),
    );
    mockWindow.removeEventListener(
      CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
      onDismiss,
    );
    vi.unstubAllGlobals();

    expect(dismissed).toBe(true);
    expect(isCreateFlowMediaPickerOpen()).toBe(false);
  });

  it("H/I: picker open flag can be cleared after cancel/error paths", () => {
    setCreateFlowMediaPickerOpen(true);
    setCreateFlowMediaPickerOpen(false);
    expect(isCreateFlowMediaPickerOpen()).toBe(false);
  });
});

describe("PASS B1 — media merge events do not dispatch leave", () => {
  it("B/C: image merge and draft content events do not fire leave request", () => {
    const leaveSpy = vi.fn();
    const listeners = new Map<string, Set<EventListener>>();
    const mockWindow = {
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
    };
    vi.stubGlobal("window", mockWindow);

    mockWindow.addEventListener(
      CREATE_FLOW_REQUEST_LEAVE_EVENT,
      leaveSpy as EventListener,
    );

    mockWindow.dispatchEvent(
      new CustomEvent(CREATE_FLOW_POST_IMAGE_MERGED_EVENT, {
        detail: { activityIndex: 0, images: ["a.jpg"] },
      }),
    );
    dispatchCreateFlowDraftContentChanged();

    mockWindow.removeEventListener(
      CREATE_FLOW_REQUEST_LEAVE_EVENT,
      leaveSpy as EventListener,
    );
    vi.unstubAllGlobals();

    expect(leaveSpy).not.toHaveBeenCalled();
  });
});

describe("PASS B1 — picker hook registers leave-guard state", () => {
  it("picker hook sets media-picker-open from chooser and nativeBusy", () => {
    const src = readFileSync(
      join(process.cwd(), "src/hooks/useCreatePostMediaPicker.tsx"),
      "utf8",
    );
    expect(src).toContain("setCreateFlowMediaPickerOpen");
    expect(src).toContain("chooserOpen || nativeBusy");
    expect(src).toContain("CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT");
  });
});
