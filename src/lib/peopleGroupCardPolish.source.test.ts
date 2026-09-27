/**
 * Groups card polish — host notch / title / Join CTA / media diagnostic (source).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups card polish (source)", () => {
  it("1–5: host notch centered, content-sized, clickable pill", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("inset-x-3 top-3");
    expect(media).toContain("flex justify-center");
    expect(media).toContain("data-people-group-host-slot");

    const notch = read("components/people/PeopleGroupHostNotch.tsx");
    expect(notch).toContain("w-max");
    expect(notch).toContain("max-w-[min(100%,18rem)]");
    expect(notch).not.toContain("flex-1");
    expect(notch).toContain("AVATAR_PX = 28");
    expect(notch).toContain('type="button"');
    expect(notch).toContain("data-people-group-host-hit");
    expect(notch).toContain("peopleIdentityMovedPastTapThreshold");
    expect(notch).toContain("onOpenProfile");
    expect(notch).toContain("px-2 py-1.5");
    expect(notch).toContain("gap-1.5");
    expect(notch).toContain("text-[13px]");
  });

  it("6–8: Groups host opens embedded Profile; Back only; same opportunity", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("createGroupHostProfileOpenContext");
    expect(overlay).toContain("openGroupHostProfile");
    expect(overlay).toContain("onOpenHostProfile={openGroupHostProfile}");
    expect(overlay).toContain("isMineCandidateProfileOpenContext");

    const profileOverlay = read(
      "components/people/MineCandidateProfileOverlay.tsx",
    );
    expect(profileOverlay).toContain("PeopleEmbeddedProfileOpen");
    expect(profileOverlay).toContain('open.scope === "my_plans"');
    expect(profileOverlay).toContain('data-people-embedded-profile-scope');

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("onOpenHostProfile");
    expect(body).toContain("onOpenHostProfile(row)");
  });

  it("9–10: title band + line-clamp; chrome inset via GROUP_MEDIA_NAV_INSET_PX", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("pt-14");
    expect(media).toContain("GROUP_MEDIA_NAV_INSET_PX");
    expect(media).toContain("data-people-group-title-band");
    expect(media).toContain("line-clamp-2");
  });

  it("11–15: Join copy; Requested/Open + mutations unchanged", () => {
    const copy = read("pages/people/peopleUiCopy.ts");
    expect(copy).toMatch(/groupUpShellRequest:\s*"Join"/);
    expect(copy).toContain('groupUpBrowseRequested: "Requested"');

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("peopleUiCopy.groupUpShellRequest");
    expect(body).toContain("handleJoin");
    expect(body).toContain("requestGroupUp");
    expect(body).toContain("peopleUiCopy.groupUpBrowseRequested");
    expect(body).toContain("withdrawGroupUpRequest");
    expect(body).toContain("peopleUiCopy.groupUpShellOpen");
    expect(body).toContain('labelKey === "request"');
  });

  it("16–18: Groups media handoff; no per-card fetch; debug removed", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("publishedMediaByPostId[sourcePostId]");
    expect(body).toContain("!row.source_unavailable");
    expect(body).not.toContain("getOrFetchPublishedMedia(");
    expect(body).not.toContain("ensureGroupUpPublishedMediaMap");
    expect(body).not.toContain("[GroupMediaDebug]");
  });

  it("19–22: New/Yours browse + Duo/Discover/Plans cards unchanged by polish", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");

    const duo = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(duo).toContain("PeopleCanonicalCandidatePresentation");
    expect(duo).not.toContain("PeopleGroupHostNotch");

    const plans = read("components/people/PeopleOpenPlanCandidateSlide.tsx");
    expect(plans).toContain("onOpenProfile={undefined}");
    expect(plans).not.toContain("PeopleGroupHostNotch");
  });
});
