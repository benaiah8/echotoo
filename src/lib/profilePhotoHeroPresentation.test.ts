import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROFILE_HERO_ASPECT_HEIGHT,
  PROFILE_HERO_CARD_BORDER_COLLAPSED,
  PROFILE_HERO_CARD_BORDER_EXPANDED,
  PROFILE_HERO_CARD_EXCHANGE_MS,
  PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR,
  PROFILE_HERO_CARD_SHADOW_EXPANDED_FRONT,
  PROFILE_HERO_CARD_SHADOW_EXPANDED_REAR,
  PROFILE_HERO_COMPACT_SCALE,
  PROFILE_HERO_COMPACT_WIDTH,
  PROFILE_HERO_EXPANDED_WIDTH,
  PROFILE_HERO_STACK_CLIP_INSET_X_PERCENT,
  PROFILE_HERO_STACK_POSE_COLLAPSED,
  PROFILE_HERO_STACK_POSE_EXPANDED,
  PROFILE_HERO_TOP_PAD_CLASS,
  PROFILE_HERO_Z_DEMOTING,
  PROFILE_HERO_Z_PROMOTING,
  PROFILE_HERO_Z_SETTLED,
  deriveOwnProfileHeroCycleIndexAfterAdd,
  deriveProfileHeroNextIndex,
  deriveProfileHeroPrevIndex,
  ownProfileHeroShowsAddSlot,
  profileHeroCardBorderClass,
  profileHeroCardOpacity,
  profileHeroCardShadowClass,
  profileHeroCardTransform,
  profileHeroCardZIndex,
  profileHeroClipAspectRatio,
  profileHeroClipPaddingBottomPercent,
  profileHeroColumnWidth,
  profileHeroFrontTapAction,
  profileHeroPoseForRole,
  profileHeroStackAssignments,
  profileHeroStackClipPath,
  shouldShowProfileHeroCycleNav,
} from "./profilePhotoHeroPresentation";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("profileHero compact vs expanded size", () => {
  it("uses full aspect for both compact and expanded (no vertical crop)", () => {
    expect(profileHeroClipAspectRatio(true)).toBe(
      `1 / ${PROFILE_HERO_ASPECT_HEIGHT}`,
    );
    expect(profileHeroClipAspectRatio(false)).toBe(
      `1 / ${PROFILE_HERO_ASPECT_HEIGHT}`,
    );
  });

  it("padding-bottom is always full composition height", () => {
    expect(profileHeroClipPaddingBottomPercent(true)).toBe(
      PROFILE_HERO_ASPECT_HEIGHT * 100,
    );
    expect(profileHeroClipPaddingBottomPercent(false)).toBe(
      PROFILE_HERO_ASPECT_HEIGHT * 100,
    );
  });

  it("compact column is ~75% of expanded width", () => {
    expect(PROFILE_HERO_COMPACT_SCALE).toBe(0.75);
    expect(profileHeroColumnWidth(false)).toBe(PROFILE_HERO_COMPACT_WIDTH);
    expect(profileHeroColumnWidth(true)).toBe(PROFILE_HERO_EXPANDED_WIDTH);
    expect(PROFILE_HERO_COMPACT_WIDTH).toContain("10.125rem");
    expect(PROFILE_HERO_COMPACT_WIDTH).toContain("60vw");
    expect(PROFILE_HERO_COMPACT_WIDTH).toContain("14.25rem");
    expect(PROFILE_HERO_EXPANDED_WIDTH).toContain("13.5rem");
    expect(PROFILE_HERO_EXPANDED_WIDTH).toContain("80vw");
  });

  it("keeps modest top pad under ProfileTopBar", () => {
    expect(PROFILE_HERO_TOP_PAD_CLASS).toBe("pt-4");
  });
});

describe("profileHeroStackClipPath", () => {
  it("expands horizontal clip so peeks are not overflow-hidden", () => {
    const path = profileHeroStackClipPath();
    expect(path).toContain(`-${PROFILE_HERO_STACK_CLIP_INSET_X_PERCENT}%`);
    expect(path.startsWith("inset(")).toBe(true);
    expect(PROFILE_HERO_STACK_CLIP_INSET_X_PERCENT).toBeGreaterThanOrEqual(10);
  });
});

describe("shouldShowProfileHeroCycleNav", () => {
  it("hides controls for 0–1 cycle items", () => {
    expect(shouldShowProfileHeroCycleNav(0)).toBe(false);
    expect(shouldShowProfileHeroCycleNav(1)).toBe(false);
  });

  it("shows controls for 2+ cycle items", () => {
    expect(shouldShowProfileHeroCycleNav(2)).toBe(true);
    expect(shouldShowProfileHeroCycleNav(3)).toBe(true);
  });
});

describe("ownProfileHeroShowsAddSlot", () => {
  it("shows Add for 0–2 photos", () => {
    expect(ownProfileHeroShowsAddSlot(0)).toBe(true);
    expect(ownProfileHeroShowsAddSlot(1)).toBe(true);
    expect(ownProfileHeroShowsAddSlot(2)).toBe(true);
  });

  it("hides Add at 3 photos", () => {
    expect(ownProfileHeroShowsAddSlot(3)).toBe(false);
  });
});

describe("deriveOwnProfileHeroCycleIndexAfterAdd", () => {
  it("shows the first newly added photo", () => {
    expect(deriveOwnProfileHeroCycleIndexAfterAdd(0, 1)).toBe(0);
    expect(deriveOwnProfileHeroCycleIndexAfterAdd(1, 2)).toBe(1);
    expect(deriveOwnProfileHeroCycleIndexAfterAdd(2, 3)).toBe(2);
  });

  it("shows the first of a multi-add batch", () => {
    expect(deriveOwnProfileHeroCycleIndexAfterAdd(0, 2)).toBe(0);
    expect(deriveOwnProfileHeroCycleIndexAfterAdd(1, 3)).toBe(1);
  });
});

describe("deriveProfileHeroPrevIndex", () => {
  it("wraps from first to last", () => {
    expect(deriveProfileHeroPrevIndex(0, 3)).toBe(2);
    expect(deriveProfileHeroPrevIndex(0, 2)).toBe(1);
  });
});

describe("deriveProfileHeroNextIndex", () => {
  it("wraps from last to first", () => {
    expect(deriveProfileHeroNextIndex(2, 3)).toBe(0);
    expect(deriveProfileHeroNextIndex(1, 2)).toBe(0);
  });
});

describe("profileHeroFrontTapAction", () => {
  it("expands when compact; cycles when expanded", () => {
    expect(profileHeroFrontTapAction(false)).toBe("expand");
    expect(profileHeroFrontTapAction(true)).toBe("cycle");
  });
});

describe("profileHeroStackAssignments", () => {
  it("1 photo → front only", () => {
    expect(profileHeroStackAssignments(1, 0)).toEqual([
      { itemIndex: 0, role: "front" },
    ]);
  });

  it("2 photos → front + right", () => {
    expect(profileHeroStackAssignments(2, 0)).toEqual([
      { itemIndex: 0, role: "front" },
      { itemIndex: 1, role: "right" },
    ]);
  });

  it("3 photos → front + right + left", () => {
    expect(profileHeroStackAssignments(3, 0)).toEqual([
      { itemIndex: 0, role: "front" },
      { itemIndex: 1, role: "right" },
      { itemIndex: 2, role: "left" },
    ]);
  });

  it("rotates roles when front advances", () => {
    const after = profileHeroStackAssignments(3, 1);
    expect(after).toEqual([
      { itemIndex: 1, role: "front" },
      { itemIndex: 2, role: "right" },
      { itemIndex: 0, role: "left" },
    ]);
  });

  it("prev reverses next for 3 photos", () => {
    const next = deriveProfileHeroNextIndex(0, 3);
    expect(deriveProfileHeroPrevIndex(next, 3)).toBe(0);
    const afterNext = profileHeroStackAssignments(3, next);
    const afterPrev = profileHeroStackAssignments(
      3,
      deriveProfileHeroPrevIndex(next, 3),
    );
    expect(afterPrev).toEqual(profileHeroStackAssignments(3, 0));
    expect(afterNext.find((a) => a.role === "front")?.itemIndex).toBe(1);
  });
});

describe("profileHero poses compact vs expanded", () => {
  it("compact rear poses match expanded fan (visible peeks)", () => {
    expect(PROFILE_HERO_STACK_POSE_COLLAPSED.right).toEqual(
      PROFILE_HERO_STACK_POSE_EXPANDED.right,
    );
    expect(PROFILE_HERO_STACK_POSE_COLLAPSED.left).toEqual(
      PROFILE_HERO_STACK_POSE_EXPANDED.left,
    );
    expect(profileHeroCardOpacity("left", false)).toBe(0.72);
    expect(profileHeroCardOpacity("right", false)).toBe(0.72);
  });

  it("expanded rear poses retain current fan geometry", () => {
    expect(PROFILE_HERO_STACK_POSE_EXPANDED.right).toEqual({
      xPct: 10,
      yPct: -2,
      rotDeg: 5,
      scale: 0.95,
      opacity: 0.72,
    });
    expect(PROFILE_HERO_STACK_POSE_EXPANDED.left).toEqual({
      xPct: -10,
      yPct: -2,
      rotDeg: -5,
      scale: 0.95,
      opacity: 0.72,
    });
  });

  it("front pose stays centered at full scale", () => {
    for (const expanded of [false, true]) {
      const p = profileHeroPoseForRole("front", expanded);
      expect(p.xPct).toBe(0);
      expect(p.rotDeg).toBe(0);
      expect(p.scale).toBe(1);
      expect(p.opacity).toBe(1);
    }
  });

  it("compact and expanded card transforms match (size change only)", () => {
    expect(profileHeroCardTransform("right", false)).toBe(
      profileHeroCardTransform("right", true),
    );
    expect(profileHeroCardTransform("left", false)).toBe(
      profileHeroCardTransform("left", true),
    );
  });
});

describe("profileHero expanded border and shadow", () => {
  it("dark-mode expanded border treatment exists", () => {
    expect(PROFILE_HERO_CARD_BORDER_EXPANDED).toContain("app-dark:border-white/");
  });

  it("light-mode counterpart exists", () => {
    expect(PROFILE_HERO_CARD_BORDER_EXPANDED).toContain(
      "app-light:border-black/",
    );
  });

  it("expanded shadow treatment exists for front and rear", () => {
    expect(PROFILE_HERO_CARD_SHADOW_EXPANDED_FRONT).toContain("shadow-[");
    expect(PROFILE_HERO_CARD_SHADOW_EXPANDED_REAR).toContain("shadow-[");
    expect(profileHeroCardShadowClass("front", true)).toBe(
      PROFILE_HERO_CARD_SHADOW_EXPANDED_FRONT,
    );
    expect(profileHeroCardShadowClass("left", true)).toBe(
      PROFILE_HERO_CARD_SHADOW_EXPANDED_REAR,
    );
  });

  it("compact keeps distinct border; rear has fan depth shadow", () => {
    expect(profileHeroCardBorderClass(false)).toBe(
      PROFILE_HERO_CARD_BORDER_COLLAPSED,
    );
    expect(profileHeroCardShadowClass("right", false)).toBe(
      PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR,
    );
    expect(PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR).toContain("shadow-[");
    expect(PROFILE_HERO_CARD_SHADOW_COLLAPSED_REAR).not.toBe("shadow-none");
  });
});

describe("profileHeroCardZIndex", () => {
  it("promoting z > demoting z during transition", () => {
    expect(PROFILE_HERO_Z_PROMOTING).toBeGreaterThan(PROFILE_HERO_Z_DEMOTING);
    expect(
      profileHeroCardZIndex("right", "promoting"),
    ).toBeGreaterThan(profileHeroCardZIndex("front", "demoting"));
  });

  it("settled front z > rear z", () => {
    expect(PROFILE_HERO_Z_SETTLED.front).toBeGreaterThan(
      PROFILE_HERO_Z_SETTLED.right,
    );
    expect(PROFILE_HERO_Z_SETTLED.right).toBeGreaterThan(
      PROFILE_HERO_Z_SETTLED.left,
    );
    expect(profileHeroCardZIndex("front")).toBeGreaterThan(
      profileHeroCardZIndex("right"),
    );
  });

  it("exchange duration is a short CSS transform window", () => {
    expect(PROFILE_HERO_CARD_EXCHANGE_MS).toBeGreaterThanOrEqual(200);
    expect(PROFILE_HERO_CARD_EXCHANGE_MS).toBeLessThanOrEqual(400);
  });
});

describe("ProfilePhotoHero deck source contracts", () => {
  const hero = src("src/components/profile/ProfilePhotoHero.tsx");
  const presentation = src("src/lib/profilePhotoHeroPresentation.ts");

  it("does not import People stack helpers", () => {
    expect(hero).not.toMatch(/peopleCandidateMedia/i);
    expect(hero).not.toMatch(/PeopleCandidateMedia/);
    expect(presentation).not.toMatch(/peopleCandidateMedia/i);
  });

  it("uses clip-path stack frame instead of overflow-hidden on the clip", () => {
    expect(hero).toContain("profileHeroStackClipPath");
    expect(hero).toContain('data-profile-hero-clip="stack"');
    expect(hero).not.toMatch(
      /data-profile-hero-clip="stack"[\s\S]{0,120}overflow-hidden/,
    );
  });

  it("animates column width for compact→expanded (no bottom clip crop)", () => {
    expect(hero).toContain("profileHeroColumnWidth(heroExpanded)");
    expect(hero).toContain("inset-x-0 top-0");
    expect(hero).not.toContain("PROFILE_HERO_COLLAPSED_FRACTION");
    expect(presentation).not.toContain("PROFILE_HERO_COLLAPSED_FRACTION");
  });

  it("does not add collapse interaction in this pass", () => {
    expect(hero).not.toContain("setHeroExpanded(false)");
  });

  it("uses card-slot roles rather than face crossfade layers", () => {
    expect(hero).toContain("profileHeroStackAssignments");
    expect(hero).toContain("promotingIndex");
    expect(hero).toContain("demotingIndex");
    expect(hero).not.toContain("crossfadeActive");
    expect(hero).not.toContain("outgoingFace");
  });

  it("compact→expanded uses mounted card identities (stable keys)", () => {
    expect(hero).toContain("key={heroItemKey(item)}");
    expect(hero).toContain("profileHeroCardTransform(role, heroExpanded)");
    expect(hero).toContain("profileHeroCardOpacity(role, heroExpanded)");
  });

  it("applies expanded border/shadow helpers on cards", () => {
    expect(hero).toContain("profileHeroCardBorderClass(heroExpanded)");
    expect(hero).toContain("profileHeroCardShadowClass(");
    expect(presentation).toContain("app-dark:border-white/");
    expect(presentation).toContain("app-light:border-black/");
  });

  it("keeps own edit/add affordances", () => {
    expect(hero).toContain("Edit profile");
    expect(hero).toContain("Add profile photo");
    expect(hero).toContain("onEditProfile");
    expect(hero).toContain("onAddPhoto");
  });

  it("does not introduce Supabase or network photo fetches", () => {
    expect(hero).not.toMatch(/from\(["']profiles["']\)/);
    expect(hero).not.toMatch(/supabase/i);
    expect(hero).not.toMatch(/fetch\(/);
  });

  it("reduced-motion path clears promote/demote for immediate exchange", () => {
    expect(hero).toContain("prefersReducedMotion()");
    expect(hero).toMatch(
      /prefersReducedMotion\(\)[\s\S]{0,120}setPromotingIndex\(null\)/,
    );
  });
});
