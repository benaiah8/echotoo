import { SkeletonPill } from "../ui/Skeleton";
import {
  SOCIAL_PILL_RADIUS,
  socialPillHitClassName,
} from "../../lib/socialActionUi";

/**
 * Neutral Duo/Group placeholder — same footprint as real pills (incl. extrusion gutter).
 * No text, count, or yellow/green extrusion.
 */
export default function SocialActionPillSkeleton({
  kind,
  size = "feed",
}: {
  kind: "duo" | "group";
  size?: "feed" | "compact" | "dock";
}) {
  const width =
    kind === "duo"
      ? size === "compact"
        ? "w-[44px]"
        : "w-[48px]"
      : size === "compact"
        ? "w-[58px]"
        : "w-[68px]";

  return (
    <span
      className={socialPillHitClassName()}
      aria-hidden
      data-social-skeleton={kind}
    >
      <SkeletonPill
        className={[
          "h-7",
          width,
          "min-w-0",
          SOCIAL_PILL_RADIUS,
          "bg-[var(--text)]/10",
        ].join(" ")}
      />
    </span>
  );
}
