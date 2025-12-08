import React, { useState, useEffect } from "react";
import { IoNotifications, IoClose } from "react-icons/io5";

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
    <div className="mx-3 mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <IoNotifications size={20} className="text-blue-500" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[var(--text)] mb-1">
            Enable notifications
          </h3>
          <p className="text-xs text-[var(--text)]/70 mb-2">
            Get notified when someone likes your posts, follows you, or
            comments.
          </p>

          <div className="flex gap-2">
            <button
              onClick={requestPermission}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            >
              Enable
            </button>
            <button
              onClick={dismissBanner}
              className="px-3 py-1.5 text-xs text-[var(--text)]/50 hover:text-[var(--text)] transition-colors"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          onClick={dismissBanner}
          className="flex-shrink-0 text-[var(--text)]/30 hover:text-[var(--text)]/60 transition-colors"
        >
          <IoClose size={16} />
        </button>
      </div>
    </div>
  );
}
