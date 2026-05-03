import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";

/**
 * Negative offset so the wash reaches the top of the viewport behind the fixed header.
 * Must stay in sync with `paddingTop` on the profile hero content wrapper in Own/Other profile pages.
 */
export const PROFILE_HERO_ATMOSPHERE_EXTEND_TOP =
  "calc(-1 * (60px + env(safe-area-inset-top, 0px)))";

/**
 * Full-bleed blurred avatar wash behind the profile hero (decorative only).
 * Renders nothing when URL cannot be resolved or `active` is false.
 */
export default function ProfileHeroAvatarAtmosphere({
  avatarPath,
  active = true,
  extendTop = PROFILE_HERO_ATMOSPHERE_EXTEND_TOP,
}: {
  avatarPath?: string | null;
  active?: boolean;
  /** CSS length; top edge of the layer (typically negative to meet viewport top). */
  extendTop?: string;
}) {
  if (!active) return null;
  const url = avatarDisplayUrl(avatarPath);
  if (!url) return null;

  return (
    <div
      className="pointer-events-none absolute z-0 w-screen overflow-hidden"
      style={{
        top: extendTop,
        bottom: 0,
        left: "50%",
        marginLeft: "-50vw",
      }}
      aria-hidden
    >
      <div
        className="absolute bg-center opacity-[0.38] app-light:opacity-[0.30]"
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center 28%",
          top: "-32px",
          left: "-32px",
          right: "-32px",
          bottom: "-32px",
          filter: "blur(36px)",
          transform: "scale(1.05)",
        }}
      />
      <div
        className="absolute inset-0 app-dark:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_26%,transparent)] app-light:bg-[color-mix(in_oklab,var(--profile-avatar-pill-scrim)_38%,transparent)]"
      />
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(to right, var(--bg) 0%, color-mix(in oklab, var(--bg) 12%, transparent) 3.5%, transparent 5.5%, transparent 94.5%, color-mix(in oklab, var(--bg) 12%, transparent) 96.5%, var(--bg) 100%)",
            "linear-gradient(to bottom, var(--bg) 0%, color-mix(in oklab, var(--bg) 38%, transparent) 6%, transparent 14%)",
            "linear-gradient(to bottom, transparent 0%, transparent 48%, color-mix(in oklab, var(--bg) 48%, transparent) 76%, var(--bg) 100%)",
          ].join(", "),
        }}
      />
    </div>
  );
}
