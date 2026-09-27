import type { MouseEvent } from "react";
import {
  socialDuoFaceStableWidthClassName,
  socialPillActiveGlowClassName,
  socialPillExtrusionClassName,
  socialPillFaceClassName,
  socialPillHitClassName,
  socialPillRippleClassName,
  socialPillStackClassName,
  type SocialPillTone,
} from "../../lib/socialActionUi";
import { socialUiCopy } from "../../lib/social/socialUiCopy";

export default function SocialDuoPill({
  active,
  resolving,
  onPress,
  size = "feed",
  className = "",
}: {
  active: boolean;
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

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-busy={resolving === true}
      aria-disabled={resolving === true}
      aria-label={socialUiCopy.duo}
      data-social-pill="duo"
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
            className: socialDuoFaceStableWidthClassName(size),
          })}
          aria-hidden
        >
          {socialUiCopy.duo}
        </span>
      </span>
    </button>
  );
}
