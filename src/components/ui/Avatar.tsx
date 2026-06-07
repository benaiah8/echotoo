// src/components/ui/Avatar.tsx
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import React, { useState, useEffect, useMemo } from "react";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../../lib/avatarCache";

export default function Avatar({
  url,
  name,
  size = 96,
  onClick,
  variant = "default",
  anonymousAvatar,
  userId, // [OPTIMIZATION: Phase 3.2] Optional userId for cache lookup
  className = "",
  tightLineBox = false,
  /** When true, omit inner click/keyboard handlers (e.g. parent row handles taps). */
  disableInnerPointer = false,
  /** When false, sets `draggable={false}` on the avatar image. Default true (browser default). */
  imageDraggable = true,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  onClick?: () => void;
  variant?: "default" | "friends" | "anon";
  anonymousAvatar?: string | null; // NEW: custom anonymous avatar
  userId?: string | null; // [OPTIMIZATION: Phase 3.2] Optional userId for cache lookup
  /** Merges onto the root wrapper (e.g. flex centering in toolbars). */
  className?: string;
  /**
   * If true, removes the extra line-box gap that can appear below the inner
   * `inline-block` shell (e.g. in dense flex rows like `DrawerProfileCard` pill).
   * Default `false` keeps prior layout everywhere else.
   */
  tightLineBox?: boolean;
  disableInnerPointer?: boolean;
  imageDraggable?: boolean;
}) {
  const letter =
    variant === "anon" && anonymousAvatar
      ? anonymousAvatar.trim()
      : (name || "").trim().charAt(0).toUpperCase() || " ";
  const s = `${size}px`;
  const [showAnonymousMessage, setShowAnonymousMessage] = useState(false);

  /**
   * Display precedence: anonymous → pass through; no userId → `url`; with userId →
   * non-empty prop `url` always wins over localStorage avatar cache (stale CDN / owl preset migrations).
   * Only when prop is absent/empty do we fall back to getCachedAvatar.
   */
  const displayUrl = useMemo(() => {
    if (variant === "anon") return url ?? undefined;
    if (!userId) return url ?? undefined;
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed !== "") return url ?? undefined;
    return getCachedAvatar(userId) ?? undefined;
  }, [variant, userId, url]);

  useEffect(() => {
    if (!userId || variant === "anon") return;
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed === "") return;
    const cached = getCachedAvatar(userId);
    if (cached !== url) {
      setCachedAvatar(userId, url as string);
      preloadAvatar(url as string);
    }
  }, [userId, variant, url]);

  const resolvedAvatarSrc = avatarDisplayUrl(displayUrl);

  const handleClick = () => {
    if (variant === "anon") {
      // Show funny anonymous message instead of navigating
      setShowAnonymousMessage(true);
      setTimeout(() => setShowAnonymousMessage(false), 3000);
    } else {
      // Normal navigation for default and friends
      onClick?.();
    }
  };

  const getBorderStyle = () => {
    switch (variant) {
      case "friends":
        return {
          border: "2px solid #22c55e",
          boxShadow: "0 0 0 1px var(--text), 0 0 8px rgba(34, 197, 94, 0.4)",
        };
      case "anon":
        return {
          border: "2px solid #ffffff",
          boxShadow: "0 0 0 1px var(--text)",
        };
      default:
        return {
          border: "none",
          boxShadow: "0 0 0 1px var(--text)",
        };
    }
  };

  const getBackgroundStyle = () => {
    if (variant === "anon") {
      return {
        background: "#000000",
        color: "#edbd00", // Theme yellow
      };
    }
    return {
      background: "var(--brand)",
      color: "var(--brand-ink)",
    };
  };

  return (
    <div className={className ? `relative ${className}` : "relative"}>
      <div
        className={`relative inline-block leading-none${
          tightLineBox ? " [vertical-align:top]" : ""
        }`}
      >
        <div
          className={`relative rounded-full overflow-hidden ${
            onClick && !disableInnerPointer
              ? "cursor-pointer hover:opacity-80 transition-opacity"
              : ""
          }`}
          style={{ width: s, height: s, ...getBorderStyle() }}
          aria-label="avatar"
          {...(disableInnerPointer
            ? {}
            : {
                onClick: handleClick,
                role: onClick ? ("button" as const) : undefined,
                tabIndex: onClick ? 0 : undefined,
                onKeyDown: onClick
                  ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick();
                      }
                    }
                  : undefined,
              })}
        >
          {resolvedAvatarSrc ? (
            <img
              src={resolvedAvatarSrc}
              alt=""
              className="w-full h-full object-cover rounded-full"
              loading="lazy"
              draggable={imageDraggable ? undefined : false}
              onLoad={() => {
                // [OPTIMIZATION: Phase 3.2] Cache the URL when it loads successfully (if userId provided)
                if (userId && variant !== "anon" && displayUrl) {
                  setCachedAvatar(userId, displayUrl);
                }
              }}
            />
          ) : (
            <div
              className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold leading-none"
              style={{
                ...getBackgroundStyle(),
                fontSize: Math.max(12, Math.round((size ?? 48) * 0.45)) + "px",
                lineHeight: 1,
              }}
            >
              {variant === "anon" && !anonymousAvatar ? (
                <svg
                  width={Math.max(16, Math.round((size ?? 48) * 0.4))}
                  height={Math.max(16, Math.round((size ?? 48) * 0.4))}
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    filter: "drop-shadow(0 2px 4px rgba(237, 189, 0, 0.3))",
                  }}
                >
                  {/* Hat shadow */}
                  <path
                    d="M6 12C6 8.5 8.5 6 12 6C15.5 6 18 8.5 18 12L20 12C20 7.5 16.5 4 12 4C7.5 4 4 7.5 4 12L6 12Z"
                    fill="rgba(237, 189, 0, 0.2)"
                    transform="translate(0, 1)"
                  />
                  {/* Hat brim */}
                  <path
                    d="M4 12C4 8.5 6.5 6 10 6H14C17.5 6 20 8.5 20 12C20 15.5 17.5 18 14 18H10C6.5 18 4 15.5 4 12Z"
                    fill="#edbd00"
                    stroke="#edbd00"
                    strokeWidth="0.5"
                  />
                  {/* Hat crown */}
                  <path
                    d="M7 12C7 9.5 8.5 8 11 8H13C15.5 8 17 9.5 17 12C17 14.5 15.5 16 13 16H11C8.5 16 7 14.5 7 12Z"
                    fill="#edbd00"
                  />
                </svg>
              ) : (
                letter
              )}
            </div>
          )}
        </div>
      </div>

      {/* Anonymous message panel */}
      {showAnonymousMessage && variant === "anon" && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 shadow-lg max-w-xs">
            <div className="text-center">
              <div className="text-2xl mb-2">🤫</div>
              <div className="text-sm text-[var(--text)]/90 font-medium">
                Don't be nosy! 😄
              </div>
              <div className="text-xs text-[var(--text)]/70 mt-1">
                Mind your own business, detective!
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
