import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  dismissInAppNotification,
  type InAppNotificationPayload,
} from "../../lib/notifications/inAppNotificationBus";
import {
  resolveNotificationRoute,
} from "../../lib/notifications/notificationRouteResolver";
import { navigateFromNotificationRoute } from "../../lib/notifications/notificationRouteNavigation";

type Props = {
  notification: InAppNotificationPayload;
};

const glassSurface =
  "rounded-2xl border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] shadow-[0_4px_24px_rgba(0,0,0,0.18),0_0_20px_color-mix(in_oklab,var(--brand)_10%,transparent)]";

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
    if (route.supported) {
      navigateFromNotificationRoute(navigate, location, route);
    }
  }, [notification, navigate, location]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[10040] flex justify-center px-3"
      style={{
        top: "calc(12px + env(safe-area-inset-top, 0px))",
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
        className={`pointer-events-auto flex w-full max-w-md cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition active:scale-[0.99] ${glassSurface}`}
      >
        {notification.avatarUrl ? (
          <img
            src={notification.avatarUrl}
            alt=""
            className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--bottom-tab-border)]"
          />
        ) : (
          <span
            aria-hidden
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--brand)_18%,var(--glass-bg))] text-[13px] font-semibold text-[var(--text)]"
          >
            {notification.title.trim().charAt(0).toUpperCase() || "!"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-snug text-[var(--text)]">
            {notification.title}
          </span>
          {notification.body ? (
            <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-[var(--text-muted,var(--text))] opacity-80">
              {notification.body}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={handleDismiss}
          className="pointer-events-auto -mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text)] opacity-60 transition hover:bg-[var(--glass-active-bg)] hover:opacity-100"
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
