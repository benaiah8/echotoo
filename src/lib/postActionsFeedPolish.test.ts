import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PostActions feed polish (current)", () => {
  it("orders Save → Share → Rating → Comment with no RSVP", () => {
    const actions = read("src/components/ui/PostActions.tsx");
    const saveIdx = actions.indexOf("<SaveButton");
    const shareIdx = actions.indexOf('aria-label="Share"');
    const commentIdx = actions.indexOf('aria-label="Comment"');
    const ratingIdx = actions.indexOf("<PostRatingChip");

    expect(saveIdx).toBeGreaterThan(-1);
    expect(shareIdx).toBeGreaterThan(saveIdx);
    expect(ratingIdx).toBeGreaterThan(shareIdx);
    expect(commentIdx).toBeGreaterThan(ratingIdx);
    expect(actions).not.toContain("RSVPComponent");
    expect(actions).not.toContain("RSVPListDrawer");
    expect(actions).toContain('countGap="tight"');
    expect(actions).toContain("commentCount > 0");
    expect(actions).toContain("gap-2 max-[360px]:gap-1.5 sm:gap-2.5");
  });

  it("Save omits zero count when hideZeroCount; supports tight gap + xs type", () => {
    const save = read("src/components/ui/SaveButton.tsx");
    expect(save).toContain("hideZeroCount = false");
    expect(save).toContain("!hideZeroCount || currentCount > 0");
    expect(save).toContain('countGap === "tight" ? "gap-0.5" : "gap-1"');
    expect(save).toContain(
      'countSize === "xs"',
    );
  });

  it("Comment only renders count when > 0", () => {
    const actions = read("src/components/ui/PostActions.tsx");
    expect(actions).toContain("{commentCount > 0 && (");
  });

  it("compact Rating: neutral inactive outline, amber filled active, text-xs avg", () => {
    const chip = read("src/components/ui/PostRatingChip.tsx");
    expect(chip).toContain("const StarIcon = ratedByMe ? PiStarFill : PiStar");
    expect(chip).toContain('size={18}');
    expect(chip).toContain(
      "text-xs font-medium tabular-nums leading-none text-[var(--text)]/80",
    );
    expect(chip).toContain("gap-0.5");
    // Inactive: theme-neutral, not amber tint
    expect(chip).toMatch(
      /ratedByMe[\s\S]*?text-amber-500 app-dark:text-amber-300[\s\S]*?:[\s\S]*?text-\[var\(--text\)\]\/75/,
    );
    expect(chip).not.toContain("text-amber-500/55");
    expect(chip).not.toContain("text-amber-500/90");
  });
});

describe("PostFeedLocationPin soft neutral square", () => {
  it("uses soft wash fill + subtle border; no brand yellow", () => {
    const meta = read("src/components/ui/PostFeedSurfaceMeta.tsx");
    expect(meta).toContain("bg-black/[0.06]");
    expect(meta).toContain("app-dark:bg-white/15");
    expect(meta).toContain("border-black/12");
    expect(meta).toContain("app-dark:border-white/18");
    expect(meta).toContain("inline-flex h-5 w-5");
    expect(meta).toContain("PiMapPin");
    expect(meta).not.toContain("PiMapPinSimpleFill");
    expect(meta).not.toContain("PiMapPinBold");
    expect(meta).not.toContain("bg-[var(--brand)]");
    expect(meta).not.toContain("bg-transparent");
    expect(meta).toContain('aria-label="View location"');
  });

  it("location scroll wiring unchanged", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain(
      "onOpenLocation={() => goToDetails({ scrollToLocation: true })}",
    );
  });
});
