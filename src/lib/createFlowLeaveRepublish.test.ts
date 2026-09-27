/**
 * Published-edit leave dialog: Stay / Discard and exit / Republish bridge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_FLOW_REQUEST_PUBLISH_EVENT,
  dispatchCreateFlowPublishRequest,
} from "./createFlowLeaveRequest";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("dispatchCreateFlowPublishRequest", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      dispatchEvent: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("dispatches CREATE_FLOW_REQUEST_PUBLISH_EVENT only", () => {
    dispatchCreateFlowPublishRequest();
    const win = globalThis as unknown as {
      window: { dispatchEvent: ReturnType<typeof vi.fn> };
    };
    expect(win.window.dispatchEvent).toHaveBeenCalledTimes(1);
    const evt = win.window.dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe(CREATE_FLOW_REQUEST_PUBLISH_EVENT);
  });
});

describe("published-edit leave Republish wiring (source)", () => {
  const bottomTab = () => readRepo("src/components/BottomTab.tsx");
  const finalize = () => readRepo("src/pages/CreateFinalizePage.tsx");
  const leaveBus = () => readRepo("src/lib/createFlowLeaveRequest.ts");

  it("published Edit leave dialog shows Stay, Exit+icon Discard, and Republish as pills", () => {
    const src = bottomTab();
    expect(src).toContain('cancelLabel="Stay"');
    expect(src).toContain("pillButtons={isEditMode}");
    expect(src).toContain('secondaryLabel: "Republish"');
    expect(src).toContain("PiSignOut");
    expect(src).toContain('confirmVariant: "orange"');
    expect(src).toContain("<span>Exit</span>");
    expect(src).toContain("Discard and exit");
    expect(src).not.toContain('confirmLabel: "Discard and exit"');
  });

  it("fresh Create leave dialog remains Save draft + Discard", () => {
    const src = bottomTab();
    expect(src).toContain('secondaryLabel: "Save draft"');
    expect(src).toContain('confirmLabel: "Discard"');
    // Republish only in isEditMode branch — Save draft branch must not dispatch publish
    const saveDraftIdx = src.indexOf('secondaryLabel: "Save draft"');
    const saveDraftBlock = src.slice(saveDraftIdx, saveDraftIdx + 450);
    expect(saveDraftBlock).toContain("runStashedLeaveNavigation");
    expect(saveDraftBlock).not.toContain("dispatchCreateFlowPublishRequest");
  });

  it("Republish closes leave dialog and clears pending navigation before publish", () => {
    const src = bottomTab();
    const republishIdx = src.indexOf('secondaryLabel: "Republish"');
    const block = src.slice(republishIdx, republishIdx + 400);
    expect(block).toContain("setLeaveOpen(false)");
    expect(block).toContain("navTargetRef.current = null");
    expect(block).toContain("dispatchCreateFlowPublishRequest()");
    expect(block).not.toContain("runStashedLeaveNavigation");
    expect(block).not.toContain("removeItem(EDIT_POST_DATA_KEY)");
  });

  it("Discard still clears edit bootstrap and runs stashed leave", () => {
    const src = bottomTab();
    const discardIdx = src.indexOf('confirmVariant: "orange"');
    expect(discardIdx).toBeGreaterThan(-1);
    const block = src.slice(discardIdx, discardIdx + 350);
    expect(block).toContain("discardOwnerPublishedEditLocalState()");
    expect(block).toContain("runStashedLeaveNavigation()");
    expect(block).not.toContain("dispatchCreateFlowPublishRequest");
  });

  it("CreateFinalizePage listens and invokes requestPublish only", () => {
    const src = finalize();
    expect(src).toContain("CREATE_FLOW_REQUEST_PUBLISH_EVENT");
    expect(src).toContain("requestPublishRef.current()");
    expect(src).not.toMatch(
      /CREATE_FLOW_REQUEST_PUBLISH_EVENT[\s\S]{0,400}executeCreateFlowPublish/,
    );
    const listenStart = src.indexOf("/** Leave-dialog Republish");
    expect(listenStart).toBeGreaterThan(-1);
    const listenBlock = src.slice(listenStart, listenStart + 700);
    expect(listenBlock).toContain("requestPublishRef.current()");
    expect(listenBlock).not.toContain("dispatchCreateFlowLeaveRequest");
    expect(listenBlock).not.toContain("executeCreateFlowPublish");
  });

  it("requestPublish retains caption, conversion, and republish modal gates", () => {
    const src = finalize();
    const start = src.indexOf("const requestPublish = () => {");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, start + 1200);
    expect(fn).toContain("!caption.trim()");
    expect(fn).toContain("resolvePublishedEditScheduleSaveDecision");
    expect(fn).toContain("setPublishedTypeConversionKind");
    expect(fn).toContain("setPublishModalOpen(true)");
  });

  it("guards rapid leave-dialog Republish while modal/conversion/publish active", () => {
    const src = finalize();
    const start = src.indexOf("/** Leave-dialog Republish");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 700);
    expect(block).toContain("publishing || publishInFlightRef.current");
    expect(block).toContain("publishModalOpen || publishedTypeConversionKind");
  });

  it("edit success still uses navigateAfterEditPublish once (not leave stash)", () => {
    const src = finalize();
    expect(src).toContain("navigateAfterEditPublish(nav, { returnPath, returnState })");
    expect(src).not.toContain(
      "runStashedLeaveNavigation after navigateAfterEditPublish",
    );
    // Success path must not call leave-dialog stash helper (BottomTab-only)
    const successIdx = src.indexOf("navigateAfterEditPublish(nav,");
    const successBlock = src.slice(successIdx - 200, successIdx + 120);
    expect(successBlock).not.toContain("dispatchCreateFlowLeaveRequest");
  });

  it("owner and admin share the same publish request bridge", () => {
    const bus = leaveBus();
    expect(bus).toContain("CREATE_FLOW_REQUEST_PUBLISH_EVENT");
    expect(bus).toContain("dispatchCreateFlowPublishRequest");
    const src = finalize();
    const listenStart = src.indexOf("/** Leave-dialog Republish");
    expect(listenStart).toBeGreaterThan(-1);
    const listenBlock = src.slice(listenStart, listenStart + 800);
    expect(listenBlock).toMatch(/if\s*\(\s*!isEditMode\s*\)\s*return/);
    expect(listenBlock).not.toContain("isAdminEdit");
  });

  it("does not alter createFlowPublish or empty Create X path", () => {
    const publish = readRepo("src/lib/createFlowPublish.ts");
    expect(publish).not.toContain("CREATE_FLOW_REQUEST_PUBLISH_EVENT");
    const finalizeSrc = finalize();
    expect(finalizeSrc).toContain("showEmptyComposerExit");
    expect(finalizeSrc).toContain("handleLeaveCreateFlow");
  });

  it("Android Back leave-dialog dismiss path remains in leave bus", () => {
    const bus = leaveBus();
    expect(bus).toContain("CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT");
    expect(bus).toContain("dispatchCreateFlowLeaveDialogDismiss");
    const guard = readRepo("src/hooks/useCreateFlowExitHistoryGuard.ts");
    expect(guard).toContain("dismiss-leave-dialog");
    expect(guard).toContain("dispatchCreateFlowLeaveDialogDismiss");
  });
});
