import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/services/groupUp", () => ({
  requestGroupUp: vi.fn(),
  withdrawGroupUpRequest: vi.fn(),
  classifyGroupUpRequestError: vi.fn(() => "other"),
}));

vi.mock("../showGroupUpRequestToast", () => ({
  showGroupUpRequestToast: vi.fn(),
  showGroupUpWithdrawnToast: vi.fn(),
  dismissGroupUpRequestToast: vi.fn(),
}));

import {
  requestGroupUp,
  withdrawGroupUpRequest,
} from "../../api/services/groupUp";
import {
  showGroupUpRequestToast,
  showGroupUpWithdrawnToast,
  dismissGroupUpRequestToast,
} from "../showGroupUpRequestToast";
import {
  __resetGroupUpSourceListCacheForTests,
  getGroupUpSourceListEntry,
  patchSourceGroupViewerState,
  setGroupUpSourceListPage,
} from "../groupUpSourceListCache";
import {
  __resetSourceGroupRequestFlightsForTests,
  getSourceGroupRequestFlight,
  isSourceGroupRequestBusy,
  runSourceGroupRequest,
  runSourceGroupWithdraw,
} from "../sourceGroupRequestActions";
import type { SourceGroupRow } from "../social/sourceGroupTypes";

const requestGroupUpMock = vi.mocked(requestGroupUp);
const withdrawMock = vi.mocked(withdrawGroupUpRequest);
const showToastMock = vi.mocked(showGroupUpRequestToast);
const showWithdrawnToastMock = vi.mocked(showGroupUpWithdrawnToast);
const dismissToastMock = vi.mocked(dismissGroupUpRequestToast);

function makeRow(
  opportunityId: string,
  viewer_state: SourceGroupRow["viewer_state"] = "none",
  request_id: string | null = null
): SourceGroupRow {
  return {
    opportunity_id: opportunityId,
    conversation_id: `c-${opportunityId}`,
    source_post_id: "src-1",
    group_title: "G",
    group_description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    source_type: "hangout",
    organizer_user_id: "org",
    organizer_display_name: null,
    organizer_username: null,
    organizer_avatar_url: null,
    organizer_echo_preset: null,
    member_count: 1,
    viewer_state,
    request_id,
  };
}

describe("sourceGroupRequestActions", () => {
  beforeEach(() => {
    __resetGroupUpSourceListCacheForTests();
    __resetSourceGroupRequestFlightsForTests();
    vi.clearAllMocks();
    setGroupUpSourceListPage("src-1", {
      candidates: [makeRow("o1", "none")],
      has_more: false,
      next_cursor: null,
    });
  });

  it("request tap → optimistic pending then stores request_id", async () => {
    let resolveReq!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveReq = r;
      }) as never
    );

    const p = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });

    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "pending"
    );
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].request_id).toBeNull();
    expect(isSourceGroupRequestBusy("o1")).toBe(true);
    expect(getSourceGroupRequestFlight("o1")?.phase).toBe("requesting");

    resolveReq({ id: "r1", status: "pending" });
    await p;

    expect(getGroupUpSourceListEntry("src-1")?.rows[0].request_id).toBe("r1");
    expect(showToastMock).toHaveBeenCalledWith("o1", expect.any(Function));
    expect(isSourceGroupRequestBusy("o1")).toBe(false);
  });

  it("Requested tap / Undo calls shared withdraw → none", async () => {
    patchSourceGroupViewerState("src-1", "o1", {
      viewer_state: "pending",
      request_id: "r1",
    });
    withdrawMock.mockResolvedValue({
      id: "r1",
      status: "withdrawn",
    } as never);

    await runSourceGroupWithdraw({
      sourcePostId: "src-1",
      opportunityId: "o1",
      prevRequestId: "r1",
      showRemovedToast: true,
    });

    expect(withdrawMock).toHaveBeenCalledWith("o1");
    expect(dismissToastMock).toHaveBeenCalledWith("o1");
    expect(showWithdrawnToastMock).toHaveBeenCalledWith("o1");
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "none"
    );
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].request_id).toBeNull();
  });

  it("toast Undo withdraws without Request withdrawn toast", async () => {
    patchSourceGroupViewerState("src-1", "o1", {
      viewer_state: "pending",
      request_id: "r1",
    });
    withdrawMock.mockResolvedValue({
      id: "r1",
      status: "withdrawn",
    } as never);

    await runSourceGroupWithdraw({
      sourcePostId: "src-1",
      opportunityId: "o1",
      prevRequestId: "r1",
      showRemovedToast: false,
    });

    expect(showWithdrawnToastMock).not.toHaveBeenCalled();
  });

  it("withdraw error rolls back to pending", async () => {
    patchSourceGroupViewerState("src-1", "o1", {
      viewer_state: "pending",
      request_id: "r1",
    });
    withdrawMock.mockRejectedValue(new Error("fail"));

    await runSourceGroupWithdraw({
      sourcePostId: "src-1",
      opportunityId: "o1",
      prevRequestId: "r1",
    });

    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "pending"
    );
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].request_id).toBe("r1");
  });

  it("request error rolls back to none and dismisses toast", async () => {
    requestGroupUpMock.mockRejectedValue(new Error("fail"));

    await runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });

    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "none"
    );
    expect(dismissToastMock).toHaveBeenCalledWith("o1");
  });

  it("toast Undo uses the same withdraw path", async () => {
    requestGroupUpMock.mockResolvedValue({
      id: "r1",
      status: "pending",
    } as never);
    withdrawMock.mockResolvedValue({
      id: "r1",
      status: "withdrawn",
    } as never);

    await runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });

    const onUndo = showToastMock.mock.calls[0]?.[1] as () => void;
    expect(onUndo).toBeTypeOf("function");
    onUndo();
    await vi.waitFor(() => {
      expect(withdrawMock).toHaveBeenCalledWith("o1");
    });
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "none"
    );
  });

  it("direct withdraw during request marks undoAfter and skips duplicate request", async () => {
    let resolveReq!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveReq = r;
      }) as never
    );
    withdrawMock.mockResolvedValue({
      id: "r1",
      status: "withdrawn",
    } as never);

    const reqPromise = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });

    await runSourceGroupWithdraw({
      sourcePostId: "src-1",
      opportunityId: "o1",
      prevRequestId: null,
    });

    expect(getSourceGroupRequestFlight("o1")).toMatchObject({
      phase: "requesting",
      undoAfter: true,
    });
    expect(getGroupUpSourceListEntry("src-1")?.rows[0].viewer_state).toBe(
      "none"
    );
    expect(dismissToastMock).toHaveBeenCalledWith("o1");

    resolveReq({ id: "r1", status: "pending" });
    await reqPromise;

    expect(withdrawMock).toHaveBeenCalledWith("o1");
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it("in-flight guard prevents duplicate request mutations", async () => {
    let resolveReq!: (v: { id: string; status: string }) => void;
    requestGroupUpMock.mockReturnValue(
      new Promise((r) => {
        resolveReq = r;
      }) as never
    );

    const a = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });
    const b = runSourceGroupRequest({
      sourcePostId: "src-1",
      row: makeRow("o1", "none"),
    });

    expect(requestGroupUpMock).toHaveBeenCalledTimes(1);
    resolveReq({ id: "r1", status: "pending" });
    await Promise.all([a, b]);
    expect(requestGroupUpMock).toHaveBeenCalledTimes(1);
  });

  it("does not withdraw without request_id when idle", async () => {
    await runSourceGroupWithdraw({
      sourcePostId: "src-1",
      opportunityId: "o1",
      prevRequestId: null,
    });
    expect(withdrawMock).not.toHaveBeenCalled();
  });
});
