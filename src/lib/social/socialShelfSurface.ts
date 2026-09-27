/**
 * Where Duo/Group contrast-shelf bleed is painted.
 * `detail` / `rail` never edge-bleed; feed + profile share ::after bleed
 * clipped by `.app-container`.
 */
export type SocialShelfSurface =
  | "feed"
  | "profile-own"
  | "profile-other"
  | "detail"
  /** Home Event rail Hangout cards — pill shelf, no viewport-edge bleed. */
  | "rail";

export function socialShelfSurfaceAllowsBleed(
  surface: SocialShelfSurface
): boolean {
  return (
    surface === "feed" ||
    surface === "profile-own" ||
    surface === "profile-other"
  );
}
