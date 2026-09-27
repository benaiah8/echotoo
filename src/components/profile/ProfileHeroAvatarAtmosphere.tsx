import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";

/**
 * Negative offset so the wash reaches the top of the viewport behind the fixed header.
 * Must stay in sync with `paddingTop` on the profile hero content wrapper in Own/Other profile pages.
 */
export const PROFILE_HERO_ATMOSPHERE_EXTEND_TOP =
  "calc(-1 * (60px + env(safe-area-inset-top, 0px)))";

const DEFAULT_HEIGHT = "min(44rem, 84vh)";
const DEFAULT_WASH_OPACITY_CLASS =
  "opacity-[0.38] app-light:opacity-[0.30]";
const DEFAULT_SCRIM_CLASS =
  "absolute inset-0 app-dark:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_26%,transparent)] app-light:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_38%,transparent)]";
const DEFAULT_HORIZONTAL_BLEED = "calc(-1 * var(--gutter, 0px))";
const DEFAULT_WASH_FILTER = "blur(36px)";

/**
 * Full-bleed blurred avatar wash behind the profile hero (decorative only).
 *
 * Horizontally: extends into `.app-container` gutters via negative inset of
 * `var(--gutter)` — still parent-relative (no `w-screen` / `100vw` / `-50vw`).
 *
 * Vertically: extends through identity and stat tiles; fades before tab row / posts.
 *
 * Renders nothing when URL cannot be resolved or `active` is false.
 *
 * Optional presentation props are for Mine shell reuse; Profile callers omit them
 * so defaults stay identical.
 */
export default function ProfileHeroAvatarAtmosphere({
  avatarPath,
  active = true,
  extendTop = PROFILE_HERO_ATMOSPHERE_EXTEND_TOP,
  height = DEFAULT_HEIGHT,
  washOpacityClassName = DEFAULT_WASH_OPACITY_CLASS,
  scrimClassName = DEFAULT_SCRIM_CLASS,
  horizontalBleed = DEFAULT_HORIZONTAL_BLEED,
  washFilter = DEFAULT_WASH_FILTER,
  washClassName = "",
}: {
  avatarPath?: string | null;
  active?: boolean;
  /** CSS length; top edge of the layer (typically negative to meet viewport top). */
  extendTop?: string;
  /** CSS length for atmosphere coverage height. */
  height?: string;
  /**
   * Classes controlling wash photo opacity (dark/light).
   * Default matches Profile; Mine may pass a lower light opacity.
   */
  washOpacityClassName?: string;
  /**
   * Full class string for the theme scrim layer (include positioning).
   * Default matches Profile; Mine may pass a stronger light scrim.
   */
  scrimClassName?: string;
  /** CSS length applied to both `left` and `right` (negative bleed). */
  horizontalBleed?: string;
  /**
   * Static CSS `filter` for the wash photo layer.
   * Default `blur(36px)`. Callers may pass a CSS variable for theme splits
   * (set the variable via `washClassName`) without changing Profile defaults.
   */
  washFilter?: string;
  /** Extra classes on the wash photo layer (e.g. theme CSS variables). */
  washClassName?: string;
}) {
  if (!active) return null;
  const url = avatarDisplayUrl(avatarPath);
  if (!url) return null;

  return (
    <div
      className="pointer-events-none absolute z-0 max-w-none overflow-hidden"
      style={{
        top: extendTop,
        /* Bounded — wash through hero + stats; ends before Created/Saved and feed */
        height,
        bottom: "auto",
        left: horizontalBleed,
        right: horizontalBleed,
      }}
      aria-hidden
    >
      <div
        className={[
          "absolute bg-center transition-[opacity,background-image] duration-[280ms] ease-out motion-reduce:transition-none",
          washOpacityClassName,
          washClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center 28%",
          top: "-32px",
          left: "-24px",
          right: "-24px",
          bottom: "-32px",
          filter: washFilter,
          transform: "scale(1.04)",
        }}
      />
      <div className={scrimClassName} />
      <div
        className="absolute inset-0"
        style={{
          background: [
            /* Soft top blend under header */
            "linear-gradient(to bottom, var(--bg) 0%, color-mix(in oklab, var(--bg) 38%, transparent) 6%, transparent 14%)",
            /* Hold through identity + stat tiles, fade well before tabs/posts */
            "linear-gradient(to bottom, transparent 0%, transparent 68%, color-mix(in oklab, var(--bg) 22%, transparent) 78%, color-mix(in oklab, var(--bg) 62%, transparent) 88%, var(--bg) 96%, var(--bg) 100%)",
          ].join(", "),
        }}
      />
    </div>
  );
}

