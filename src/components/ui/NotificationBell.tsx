import React, { useState, useEffect } from "react";
import { FaBell, FaBellSlash } from "react-icons/fa";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";

type Props = {
  targetId: string; // profile id to toggle notifications for
  className?: string;
  isFollowing?: boolean; // whether user is following this person
};

export default function NotificationBell({
  targetId,
  className = "",
  isFollowing = false,
}: Props) {
  const [isEnabled, setIsEnabled] = useState(true); // Default to enabled for immediate display
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false); // Start as false for immediate display

  // Load initial notification status
  useEffect(() => {
    if (!isFollowing) {
      setIsEnabled(false);
      setInitializing(false);
      return;
    }

    const loadNotificationStatus = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get current user's profile ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (!profile?.id) return;

        // Check if notifications are enabled for this user
        const { data: notificationSettings } = await supabase
          .from("notification_settings")
          .select("enabled")
          .eq("user_id", profile.id)
          .eq("target_user_id", targetId)
          .single();

        setIsEnabled(notificationSettings?.enabled ?? true); // Default to enabled when following
      } catch (error) {
        console.error("Error loading notification status:", error);
        setIsEnabled(true); // Default to enabled
      } finally {
        setInitializing(false);
      }
    };

    loadNotificationStatus();
  }, [targetId, isFollowing]);

  const toggleNotifications = async () => {
    if (loading || !isFollowing) return;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to manage notifications");
        return;
      }

      // Get current user's profile ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.id) {
        toast.error("Profile not found");
        return;
      }

      if (isEnabled) {
        // Disable notifications
        const { error } = await supabase
          .from("notification_settings")
          .delete()
          .eq("user_id", profile.id)
          .eq("target_user_id", targetId);

        if (error) throw error;
        setIsEnabled(false);
        toast.success("Notifications disabled");
      } else {
        // Enable notifications
        const { error } = await supabase.from("notification_settings").upsert({
          user_id: profile.id,
          target_user_id: targetId,
          enabled: true,
        });

        if (error) throw error;
        setIsEnabled(true);
        toast.success("Notifications enabled");
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      toast.error("Failed to update notification settings");
    } finally {
      setLoading(false);
    }
  };

  // Don't show if not following or still initializing
  if (!isFollowing || initializing) {
    return null;
  }

  return (
    <button
      onClick={toggleNotifications}
      disabled={loading}
      className={`h-6 w-6 rounded-md border transition-all duration-200 ease-out inline-flex items-center justify-center transform active:scale-95 hover:scale-105 ${
        isEnabled
          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
          : "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30"
      } ${
        loading ? "animate-pulse cursor-wait" : "cursor-pointer"
      } ${className}`}
      title={isEnabled ? "Disable notifications" : "Enable notifications"}
    >
      {isEnabled ? (
        <FaBell className="text-sm" />
      ) : (
        <FaBellSlash className="text-sm" />
      )}
    </button>
  );
}
