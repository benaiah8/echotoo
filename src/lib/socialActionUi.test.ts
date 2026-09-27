/**
 * Light-theme Duo/Group color contracts — unified yellow family.
 */
import { describe, expect, it } from "vitest";
import {
  socialContrastShelfClassName,
  socialPillExtrusionClassName,
  socialPillFaceClassName,
} from "./socialActionUi";

describe("socialActionUi unified yellow light palette", () => {
  it("keeps smoky plum slate shelf in light", () => {
    const shelf = socialContrastShelfClassName({ bleed: true });
    expect(shelf).toContain("bg-[#89818F]");
    expect(shelf).toContain("app-dark:bg-[var(--text)]");
  });

  it("uses the same yellow family for active and inactive faces", () => {
    const inactive = socialPillFaceClassName({ tone: "inactive", size: "feed" });
    const active = socialPillFaceClassName({ tone: "active", size: "feed" });
    expect(inactive).toContain("bg-[#FFE5A0]");
    expect(inactive).toContain("text-[#29232B]");
    expect(inactive).toContain("border-[#FFFFFF]");
    expect(active).toContain("bg-[#F7D047]");
    expect(active).toContain("text-[#29232B]");
    expect(active).toContain("border-[#FFFFFF]");
    expect(inactive).toContain("app-dark:border-[#0a0a0a]");
    expect(active).toContain("app-dark:border-[#0a0a0a]");
    expect(inactive.includes("bg-[#B8EFCA]")).toBe(false);
    expect(active.includes("bg-[#B8EFCA]")).toBe(false);
  });

  it("preserves dark-mode face paths exactly", () => {
    const inactive = socialPillFaceClassName({ tone: "inactive", size: "feed" });
    const active = socialPillFaceClassName({ tone: "active", size: "feed" });
    expect(inactive).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--brand)_68%,var(--text))]"
    );
    expect(active).toContain("app-dark:bg-[var(--brand)]");
    expect(active).toContain("app-dark:text-[var(--brand-ink)]");
  });

  it("distinguishes states via extrusion color, not face hue family", () => {
    const inactive = socialPillExtrusionClassName("inactive");
    const active = socialPillExtrusionClassName("active");
    expect(inactive).toContain("bg-[#B9944E]");
    expect(active).toContain("bg-[#21945C]");
    expect(inactive).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--brand)_42%,var(--text))]"
    );
    expect(active).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--green-text)_90%,#0a0a0a)]"
    );
    expect(inactive).toContain("translate-x-[-2.5px] translate-y-[2.5px]");
    expect(active).toContain("translate-x-[-2.75px] translate-y-[2.75px]");
  });
});
