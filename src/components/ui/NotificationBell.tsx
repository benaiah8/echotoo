import React, { useState, useEffect } from "react";
import { FaBell, FaBellSlash } from "react-icons/fa";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";
import { getViewerId } from "../../api/services/follows";
import {
  getCachedNotificationSettings,
  setCachedNotificationSettings,
} from "../../lib/notificationSettingsCache";

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

  // Load cached notification settings immediately, then fetch fresh
  useEffect(() => {
    if (!isFollowing) {
      setIsEnabled(false);
      setInitializing(false);
      return;
    }

    (async () => {
      // Try to get viewer profile ID from localStorage first (fast, synchronous)
      const storedProfileId = localStorage.getItem("my_profile_id");
      let viewerProfileId: string | null = null;
      let cachedEnabled: boolean | null = null;

      if (storedProfileId) {
        // Use stored profile ID to check cache immediately
        viewerProfileId = storedProfileId;

        // Load cached settings immediately (synchronous, instant)
        cachedEnabled = getCachedNotificationSettings(viewerProfileId, targetId);
        if (cachedEnabled !== null) {
          console.log(
            "[NotificationBell] Using cached notification settings (instant):",
            cachedEnabled
          );
          setIsEnabled(cachedEnabled);
          setInitializing(false);
        } else {
          setInitializing(true);
        }
      } else {
        // No stored profile ID, need to fetch it
        setInitializing(true);
      }

      // Fetch viewer profile ID if not stored (or verify stored one is correct)
      const fetchedViewerId = await getViewerId();

      // Update stored profile ID if we got a new one
      if (fetchedViewerId && fetchedViewerId !== storedProfileId) {
        localStorage.setItem("my_profile_id", fetchedViewerId);
      }

      const finalViewerId = fetchedViewerId || viewerProfileId;

      if (!finalViewerId) {
        setInitializing(false);
        return;
      }

      // If we didn't have cached settings with stored ID, check cache again with fetched ID
      if (cachedEnabled === null && finalViewerId !== viewerProfileId) {
        cachedEnabled = getCachedNotificationSettings(finalViewerId, targetId);
        if (cachedEnabled !== null) {
          setIsEnabled(cachedEnabled);
          setInitializing(false);
        }
      }

      // Fetch fresh settings in background
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setInitializing(false);
          return;
        }

        // Get current user's profile ID
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (!profile?.id) {
          setInitializing(false);
          return;
        }

        // Check if notifications are enabled for this user
        const { data: notificationSettings } = await supabase
          .from("notification_settings")
          .select("enabled")
          .eq("user_id", profile.id)
          .eq("target_user_id", targetId)
          .single();

        const freshEnabled = notificationSettings?.enabled ?? true; // Default to enabled when following

        // Cache the fresh settings
        setCachedNotificationSettings(profile.id, targetId, freshEnabled);
        setIsEnabled(freshEnabled);
      } catch (error) {
        console.error("Error loading notification status:", error);
        // Keep cached settings if available, otherwise default to enabled
        if (cachedEnabled === null) {
          setIsEnabled(true);
        }
      } finally {
        setInitializing(false);
      }
    })();
  }, [targetId, isFollowing]);

  const toggleNotifications = async () => {
    if (loading || !isFollowing) return;

    setLoading(true);
    const previousEnabled = isEnabled;
    
    try {
      const viewerId = await getViewerId();
      if (!viewerId) {
        toast.error("Please sign in to manage notifications");
        setLoading(false);
        return;
      }

      const newEnabled = !isEnabled;
      
      // Update UI immediately (optimistic update)
      setIsEnabled(newEnabled);
      // Update cache immediately
      setCachedNotificationSettings(viewerId, targetId, newEnabled);

      if (newEnabled) {
        // Enable notifications
        const { error } = await supabase.from("notification_settings").upsert({
          user_id: viewerId,
          target_user_id: targetId,
          enabled: true,
        });

        if (error) {
          throw error;
        }
        toast.success("Notifications enabled");
      } else {
        // Disable notifications
        const { error } = await supabase
          .from("notification_settings")
          .delete()
          .eq("user_id", viewerId)
          .eq("target_user_id", targetId);

        if (error) {
          throw error;
        }
        toast.success("Notifications disabled");
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      toast.error("Failed to update notification settings");
      // Rollback on error
      setIsEnabled(previousEnabled);
      const viewerId = await getViewerId();
      if (viewerId) {
        setCachedNotificationSettings(viewerId, targetId, previousEnabled);
      }
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
