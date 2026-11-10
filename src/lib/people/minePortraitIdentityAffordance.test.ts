import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX,
  PEOPLE_MINE_IDENTITY_LEFT_INSET_PX,
  PEOPLE_MINE_IDENTITY_TOP_INSET_PX,
  resolveDuoPortraitScrim,
} from "../../components/people/MinePortraitIdentityOverlay";

const OVERLAY_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MinePortraitIdentityOverlay.tsx"),
  "utf8"
);
const SLIDE_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const DUO_SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);
const MEDIA_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleCandidateMedia.tsx"),
  "utf8"
);
const MATCH_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
  "utf8"
);

describe("Mine portrait identity affordance (top-center)", () => {
  it("places name + profile icon at top-center with ~12px top inset", () => {
    expect(PEOPLE_MINE_IDENTITY_TOP_INSET_PX).toBe(12);
    expect(PEOPLE_MINE_IDENTITY_LEFT_INSET_PX).toBe(12);
    expect(PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX).toBe(52);
    expect(OVERLAY_SRC).toContain('data-people-mine-identity-top="true"');
    /* Deck keeps top-center; Discover feed uses top-left (clears fullscreen right). */
    expect(OVERLAY_SRC).toContain('"top-center"');
    expect(OVERLAY_SRC).toContain('"top-left"');
    expect(OVERLAY_SRC).toContain("top: PEOPLE_MINE_IDENTITY_TOP_INSET_PX");
    expect(OVERLAY_SRC).toContain("left-1/2");
    expect(OVERLAY_SRC).toContain("-translate-x-1/2");
    expect(OVERLAY_SRC).toContain(
      "PEOPLE_MINE_IDENTITY_FULLSCREEN_CLEAR_PX * 2"
    );
    expect(OVERLAY_SRC).toContain("feedLayout");
    expect(OVERLAY_SRC).toContain("truncate");
    expect(OVERLAY_SRC).toContain("text-[16px]");
    expect(OVERLAY_SRC).not.toContain("text-[17px]");
    expect(OVERLAY_SRC).toContain("data-people-mine-profile-name-hit");
    expect(OVERLAY_SRC).toContain("data-people-mine-profile-icon-hit");
    expect(OVERLAY_SRC).toContain("PiArrowSquareOutBold");
  });

  it("only name and icon open Profile — not row whitespace or bio", () => {
    // Two discrete profile hits (name + icon), not one full-width row button.
    expect(OVERLAY_SRC).toContain("data-people-mine-profile-name-hit");
    expect(OVERLAY_SRC).toContain("data-people-mine-profile-icon-hit");
    expect(OVERLAY_SRC).not.toMatch(
      /min-h-11[\s\S]{0,80}max-w-full[\s\S]{0,120}deckOpenProfile/
    );
    expect(OVERLAY_SRC).not.toMatch(
      /className=\{`pointer-events-auto[^`]*max-w-full[^`]*\$\{NAME_ROW/
    );
    // Bio region is separate and must not carry profile-hit.
    expect(OVERLAY_SRC).toContain("data-people-mine-identity-bio-region");
    expect(OVERLAY_SRC).toContain("data-people-mine-bio-hit");
    const bioBlock = OVERLAY_SRC.match(
      /data-people-mine-identity-bio-region[\s\S]*$/
    )?.[0];
    expect(bioBlock).toBeTruthy();
    expect(bioBlock).not.toContain("data-people-mine-profile-hit");
    expect(bioBlock).not.toContain("openProfile");
    expect(bioBlock).not.toContain("onOpenProfile");
  });

  it("outer identity shell is pointer-events-none; chip uses frosted contrast glass", () => {
    expect(OVERLAY_SRC).toContain(
      'className="pointer-events-none absolute inset-0 z-[4]"'
    );
    expect(OVERLAY_SRC).toContain('data-people-mine-identity-chip="true"');
    expect(OVERLAY_SRC).toContain("IDENTITY_CHIP_CLASS");
    expect(OVERLAY_SRC).toContain("backdrop-blur-md");
    expect(OVERLAY_SRC).toContain("bg-black/58");
    expect(OVERLAY_SRC).toContain("app-light:bg-white/78");
    // Chip is decorative for hit testing — only name/icon buttons receive taps.
    expect(OVERLAY_SRC).toContain(
      "pointer-events-none relative z-[1] inline-flex min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden"
    );
    expect(OVERLAY_SRC).not.toContain("IDENTITY_SHINE");
    expect(OVERLAY_SRC).not.toContain("data-people-mine-identity-shine");
  });

  it("does not show username / @handle", () => {
    expect(OVERLAY_SRC).not.toMatch(/\busername\b|@handle/);
    expect(SLIDE_SRC).toMatch(
      /MinePortraitIdentityOverlay[\s\S]{0,200}name=\{displayName\}/
    );
  });

  it("preserves swipe/photo availability around identity (no full-bleed profile button)", () => {
    expect(OVERLAY_SRC).toContain("pointer-events-none absolute inset-0");
    expect(OVERLAY_SRC).toContain("PROFILE_HIT_CLASS");
    expect(OVERLAY_SRC).toContain("peopleIdentityMovedPastTapThreshold");
    // Photo cycle still excludes only identity hits, not whole plate.
    expect(MEDIA_SRC).toContain("[data-people-mine-identity-hit]");
  });

  it("modern Duo light scrim follows the painted surface and leaves other modes alone", () => {
    const darkPhoto = resolveDuoPortraitScrim({
      duoPortraitScrim: "photo",
      light: false,
      expanded: false,
    });
    const darkFlat = resolveDuoPortraitScrim({
      duoPortraitScrim: "flat",
      light: false,
      expanded: true,
    });
    const discover = resolveDuoPortraitScrim({
      duoPortraitScrim: null,
      light: true,
      expanded: false,
    });
    expect(darkPhoto.background).toContain("rgba(0,0,0,0.90)");
    expect(darkPhoto.bioClass).toContain("text-white/88");
    expect(darkFlat.background).toContain("rgba(0,0,0,0.96)");
    expect(discover.background).toBe(darkPhoto.background);
    expect(discover.bioClass).toContain("text-white/88");

    const lightPhoto = resolveDuoPortraitScrim({
      duoPortraitScrim: "photo",
      light: true,
      expanded: false,
    });
    const lightPhotoExpanded = resolveDuoPortraitScrim({
      duoPortraitScrim: "photo",
      light: true,
      expanded: true,
    });
    expect(lightPhoto.background).toContain("rgba(0,0,0,0.58)");
    expect(lightPhoto.background).not.toContain("rgba(0,0,0,0.90)");
    expect(lightPhoto.bioClass).toContain("text-white/88");
    expect(lightPhotoExpanded.background).toContain("rgba(0,0,0,0.70)");
    expect(lightPhotoExpanded.background).not.toContain("rgba(0,0,0,0.96)");

    for (const expanded of [false, true]) {
      const flat = resolveDuoPortraitScrim({
        duoPortraitScrim: "flat",
        light: true,
        expanded,
      });
      expect(flat.background).toBeNull();
      expect(flat.bioClass).toContain("text-[var(--text)]");
      expect(flat.bioClass).not.toContain("text-white/88");
    }

    expect(OVERLAY_SRC).toContain("rgba(0,0,0,0.90)");
    expect(OVERLAY_SRC).toContain("rgba(0,0,0,0.96)");
    expect(MEDIA_SRC).toContain("paintDuoIdentityOverlay");
    expect(MEDIA_SRC).toContain('mineStackPose === "duoModern"');
    expect(MEDIA_SRC).toContain("mineFailedPhotos.has(displayedIndex)");
    expect(MEDIA_SRC).toContain("!mineLegacyFailed");
    expect(MEDIA_SRC).toContain("!duoModernPaintGate");
    expect(MEDIA_SRC).toContain('? "flat"');
    expect(SLIDE_SRC).toContain("hideMinePhotoIndicators={isDuoModern}");
    const discoverRow = readFileSync(
      resolve(__dirname, "../../components/people/PeopleDiscoverPersonRow.tsx"),
      "utf8"
    );
    expect(discoverRow).toContain("<MinePortraitIdentityOverlay");
    expect(discoverRow).not.toContain("duoPortraitScrim");
    expect(OVERLAY_SRC).toContain("peopleIdentityMovedPastTapThreshold");
    expect(OVERLAY_SRC).toContain("onOpenProfile");
  });

  it("Profile navigation wiring unchanged (slide → overlay onOpenProfile)", () => {
    expect(SLIDE_SRC).toContain("onOpenProfile={isCurrent ? onOpenProfile");
    expect(DUO_SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(DUO_SLIDE_SRC).toContain("onOpenProfile={onOpenProfile}");
    expect(MATCH_SRC).toContain("onOpenProfile=");
    expect(OVERLAY_SRC).toContain("onOpenProfile");
    expect(OVERLAY_SRC).toContain("deckOpenProfile");
  });
});
