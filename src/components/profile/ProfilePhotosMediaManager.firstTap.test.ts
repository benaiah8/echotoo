import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(): string {
  return readFileSync(
    join(process.cwd(), "src/components/profile/ProfilePhotosMediaManager.tsx"),
    "utf8",
  );
}

describe("ProfilePhotosMediaManager zero-photo first tap", () => {
  it("empty hero surface starts Add on first activate (same gesture)", () => {
    const code = src();
    expect(code).toContain("handleHeroSurfaceActivate");
    const activate = code.match(
      /const handleHeroSurfaceActivate = \(\) => \{[\s\S]*?\n {2}\};/,
    )?.[0];
    expect(activate).toBeTruthy();
    expect(activate).toMatch(
      /if \(count === 0\) \{[\s\S]*?handleAddClick\(\);[\s\S]*?return;/,
    );
    // Must not expand-only without Add on zero photos.
    expect(activate).not.toMatch(
      /if \(count === 0\) \{\s{0,2}if \(!expanded\) setExpanded\(true\);\s{0,2}return;/,
    );
  });

  it("handleAddClick invokes onAddPhotos synchronously (no deferral)", () => {
    const code = src();
    const fn = code.match(
      /const handleAddClick = \(\) => \{[\s\S]*?\n {2}\};/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toContain("onAddPhotos()");
    expect(fn).not.toContain("setTimeout");
    expect(fn).not.toContain("requestAnimationFrame");
    expect(fn).not.toContain(".then(");
  });

  it("collapsed zero-photo Add CTA calls handleAddClick on first click", () => {
    const code = src();
    const collapsedZero = code.match(
      /: count === 0 \? \([\s\S]*?Add photos[\s\S]*?\) : \(/,
    )?.[0];
    expect(collapsedZero).toBeTruthy();
    expect(collapsedZero).toContain("onClick={handleAddClick}");
    expect(collapsedZero).toContain('aria-label="Add profile photos"');
  });
});
