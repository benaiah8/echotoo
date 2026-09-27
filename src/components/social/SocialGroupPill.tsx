import type { MouseEvent } from "react";
import {
  socialCountClassName,
  socialGroupFaceStableWidthClassName,
  socialPillActiveGlowClassName,
  socialPillExtrusionClassName,
  socialPillFaceClassName,
  socialPillHitClassName,
  socialPillRippleClassName,
  socialPillStackClassName,
  type SocialPillTone,
} from "../../lib/socialActionUi";
import { socialUiCopy } from "../../lib/social/socialUiCopy";

export default function SocialGroupPill({
  displayCount,
  active,
  resolving,
  onPress,
  size = "feed",
  className = "",
}: {
  displayCount: number | null;
  active?: boolean;
  resolving?: boolean;
  onPress: () => void;
  size?: "feed" | "compact" | "dock";
  className?: string;
}) {
  /** Keep real yellow face while resolving — plate shimmer signals load. */
  const tone: SocialPillTone = active ? "active" : "inactive";

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (resolving) return;
    onPress();
  };

  const showCount =
    typeof displayCount === "number" &&
    Number.isFinite(displayCount) &&
    displayCount > 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={!!active}
      aria-busy={resolving === true}
      aria-disabled={resolving === true}
      aria-label={
        showCount
          ? `${socialUiCopy.group} ${displayCount}`
          : socialUiCopy.group
      }
      data-social-pill="group"
      data-social-pill-resolving={resolving ? "true" : undefined}
      className={[
        socialPillHitClassName(className),
        resolving ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={socialPillStackClassName()}>
        {tone === "active" ? (
          <span
            data-social-glow
            className={socialPillActiveGlowClassName()}
            aria-hidden
          />
        ) : null}
        <span
          data-social-ripple
          className={socialPillRippleClassName()}
          aria-hidden
        />
        <span className={socialPillExtrusionClassName(tone)} aria-hidden />
        <span
          data-social-face
          className={socialPillFaceClassName({
            tone,
            size,
            className: socialGroupFaceStableWidthClassName(size),
          })}
          aria-hidden
        >
          <span>{socialUiCopy.group}</span>
          {showCount ? (
            <span
              className={socialCountClassName({
                tone,
                value: displayCount!,
              })}
            >
              {displayCount! > 99 ? "99+" : displayCount}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
