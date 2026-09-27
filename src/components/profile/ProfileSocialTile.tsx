import type { ReactNode } from "react";
import { profileSocialTileFillClass } from "../../lib/glassActionSheetStyles";

/** Fan layout: pivot from bottom corners / bottom center like spread cards. */
export type ProfileSocialTileFanPosition = "left" | "center" | "right";

const FAN_CLASS: Record<ProfileSocialTileFanPosition, string> = {
  left: "profile-social-tile-fan-left",
  center: "profile-social-tile-fan-center",
  right: "profile-social-tile-fan-right",
};

export type ProfileSocialTileProps = {
  label: string;
  value?: number | string;
  icon?: ReactNode;
  onClick?: () => void;
  /** Preferred — bottom-corner fan pivot (left | center | right). */
  fanPosition?: ProfileSocialTileFanPosition;
  /** Manual override when fanPosition is not set. */
  rotationDeg?: number;
  ariaLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onMouseEnter?: () => void;
};

export default function ProfileSocialTile({
  label,
  value,
  icon,
  onClick,
  fanPosition,
  rotationDeg,
  ariaLabel,
  loading = false,
  disabled = false,
  onMouseEnter,
}: ProfileSocialTileProps) {
  const isInteractive = Boolean(onClick) && !disabled && !loading;
  const fanClass = fanPosition ? FAN_CLASS[fanPosition] : "";
  const manualRotate =
    !fanPosition && rotationDeg
      ? { transform: `rotate(${rotationDeg}deg)` }
      : undefined;

  return (
    <div
      className={["shrink-0 motion-reduce:transform-none", fanClass].join(" ")}
      style={manualRotate}
    >
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        disabled={disabled || loading || !onClick}
        aria-label={ariaLabel}
        className={[
          "profile-social-tile-btn flex flex-col items-center justify-center",
          "rounded-xl text-center touch-manipulation",
          profileSocialTileFillClass,
          "transition-opacity",
          isInteractive
            ? "cursor-pointer hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            : "cursor-default",
          (disabled || loading) && onClick ? "opacity-70" : "",
        ].join(" ")}
      >
        {loading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--text)]/30 border-t-[var(--text)]/70"
            aria-hidden
          />
        ) : icon ? (
          <span className="profile-social-tile-icon flex h-6 w-6 items-center justify-center text-[var(--text)]/85">
            {icon}
          </span>
        ) : (
          <span className="profile-social-tile-value text-[18px] font-semibold leading-none tabular-nums text-[var(--text)]">
            {value ?? 0}
          </span>
        )}
        <span className="profile-social-tile-label mt-1 max-w-full truncate px-1 text-[9px] leading-none text-[var(--text)]/60">
          {label}
        </span>
      </button>
    </div>
  );
}
