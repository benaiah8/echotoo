import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCreateFlowPublishRsvpCapacity } from "./createFlowPublishRsvp";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("resolveCreateFlowPublishRsvpCapacity", () => {
  it("new Create always publishes null, ignoring stale draft capacity", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: false,
        existingCapacity: 5,
      }),
    ).toBeNull();
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: false,
        existingCapacity: 10,
        confirmedTypeConversion: null,
      }),
    ).toBeNull();
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: false,
        existingCapacity: null,
      }),
    ).toBeNull();
  });

  it("fresh Event (no stored capacity) publishes null", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: false,
        existingCapacity: undefined,
      }),
    ).toBeNull();
  });

  it("ordinary published edit preserves numeric historical capacity", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: 5,
        confirmedTypeConversion: null,
      }),
    ).toBe(5);
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: 0,
      }),
    ).toBe(0);
  });

  it("published edit with no historical capacity stays null", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: null,
      }),
    ).toBeNull();
  });

  it("Event → Post conversion clears capacity (existing policy)", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: 5,
        confirmedTypeConversion: "experience",
      }),
    ).toBeNull();
  });

  it("Post → Event conversion cannot resurrect capacity", () => {
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: 5,
        confirmedTypeConversion: "hangout",
      }),
    ).toBeNull();
    expect(
      resolveCreateFlowPublishRsvpCapacity({
        isEditMode: true,
        existingCapacity: null,
        confirmedTypeConversion: "hangout",
      }),
    ).toBeNull();
  });
});

describe("Create/Edit RSVP configuration retirement (phase 2)", () => {
  it("legacy CreateCategoryPage has no RSVP control and cannot enable RSVP", () => {
    const src = read("src/pages/CreateCategoryPage.tsx");
    expect(src).not.toContain("RSVP capacity");
    expect(src).not.toContain("setRsvpEnabled");
    expect(src).not.toContain("HorizontalNumberWheel");
    expect(src).toContain("rsvpEnabled: false");
    expect(src).toContain("VisibilityPillToggle");
  });

  it("V4 Finalize has no RSVP panel and does not mount FinalizeRsvpPanel", () => {
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    const meta = read("src/components/create/CreateFinalizeMetaPanels.tsx");
    expect(finalize).not.toContain("FinalizeRsvpPanel");
    expect(finalize).not.toContain("setRsvpCapacity");
    expect(meta).toContain("export function FinalizeRsvpPanel");
  });

  it("new Create always sends null capacity into the shared publish helper", () => {
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("historicalRsvpCapacity");
    expect(finalize).toMatch(
      /rsvpCapacity:\s*isEditMode[\s\S]{0,80}historicalRsvpCapacity[\s\S]{0,40}:\s*null/,
    );
  });

  it("publish payload builders use the shared RSVP capacity helper for owner and admin", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("resolveCreateFlowPublishRsvpCapacity");
    expect(publish).toContain("rsvpCapacity: resolvedRsvpCapacity");
    const resolveAt = publish.indexOf("const resolvedRsvpCapacity");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(publish.indexOf("await adminRepublishPost"));
    expect(resolveAt).toBeLessThan(publish.indexOf("await ownerRepublishPost"));
    expect(resolveAt).toBeLessThan(publish.indexOf("await ownerCreatePost"));
  });

  it("Create/Edit persist does not overwrite historical rsvp_capacity", () => {
    expect(read("src/pages/CreateCategoryPage.tsx")).not.toContain(
      "parsed.rsvp_capacity",
    );
    expect(read("src/pages/CreateFinalizePage.tsx")).not.toContain(
      "parsed.rsvp_capacity",
    );
  });

  it("Create/Edit pages do not write rsvp_responses", () => {
    expect(read("src/pages/CreateFinalizePage.tsx")).not.toContain(
      "rsvp_responses",
    );
    expect(read("src/pages/CreateCategoryPage.tsx")).not.toContain(
      "rsvp_responses",
    );
    expect(read("src/lib/createFlowPublish.ts")).not.toContain("rsvp_responses");
    expect(read("src/lib/createFlowPublish.ts")).not.toContain("rsvp_going");
  });

  it("new-create hydrate ignores stale draft rsvpEnabled", () => {
    const src = read("src/pages/CreateFinalizePage.tsx");
    expect(src).toContain("rsvpEnabled: false");
    expect(src).not.toContain("rsvpEnabled: m.rsvpEnabled === true");
  });

  it("published edit still hydrates historical rsvp_capacity without RSVP UI", () => {
    const src = read("src/pages/CreateFinalizePage.tsx");
    expect(src).toContain("typeof ed.rsvp_capacity === \"number\" ? ed.rsvp_capacity");
    expect(src).toContain("editPostBootstrap");
    expect(read("src/lib/editPostBootstrap.ts")).toContain(
      "rsvp_capacity: post.rsvp_capacity ?? null",
    );
  });

  it("draft recovery and leave/republish wiring remain", () => {
    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("RESUME_DRAFT_SEARCH_PARAM");
    expect(finalize).toContain("CREATE_FLOW_REQUEST_PUBLISH_EVENT");
    expect(read("src/lib/createFlowLeaveGuard.ts")).toContain("rsvpEnabled");
    expect(read("src/lib/createFlowLeaveRepublish.test.ts")).toContain(
      "CREATE_FLOW_REQUEST_PUBLISH_EVENT",
    );
  });

  it("Event → Post published conversion copy still clears capacity, not responses", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain(
      "RSVP history will be kept, but Event RSVP capacity will be removed.",
    );
    expect(page).toContain("experience_to_hangout");
    expect(page).toContain("publishedOwnerConversionTargetType");
  });

  it("Phase 1 published RSVP UI removal remains intact", () => {
    expect(read("src/components/detail/PostDetailBody.tsx")).not.toContain(
      "RSVPComponent",
    );
    expect(read("src/components/ui/PostActions.tsx")).not.toContain(
      "RSVPComponent",
    );
    expect(read("src/components/Hangout.tsx")).not.toContain("RSVPComponent");
  });
});
