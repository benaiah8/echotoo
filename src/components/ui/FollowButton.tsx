import { useEffect, useState, useCallback } from "react";
import {
  getViewerId,
  follow as doFollow,
  unfollow as doUnfollow,
  getFollowStatus,
} from "../../api/services/follows";
import { supabase } from "../../lib/supabaseClient";
import {
  getCachedFollowStatus,
  setCachedFollowStatus,
  clearCachedFollowStatus,
} from "../../lib/followCache";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

type Props = {
  targetId: string; // profile id to follow/unfollow
  className?: string;
  onChange?: (nowFollowing: boolean) => void;
};

export default function FollowButton({
  targetId,
  className = "",
  onChange,
}: Props) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<
    "none" | "pending" | "following" | "friends" | "self" | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentAction, setCurrentAction] = useState<
    "follow" | "unfollow" | null
  >(null);
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;

  // Load initial follow status - check cache immediately, don't wait for auth
  useEffect(() => {
    let cancelled = false;

    const loadFollowStatus = async () => {
      try {
        // Try to get viewer ID from cache first (instant check for "It's you, silly!")
        let me: string | null = null;
        
        // Check localStorage for cached profile ID (set on login)
        try {
          const cachedMyProfileId = localStorage.getItem("my_profile_id");
          if (cachedMyProfileId) {
            me = cachedMyProfileId;
            setViewerId(me);
            // Quick self-check with cached ID - instant "It's you, silly!" check
            if (me === targetId) {
              setFollowStatus("self");
              setInitializing(false);
              return;
            }
          }
        } catch (e) {
          // Cache check failed, continue with normal flow
        }

        // If not found in cache, get it normally
        if (!me) {
          me = await getViewerId();
          if (cancelled) return;
          setViewerId(me);
          
          // Cache the profile ID for future instant checks
          if (me) {
            try {
              localStorage.setItem("my_profile_id", me);
            } catch (e) {
              // Silent fail
            }
          }
        }

        if (!me) {
          setFollowStatus("none");
          setInitializing(false);
          return;
        }

        // Convert targetId to profile ID if it's an auth user ID
        // Check cache first to avoid unnecessary DB query
        let targetProfileId = targetId;
        const cachedProfileIdKey = `profile_id_${targetId}`;
        const cachedProfileId = localStorage.getItem(cachedProfileIdKey);
        
        if (cachedProfileId) {
          targetProfileId = cachedProfileId;
        } else {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", targetId)
              .single();

            if (profile?.id) {
              targetProfileId = profile.id;
              // Cache the conversion for future use
              localStorage.setItem(cachedProfileIdKey, profile.id);
            } else {
              // If not found, assume targetId is already a profile ID
              // Cache that assumption to avoid repeated queries
              localStorage.setItem(cachedProfileIdKey, targetId);
            }
          } catch (error) {
            // targetId is likely already a profile ID
            // Cache that assumption
            localStorage.setItem(cachedProfileIdKey, targetId);
          }
        }

        // Check if it's self - only compare viewer ID with target profile ID
        // targetProfileId === targetId is always true when targetId is already a profile ID, so we don't check that
        if (me === targetProfileId) {
          setFollowStatus("self");
          setInitializing(false);
          return;
        }

        // Check cache first - this is instant!
        const cachedStatus = getCachedFollowStatus(me, targetProfileId);
        if (cachedStatus) {
          setFollowStatus(cachedStatus);
          setInitializing(false);
          // Still verify in background, but show cached status immediately
          getFollowStatus(me, targetProfileId)
            .then((actualStatus) => {
              if (!cancelled && actualStatus !== cachedStatus) {
                setFollowStatus(actualStatus);
                // Only cache non-pending statuses
                if (actualStatus !== "pending" && me) {
                  setCachedFollowStatus(me, targetProfileId, actualStatus as "none" | "following" | "friends" | "self");
                }
              }
            })
            .catch(() => {
              // Silently fail background verification
            });
          return;
        }

        // No cache - fetch actual status
        const status = await getFollowStatus(me, targetProfileId);
        if (me && status !== "pending") {
          setCachedFollowStatus(me, targetProfileId, status as "none" | "following" | "friends" | "self");
        }

        if (!cancelled) {
          setFollowStatus(status);
        }
      } catch (error) {
        console.error("Error loading follow status:", error);
        if (!cancelled) {
          setFollowStatus("none");
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    loadFollowStatus();

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  // Listen for follow changes from other components
  useEffect(() => {
    const handleFollowChange = (event: CustomEvent) => {
      const { targetId: changedTargetId, nowFollowing } = event.detail || {};
      if (changedTargetId === targetId && viewerId) {
        // Refresh follow status when this user's follow status changes elsewhere
        getFollowStatus(viewerId, targetId).then((status) => {
          setFollowStatus(status);
          if (status !== "pending") {
            setCachedFollowStatus(viewerId, targetId, status as "none" | "following" | "friends" | "self");
          }
        });
      }
    };

    window.addEventListener(
      "follow:changed",
      handleFollowChange as EventListener
    );
    return () => {
      window.removeEventListener(
        "follow:changed",
        handleFollowChange as EventListener
      );
    };
  }, [targetId, viewerId]);

  // Get the correct profile ID - handle both auth user IDs and profile IDs
  const getTargetProfileId = useCallback(async (): Promise<string | null> => {
    if (!targetId) return null;

    try {
      // First try to see if targetId is an auth user ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", targetId)
        .single();

      if (profile?.id) {
        return profile.id;
      }
    } catch (error) {
      // targetId is likely already a profile ID
    }

    // Verify it's a real profile ID
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .single();

      if (error || !profile) {
        return null;
      }

      return targetId;
    } catch (error) {
      return null;
    }
  }, [targetId]);

  const onToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isProcessing || !viewerId || followStatus === "self") {
      return;
    }

    const previousStatus = followStatus;
    // Include "pending" status so users can cancel pending requests
    const wasFollowing =
      followStatus === "following" || followStatus === "friends" || followStatus === "pending";

    // INSTANT UI UPDATE - show processing state immediately
    setIsProcessing(true);
    setHasError(false);
    // When pending, clicking should cancel (unfollow), not follow again
    setCurrentAction(wasFollowing ? "unfollow" : "follow");

    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.warn("[FollowButton] Safety timeout - clearing loading state");
      setIsProcessing(false);
      setCurrentAction(null);
    }, 10000); // 10 second safety timeout

    try {
      const targetProfileId = await getTargetProfileId();
      if (!targetProfileId) {
        toast.error("Couldn't follow user");
        setHasError(true);
        setIsProcessing(false);
        setCurrentAction(null);
        clearTimeout(safetyTimeout);
        return;
      }

      // Now do the actual API call
      let result;
      if (wasFollowing) {
        result = await doUnfollow(targetProfileId);
      } else {
        result = await doFollow(targetProfileId);
      }

      if (result.error) {
        // API failed - revert the UI change
        setFollowStatus(previousStatus);
        onChange?.(wasFollowing);

        const errorMessage =
          result.error.message ||
          (wasFollowing 
            ? "Couldn't cancel request" 
            : "Couldn't follow");
        toast.error(errorMessage);
        setHasError(true);
        setIsProcessing(false);
        setCurrentAction(null);
        clearTimeout(safetyTimeout);
      } else {
        // API succeeded - clear loading state immediately
        setCurrentAction(null);
        setIsProcessing(false);
        clearTimeout(safetyTimeout);

        // [OPTIMIZATION: Phase 2 - Performance] Optimistic update with immediate cache update
        // Why: Instant UI feedback, verify status in background without blocking UI
        if (viewerId) {
          // Optimistically update cache and UI immediately
          // If wasFollowing (including pending), set to "none". Otherwise set to "following"
          const optimisticStatus = wasFollowing ? "none" : "following";
          setCachedFollowStatus(viewerId, targetProfileId, optimisticStatus);
          setFollowStatus(optimisticStatus);
          onChange?.(!wasFollowing);

          // Verify actual status in background (non-blocking)
          getFollowStatus(viewerId, targetProfileId)
            .then((actualStatus) => {
              // Only update if different from optimistic
              if (actualStatus !== optimisticStatus) {
                setFollowStatus(actualStatus);
                if (actualStatus !== "pending") {
                  setCachedFollowStatus(viewerId, targetProfileId, actualStatus as "none" | "following" | "friends" | "self");
                }
                const actualIsFollowing =
                  actualStatus === "following" || actualStatus === "friends";
                onChange?.(actualIsFollowing);
              }
            })
            .catch((error) => {
              console.error("Error verifying follow status:", error);
              // Keep optimistic update on error
            });

          // Dispatch event for other components
          window.dispatchEvent(
            new CustomEvent("follow:changed", {
              detail: {
                targetId: targetProfileId,
                nowFollowing: !wasFollowing,
              },
            })
          );
        }
      }
    } catch (error) {
      // Exception occurred - revert the UI change
      setFollowStatus(previousStatus);
      onChange?.(wasFollowing);
      toast.error("Couldn't follow");
      setHasError(true);
      setIsProcessing(false);
      setCurrentAction(null);
      clearTimeout(safetyTimeout);
    }
  };

  const isSelfOrGuest = !viewerId || followStatus === "self";
  const isSelf = followStatus === "self";

  // Don't show button if not authenticated or viewing self
  if (!viewerId && !initializing) {
    return null;
  }

  // Show loading skeleton while initializing
  if (initializing) {
    return (
      <div
        className={`h-6 min-w-[80px] px-2 rounded-full bg-[var(--text)]/10 border border-[var(--border)] animate-pulse ${className}`}
      />
    );
  }

  // Don't show for self
  if (isSelf) {
    return (
      <div
        className={`h-6 min-w-[80px] px-2 rounded-full text-[10px] flex items-center justify-center border ${className}`}
        style={{
          background: "var(--blue-bg)",
          color: "var(--blue-text)",
          borderColor: "var(--blue-border)",
        }}
      >
        <span>It's you, silly! 😊</span>
      </div>
    );
  }

  // Button styles with instant animations
  const baseClass =
    "h-6 min-w-[80px] px-2 rounded-full text-[10px] border transition-all duration-200 ease-out inline-flex items-center justify-center transform active:scale-95 hover:scale-105";

  const getStateClass = () => {
    if (hasError) {
      return "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse";
    }
    if (isProcessing && currentAction) {
      // Show more prominent loading state with brand colors based on action
      return currentAction === "follow"
        ? "bg-[var(--brand)]/80 text-[var(--brand-ink)] border-[var(--brand)] animate-pulse"
        : "bg-gray-500/30 text-gray-300 border-gray-500/50 animate-pulse";
    }
    if (followStatus === "friends") {
      return "text-[var(--green-text)] border-[var(--green-border)] hover:brightness-110";
      // CSS will be: background: var(--green-bg);
    }
    if (followStatus === "following") {
      return "bg-white/10 text-white border-white/20 hover:bg-white/20";
    }
    return "bg-[var(--brand)] text-[var(--brand-ink)] border-[var(--brand)] hover:bg-[var(--brand)]/90 hover:shadow-md";
  };

  const getButtonText = () => {
    if (hasError) return "Try again";
    if (isProcessing && currentAction) {
      return currentAction === "follow" ? "Following..." : followStatus === "pending" ? "Canceling..." : "Unfollowing...";
    }
    if (followStatus === "friends") return "Friends";
    if (followStatus === "following") return "Following";
    if (followStatus === "pending") return "Requested";
    return "Follow";
  };

  const disabledClass =
    (!isProcessing && initializing) || (!isProcessing && isSelfOrGuest)
      ? "opacity-60 cursor-not-allowed"
      : isProcessing
      ? "cursor-wait"
      : "hover:shadow-md cursor-pointer";

  return (
    <button
      onClick={onToggle}
      disabled={isProcessing || initializing || isSelfOrGuest}
      className={`${baseClass} ${getStateClass()} ${disabledClass} ${className}`}
      style={{
        ...(followStatus === "friends" && {
          background: "var(--green-bg)",
        }),
      }}
      aria-label={getButtonText()}
    >
      <span className="transition-all duration-200 ease-out">
        {getButtonText()}
      </span>

      {/* Loading spinner when processing */}
      {isProcessing && currentAction && (
        <div className="ml-1 flex items-center">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </button>
  );
}
