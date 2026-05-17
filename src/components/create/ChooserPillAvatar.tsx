import React, { useEffect, useState } from "react";
import { optimizeImageUrl } from "../../lib/imageOptimization";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../../lib/avatarCache";

type Props = {
  url?: string | null;
  name?: string | null;
  userId?: string | null;
  /** Override default h-9 w-14 pill dimensions (e.g. invite thread header). */
  className?: string;
  /** Override default glass-active border (e.g. invite header side pill). */
  borderClassName?: string;
};

/**
 * Horizontal pill avatar with the same “active profile tab” treatment as BottomTab:
 * blurred mirror layer + sharp foreground image, clipped to a rounded pill (not a circle).
 */
const DEFAULT_PILL_CLASS =
  "relative h-9 w-14 shrink-0 overflow-hidden rounded-full border border-[var(--glass-active-border)] shadow-[var(--glass-active-shadow)]";

const DEFAULT_BORDER_CLASS =
  "border border-[var(--glass-active-border)]";

export default function ChooserPillAvatar({
  url,
  name,
  userId,
  className,
  borderClassName,
}: Props) {
  const letter = (name || "").trim().charAt(0).toUpperCase() || " ";
  const [cachedUrl, setCachedUrl] = useState<string | null>(() =>
    userId ? getCachedAvatar(userId) : null
  );

  useEffect(() => {
    if (!userId) {
      setCachedUrl(null);
      return;
    }
    const cached = getCachedAvatar(userId);
    if (cached) {
      setCachedUrl(cached);
      preloadAvatar(cached);
    } else if (url) {
      setCachedAvatar(userId, url);
      preloadAvatar(url);
      setCachedUrl(null);
    } else {
      setCachedUrl(null);
    }
  }, [userId, url]);

  const displayUrl = cachedUrl || url;
  const raw = avatarDisplayUrl(displayUrl);
  const resolved =
    raw &&
    (isAvatarPresetValue(displayUrl)
      ? raw
      : optimizeImageUrl(raw, "small"));

  const borderClass = borderClassName ?? DEFAULT_BORDER_CLASS;
  const pillClass = className
    ? `relative shrink-0 overflow-hidden rounded-full shadow-[var(--glass-active-shadow)] ${borderClass} ${className}`
    : DEFAULT_PILL_CLASS;

  return (
    <div className={pillClass} aria-hidden>
      {resolved ? (
        <>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              backgroundImage: `url(${resolved})`,
              backgroundSize: "250%",
              backgroundPosition: "center",
              filter: "blur(4px)",
              opacity: 0.88,
            }}
          />
          <img
            src={resolved}
            alt=""
            className="relative z-10 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            onLoad={() => {
              if (userId && displayUrl) setCachedAvatar(userId, displayUrl);
            }}
          />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-sm font-semibold"
          style={{
            background: "var(--brand)",
            color: "var(--brand-ink)",
          }}
        >
          {letter}
        </div>
      )}
    </div>
  );
}
