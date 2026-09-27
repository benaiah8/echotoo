import { describe, expect, it, vi } from "vitest";

vi.mock("../showOpenPlanJoinToast", () => ({
  dismissOpenPlanJoinToast: vi.fn(),
}));

import { dismissOpenPlanJoinToast } from "../showOpenPlanJoinToast";
import {
  closeOpenPlanOverlay,
  openOpenPlanCreate,
  openOpenPlanManage,
} from "../openPlanActiveOverlayStore";

const dismissMock = vi.mocked(dismissOpenPlanJoinToast);

describe("openPlanActiveOverlayStore toast parity", () => {
  it("dismisses open-plan-join toast when create opens", () => {
    dismissMock.mockClear();
    openOpenPlanCreate("post-a");
    expect(dismissMock).toHaveBeenCalledWith("post-a");
    closeOpenPlanOverlay();
  });

  it("dismisses open-plan-join toast when manage opens", () => {
    dismissMock.mockClear();
    openOpenPlanManage("post-b");
    expect(dismissMock).toHaveBeenCalledWith("post-b");
    closeOpenPlanOverlay();
  });
});
