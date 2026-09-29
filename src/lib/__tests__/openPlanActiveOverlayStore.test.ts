import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../showOpenPlanJoinToast", () => ({
  dismissOpenPlanJoinToast: vi.fn(),
}));

import { dismissOpenPlanJoinToast } from "../showOpenPlanJoinToast";
import {
  __resetOpenPlanActiveOverlayForTests,
  closeOpenPlanOverlay,
  openOpenPlanCreate,
  openOpenPlanManage,
} from "../openPlanActiveOverlayStore";

const dismissMock = vi.mocked(dismissOpenPlanJoinToast);

describe("openPlanActiveOverlayStore toast parity", () => {
  beforeEach(() => {
    __resetOpenPlanActiveOverlayForTests();
    dismissMock.mockClear();
  });

  it("dismisses open-plan-join toast when create opens", () => {
    openOpenPlanCreate("post-a");
    expect(dismissMock).toHaveBeenCalledWith("post-a");
    closeOpenPlanOverlay();
  });

  it("dismisses open-plan-join toast when manage opens", () => {
    openOpenPlanManage("post-b");
    expect(dismissMock).toHaveBeenCalledWith("post-b");
    closeOpenPlanOverlay();
  });
});
