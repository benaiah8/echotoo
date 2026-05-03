import React, { useState, useEffect } from "react";
import { PiBell, PiX } from "react-icons/pi";

export default function NotificationPermissionBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null
  );

  useEffect(() => {
    // Check if notifications are supported
    if (!("Notification" in window)) {
      return;
    }

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    // Check if user dismissed it in this session first
    const dismissed = sessionStorage.getItem("notification_banner_dismissed");
    if (dismissed === "true") {
      setShowBanner(false);
      return;
    }

    // Show banner if permission is default (not requested yet)
    if (currentPermission === "default") {
      // Only show after a delay to avoid being too aggressive
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000); // Show after 3 seconds

      return () => clearTimeout(timer);
    }
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;

    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult === "granted") {
        setShowBanner(false);
        // You could show a success message or create a test notification here
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
    // Remember that user dismissed it for this session
    sessionStorage.setItem("notification_banner_dismissed", "true");
  };

  // Don't show if already requested or dismissed
  if (permission !== "default" || !showBanner) {
    return null;
  }

  return (
    <div className="mb-2.5 w-full rounded-[14px] border border-[var(--border)]/70 bg-[var(--surface-2)]/80 px-3 py-2.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-start gap-2.5">
        <div className="flex shrink-0 pt-0.5 text-sky-500 dark:text-sky-400">
          <PiBell size={18} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold leading-tight tracking-tight text-[var(--text)]">
            Enable notifications
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text)]/65">
            Get alerts for likes, follows, comments, and invites—only when they
            matter.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={requestPermission}
              className="rounded-full bg-sky-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-600 active:opacity-95 dark:bg-sky-500/95"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--text)]/55 hover:text-[var(--text)]/85"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissBanner}
          className="shrink-0 rounded-md p-0.5 text-[var(--text)]/35 transition-colors hover:bg-[var(--text)]/[0.06] hover:text-[var(--text)]/65"
          aria-label="Dismiss"
        >
          <PiX size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
