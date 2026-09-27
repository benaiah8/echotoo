import { describe, expect, it } from "vitest";
import {
  createFlowPrimaryCtaLabel,
  postTypeCompactLabel,
  postTypeHomeFilterLabel,
  postTypeInvitePrefix,
  postTypeNotificationPhrase,
} from "./postTypeLabels";

describe("postTypeLabels (Phase C Event / Post)", () => {
  it("compact experience label is Post; hangout stays Event", () => {
    expect(postTypeCompactLabel("experience")).toBe("Post");
    expect(postTypeCompactLabel("hangout")).toBe("Event");
  });

  it("Home filter label uses Posts for experiences", () => {
    expect(postTypeHomeFilterLabel("experiences")).toBe("Posts");
    expect(postTypeHomeFilterLabel("hangouts")).toBe("Events");
    expect(postTypeHomeFilterLabel("all")).toBeNull();
  });

  it("Create CTA Publish Post / Publish Event", () => {
    expect(
      createFlowPrimaryCtaLabel({ isEditMode: false, type: "experience" }),
    ).toBe("Publish Post");
    expect(
      createFlowPrimaryCtaLabel({ isEditMode: false, type: "hangout" }),
    ).toBe("Publish Event");
    expect(
      createFlowPrimaryCtaLabel({ isEditMode: true, type: "experience" }),
    ).toBe("Save");
  });

  it("invite prefix and notification phrase use Post", () => {
    expect(postTypeInvitePrefix("experience")).toBe("Post:");
    expect(postTypeInvitePrefix("hangout")).toBe("Event:");
    expect(postTypeNotificationPhrase("experience")).toBe("a post");
    expect(postTypeNotificationPhrase("hangout")).toBe("an event");
  });
});
