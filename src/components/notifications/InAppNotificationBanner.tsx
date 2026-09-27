import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  dismissInAppNotification,
  type InAppNotificationPayload,
} from "../../lib/notifications/inAppNotificationBus";
import { devLogInAppNotification } from "../../lib/notifications/inAppNotificationDevLog";
import { resolveNotificationRoute } from "../../lib/notifications/notificationRouteResolver";
import { navigateFromNotificationRoute } from "../../lib/notifications/notificationRouteNavigation";

type Props = {
  notification: InAppNotificationPayload;
};

const glassSurface = [
  "rounded-2xl border border-[var(--glass-active-border,var(--bottom-tab-border))]",
  "bg-[color-mix(in_oklab,var(--glass-bg)_90%,var(--bg))]",
  "backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "shadow-[0_2px_10px_rgba(0,0,0,0.14),0_0_16px_color-mix(in_oklab,var(--brand)_14%,transparent)]",
  "app-dark:shadow-[0_4px_18px_rgba(0,0,0,0.35),0_0_18px_color-mix(in_oklab,var(--brand)_10%,transparent)]",
  "transition-[transform,opacity] duration-200 ease-out",
].join(" ");

export default function InAppNotificationBanner({ notification }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleDismiss = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      dismissInAppNotification(notification.id);
    },
    [notification.id]
  );

  const handleTap = useCallback(() => {
    const data = notification.routeData ?? { type: notification.kind };
    const route = resolveNotificationRoute(data);
    dismissInAppNotification(notification.id);

    devLogInAppNotification("banner_tap", {
      kind: notification.kind,
      supported: route.supported,
      reason: route.supported ? undefined : route.reason,
      path: route.supported ? route.path : undefined,
    });

    if (route.supported) {
      navigateFromNotificationRoute(navigate, location, route, {
        forceReopen: true,
      });
    }
  }, [notification, navigate, location]);

  const showAvatarColumn = notification.showAvatar !== false;
  const showAvatarImage =
    showAvatarColumn && Boolean(notification.avatarUrl);
  const showAvatarInitial =
    showAvatarColumn &&
    !notification.avatarUrl &&
    Boolean(notification.avatarInitial);
  const avatarInitial =
    notification.avatarInitial?.trim().charAt(0).toUpperCase() ||
    notification.title.trim().charAt(0).toUpperCase() ||
    "!";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[10040] flex justify-center px-4"
      style={{
        top: "calc(14px + env(safe-area-inset-top, 0px))",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTap();
          }
        }}
        className={`pointer-events-auto flex w-full max-w-[min(420px,calc(100vw-32px))] cursor-pointer items-start text-left active:scale-[0.99] ${glassSurface} ${
          showAvatarColumn ? "gap-2.5 px-3 py-2.5" : "gap-0 px-3.5 py-2.5"
        }`}
      >
        {showAvatarImage && notification.avatarUrl ? (
          <img
            src={notification.avatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
          />
        ) : null}
        {showAvatarInitial ? (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--brand)_20%,var(--glass-bg))] text-[14px] font-semibold text-[var(--text)] ring-1 ring-[var(--border)]"
          >
            {avatarInitial}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-[var(--text)]">
            {notification.title}
          </span>
          {notification.body ? (
            <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-[var(--text-muted,var(--text))] opacity-[0.82]">
              {notification.body}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={handleDismiss}
          className="pointer-events-auto -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text)] opacity-55 transition hover:bg-[var(--glass-active-bg)] hover:opacity-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 3l8 8M11 3L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
