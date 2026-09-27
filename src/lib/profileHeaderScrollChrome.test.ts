import { describe, expect, it } from "vitest";
import {
  deriveProfileHeaderHiddenFromScrollY,
  nextProfileHeaderHiddenFromScroll,
  PROFILE_HEADER_HIDE_SCROLL_Y_PX,
} from "./profileHeaderScrollChrome";

describe("profileHeaderScrollChrome", () => {
  it("hides chrome past the shared scrollY threshold", () => {
    expect(deriveProfileHeaderHiddenFromScrollY(0)).toBe(false);
    expect(
      deriveProfileHeaderHiddenFromScrollY(PROFILE_HEADER_HIDE_SCROLL_Y_PX),
    ).toBe(false);
    expect(
      deriveProfileHeaderHiddenFromScrollY(PROFILE_HEADER_HIDE_SCROLL_Y_PX + 1),
    ).toBe(true);
  });

  it("mirrors live scroll direction rules", () => {
    expect(
      nextProfileHeaderHiddenFromScroll({
        scrollY: 140,
        lastScrollY: 0,
        searchPinned: false,
      }),
    ).toBe(true);
    expect(
      nextProfileHeaderHiddenFromScroll({
        scrollY: 40,
        lastScrollY: 140,
        searchPinned: false,
      }),
    ).toBe(false);
    expect(
      nextProfileHeaderHiddenFromScroll({
        scrollY: 140,
        lastScrollY: 138,
        searchPinned: false,
      }),
    ).toBe(null);
    expect(
      nextProfileHeaderHiddenFromScroll({
        scrollY: 140,
        lastScrollY: 0,
        searchPinned: true,
      }),
    ).toBe(false);
  });
});
