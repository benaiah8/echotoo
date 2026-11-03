import { describe, expect, it } from "vitest";
import { resolveOpenPlanRequesterNameLabel } from "./openPlanRequesterNameLabel";

describe("resolveOpenPlanRequesterNameLabel", () => {
  it("prefers a permitted display name", () => {
    expect(
      resolveOpenPlanRequesterNameLabel({
        display_name: " Ada ",
        profile_open_key: "ada",
      })
    ).toEqual({ label: "Ada", kind: "named" });
  });

  it("uses Name hidden only for intentional anonymity", () => {
    expect(
      resolveOpenPlanRequesterNameLabel({
        display_name: null,
        profile_open_key: null,
      })
    ).toEqual({ label: "Name hidden", kind: "anonymous" });
  });

  it("uses Someone when identity was disclosed but the name is empty", () => {
    expect(
      resolveOpenPlanRequesterNameLabel({
        display_name: "  ",
        profile_open_key: "ada",
      })
    ).toEqual({ label: "Someone", kind: "missing" });
  });
});
