import { describe, expect, it } from "vitest";
import { classifyGroupUpMembershipViewerState } from "./groupUpMembershipViewerState";

describe("classifyGroupUpMembershipViewerState", () => {
  it("creator is owner even if also conversation admin", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "creator",
        opportunityCreatorIds: ["creator"],
        conversationRole: "admin",
      })
    ).toBe("owner");
  });

  it("non-creator member is member", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "member-1",
        opportunityCreatorIds: ["creator"],
        conversationRole: "member",
      })
    ).toBe("member");
  });

  it("non-creator conversation admin is NOT owner when opportunity exists", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "promoted-admin",
        opportunityCreatorIds: ["creator"],
        conversationRole: "admin",
      })
    ).toBe("member");
  });

  it("source-unavailable admin is owner", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "promoted-admin",
        opportunityCreatorIds: [],
        conversationRole: "admin",
        sourceUnavailable: true,
      })
    ).toBe("owner");
  });

  it("source-unavailable created_by is owner", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "host",
        opportunityCreatorIds: [],
        conversationRole: "member",
        conversationCreatedBy: "host",
        sourceUnavailable: true,
      })
    ).toBe("owner");
  });

  it("source-unavailable non-admin member stays member", () => {
    expect(
      classifyGroupUpMembershipViewerState({
        viewerUserId: "member-1",
        opportunityCreatorIds: [],
        conversationRole: "member",
        conversationCreatedBy: "host",
        sourceUnavailable: true,
      })
    ).toBe("member");
  });
});
