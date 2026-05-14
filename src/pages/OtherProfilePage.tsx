import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import OtherProfilePostsSection from "../sections/profile/OtherProfilePostsSection";
import { supabase } from "../lib/supabaseClient";
import { ProfileProvider, type Profile } from "../contexts/ProfileContext";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { RootState } from "../app/store";
import { Paths } from "../router/Paths";
import { dispatchBottomTabPeek } from "../lib/bottomTabPeek";
import {
  PiClock,
  PiLock,
  PiShareFat,
  PiUserCheck,
  PiUserPlus,
} from "react-icons/pi";
import WelcomeModal from "../components/ui/WelcomeModal";
import ProfileTopBar from "../components/profile/ProfileTopBar";
import ProfileSearchResults from "../components/profile/ProfileSearchResults";
import {
  getProfileCached,
  primeProfileCache,
  invalidateProfile,
} from "../lib/profileCache";
import {
  getFollowCounts,
  getFollowStatus,
  follow as doFollow,
  unfollow as doUnfollow,
  getViewerId,
  getViewerAuthUserId,
} from "../api/services/follows";
import {
  getCachedFollowStatus,
  setCachedFollowStatus,
  clearCachedFollowStatus,
  type FollowStatus,
} from "../lib/followStatusCache";
import {
  getCachedFollowCounts,
  setCachedFollowCounts,
  clearCachedFollowCounts,
} from "../lib/followCountsCache";
import { clearCachedNotificationSettings } from "../lib/notificationSettingsCache";
import { avatarDisplayUrl } from "../lib/avatarDisplayUrl";
import FollowListDrawer from "../components/profile/FollowListDrawer";
import AvatarPreviewLightbox, {
  AvatarPreviewLightboxAction,
} from "../components/profile/AvatarPreviewLightbox";
import Avatar from "../components/ui/Avatar";
import SocialMediaLinks from "../components/profile/SocialMediaLinks";
import ShareProfileModal from "../components/profile/ShareProfileModal";
import ProfileHeroAvatarAtmosphere from "../components/profile/ProfileHeroAvatarAtmosphere";
import ProfileStats from "../components/profile/ProfileStats";
import MemberNumberPill from "../components/profile/MemberNumberPill";
import NotificationBell from "../components/ui/NotificationBell";
import { handleError, getErrorMessage } from "../lib/errorHandling";
import toast from "react-hot-toast";
import ReportModal from "../components/ui/ReportModal";
import { invalidatePostDetailCacheForViewer } from "../api/queries/getPostById";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import {
  blockUser,
  isBlockingUser,
  unblockUser,
} from "../api/services/blocks";
import { submitProfileReport } from "../api/services/reports";
import { clearAllCommentsClientCache } from "../api/services/comments";
import {
  buildProfileReportDraftFromProfile,
  type ReportDraft,
} from "../types/report";
import { getPublicShareBaseUrl } from "../lib/publicSiteUrl";
import { shareUrl } from "../lib/shareUrl";
import { useTabActive } from "../router/PersistentTabContainer.new";
import {
  HOME_TAB_REFRESH_EVENT,
  PROFILE_TAB_REFRESH_EVENT,
} from "../lib/homeRefreshEvents";
import { dataCache } from "../lib/dataCache";
import { useHomePullToRefresh } from "../hooks/useHomePullToRefresh";

const AUTOMATIC_BLOCK_MODERATION_DETAILS =
  "Automatic moderation signal: this profile was blocked by a user. Please review for potential abusive or objectionable behavior.";

/**
 * OtherProfilePage - Page for /u/:username route
 * - Hardcoded share button in top bar (always visible)
 * - Follow button in hero (not share/logout)
 * - No conditional logic for ownership
 * - Uses OtherProfilePostsSection
 */
interface OtherProfilePageProps {
  username?: string; // [FIX] Accept username as prop when rendered inside PersistentTabContainer
}

export default function OtherProfilePage({
  username: usernameProp,
}: OtherProfilePageProps = {}) {
  // [FIX] Get username from prop (when rendered in PersistentTabContainer) or useParams (when rendered by Route)
  // This fixes the issue where useParams() doesn't work inside PersistentTabContainer
  const paramsUsername = useParams<{ username?: string }>().username;
  const username = usernameProp ?? paramsUsername; // Use ?? instead of || to handle empty strings

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("[OtherProfilePage] username:", {
      fromProp: usernameProp,
      fromParams: paramsUsername,
      final: username,
    });
  }, [usernameProp, paramsUsername, username]);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();

  // [FIX] Use parent tab active status from PersistentTabContainer - stops background fetches when Other Profile tab is display:none
  const isOtherProfileVisible = useTabActive("other-profile");

  const [otherProfileFeedRefreshEpoch, setOtherProfileFeedRefreshEpoch] =
    useState(0);
  const [profileReloadNonce, setProfileReloadNonce] = useState(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  // [FIX] Stabilize profile reference to prevent cascading re-renders
  // ProfileProvider value changes on every profile reference change, causing all consumers to re-render
  // This ensures ProfileProvider only updates when profile data actually changes, not just the reference
  const stableProfileRef = useRef<Profile | null>(null);
  const stableProfile = useMemo(() => {
    // If profile is null, return null immediately
    if (!profile) {
      stableProfileRef.current = null;
      return null;
    }

    const current = stableProfileRef.current;

    // First render - set and return
    if (!current) {
      stableProfileRef.current = profile;
      return profile;
    }

    // Deep equality check - only update if profile data actually changed
    // Compare critical fields that affect rendering
    const dataChanged =
      current.id !== profile.id ||
      current.user_id !== profile.user_id ||
      current.username !== profile.username ||
      current.display_name !== profile.display_name ||
      current.avatar_url !== profile.avatar_url ||
      current.is_private !== profile.is_private ||
      current.bio !== profile.bio ||
      current.member_no !== profile.member_no;

    if (!dataChanged) {
      // Data is same, keep old reference to prevent re-renders
      return current;
    }

    // Data changed - update ref and return new profile
    stableProfileRef.current = profile;
    return profile;
  }, [
    profile?.id,
    profile?.user_id,
    profile?.username,
    profile?.display_name,
    profile?.avatar_url,
    profile?.is_private,
    profile?.bio,
    profile?.member_no,
  ]);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
  const [profileSearchFocused, setProfileSearchFocused] = useState(false);
  const profileSearchPinnedRef = useRef(false);
  const lastY = useRef<number>(
    typeof window !== "undefined" ? window.scrollY : 0
  );
  const ticking = useRef(false);

  useEffect(() => {
    profileSearchPinnedRef.current =
      profileSearchFocused || userQuery.trim().length > 0;
  }, [profileSearchFocused, userQuery]);

  useEffect(() => {
    if (profileSearchFocused || userQuery.trim().length > 0) {
      setHeaderHidden(false);
    }
  }, [profileSearchFocused, userQuery]);

  useEffect(() => {
    if (!isOtherProfileVisible) return;
    dispatchBottomTabPeek("other-profile", headerHidden);
  }, [headerHidden, isOtherProfileVisible]);

  // Hero section state
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [countsLoading, setCountsLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState<FollowStatus | null>(null); // null = unknown/loading
  const [followStatusLoading, setFollowStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<
    false | "followers" | "following"
  >(false);
  const [lightbox, setLightbox] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = checking, true = has access, false = no access
  const [showPrivateTooltip, setShowPrivateTooltip] = useState(false);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  // auth state and modal state for logo functionality
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const handleRequestProfileReport = useCallback(() => {
    const authLoading = authState?.loading ?? true;
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }
    if (!profile?.id || !profile.user_id) {
      toast.error("Unable to report this profile right now.");
      return;
    }
    setReportDraft(buildProfileReportDraftFromProfile(profile));
  }, [authState?.loading, dispatch, isAuthenticated, profile]);

  const flushCachesAfterBlockChange = useCallback(async () => {
    await dataCache.clearFeedCache();
    if (profile?.id) invalidateProfile(profile.id);
    invalidatePostDetailCacheForViewer(viewerId);
    window.dispatchEvent(new CustomEvent(PROFILE_TAB_REFRESH_EVENT));
    window.dispatchEvent(new CustomEvent(HOME_TAB_REFRESH_EVENT));
  }, [profile?.id, viewerId]);

  const handleUnblockUser = useCallback(async () => {
    if (!profile?.user_id) return;
    setBlockActionLoading(true);
    try {
      await unblockUser(profile.user_id);
      await flushCachesAfterBlockChange();
      setIsBlocked(false);
      setProfileReloadNonce((n) => n + 1);
      toast.success("Unblocked");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBlockActionLoading(false);
    }
  }, [profile?.user_id, flushCachesAfterBlockChange]);

  const handleConfirmBlockUser = useCallback(async () => {
    if (!profile?.user_id) return;
    setBlockActionLoading(true);
    try {
      await blockUser(profile.user_id);

      try {
        if (profile.id) {
          await submitProfileReport({
            targetProfileId: profile.id,
            targetOwnerUserId: profile.user_id,
            reason: "other",
            details: AUTOMATIC_BLOCK_MODERATION_DETAILS,
          });
        }
      } catch (reportErr) {
        console.warn(
          "[OtherProfilePage] Automatic moderation signal after block failed:",
          reportErr
        );
      }

      await flushCachesAfterBlockChange();
      clearAllCommentsClientCache();

      setShowBlockConfirm(false);
      setIsBlocked(true);
      setProfile(null);
      navigate(Paths.home, { replace: true });
      toast.success("Blocked");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBlockActionLoading(false);
    }
  }, [profile?.user_id, profile?.id, flushCachesAfterBlockChange, navigate]);

  const [showInfoModal, setShowInfoModal] = useState(false);

  // Get viewer ID
  useEffect(() => {
    if (!isOtherProfileVisible) return;
    let cancelled = false;
    getViewerAuthUserId().then((uid) => {
      if (!cancelled) setViewerId(uid);
    });
    return () => {
      cancelled = true;
    };
  }, [isOtherProfileVisible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.user_id || !viewerId || profile.user_id === viewerId) {
        if (!cancelled) setIsBlocked(false);
        return;
      }
      try {
        const b = await isBlockingUser(profile.user_id);
        if (!cancelled) setIsBlocked(b);
      } catch {
        if (!cancelled) setIsBlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.user_id, viewerId]);

  /** Viewer has an active block row against this profile owner (auth ids). */
  const shellMode = useMemo(
    () =>
      Boolean(
        profile &&
          viewerId &&
          profile.user_id !== viewerId &&
          isBlocked
      ),
    [profile, viewerId, isBlocked]
  );

  useEffect(() => {
    const onTabRefresh = () => {
      if (!isOtherProfileVisible) return;
      const uid = profile?.user_id;
      if (uid) {
        try {
          dataCache.delete(`profile_created_${uid}`);
          dataCache.delete(`profile_interacted_${uid}`);
        } catch {
          /* noop */
        }
      }
      if (profile?.id) invalidateProfile(profile.id);
      setProfileReloadNonce((n) => n + 1);
      setOtherProfileFeedRefreshEpoch((n) => n + 1);
      if (import.meta.env.DEV) {
        console.debug("[profile-tab-refresh] other", { uid, username });
      }
    };
    window.addEventListener(PROFILE_TAB_REFRESH_EVENT, onTabRefresh);
    return () =>
      window.removeEventListener(PROFILE_TAB_REFRESH_EVENT, onTabRefresh);
  }, [isOtherProfileVisible, profile?.user_id, profile?.id, username]);

  const {
    pullPx,
    pullProgress,
    isRefreshing: ptrRefreshing,
  } = useHomePullToRefresh({
    enabled: isOtherProfileVisible,
    onCommit: () => {
      window.dispatchEvent(new CustomEvent(PROFILE_TAB_REFRESH_EVENT));
    },
    refreshEpoch: otherProfileFeedRefreshEpoch,
  });

  // Load profile by username/id
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!username) return;

      // Show cached instantly
      const cached = getProfileCached(username);
      if (cached) {
        setProfile(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const setSafe = (fn: () => void) => {
          if (!cancelled) fn();
        };

        const raw = username;
        // [FIX] Decode URL-encoded username before querying
        // If username comes from location.pathname (via PersistentTabContainer), it's URL-encoded
        // If it comes from useParams(), React Router already decoded it
        // decodeURIComponent is safe to call on already-decoded strings (will return as-is if no encoding)
        let decoded = raw;
        try {
          decoded = decodeURIComponent(raw);
        } catch (e) {
          // If decodeURIComponent fails (shouldn't happen with valid URLs), use raw (might already be decoded)
          console.warn(
            "[OtherProfilePage] Failed to decode username, using raw:",
            raw,
            e
          );
          decoded = raw;
        }

        const q = decoded.startsWith("@") ? decoded.slice(1) : decoded;

        // [PHASE 2.3 - OPTIMIZATION] Use getProfileByIdOrUsername() for unified lookup
        // Why: Consolidates id/username/user_id lookups into cache-first + single query approach
        // Replaces 3-4 separate queries with cache check + getProfileByUserId + single OR query
        const { getProfileByIdOrUsername } = await import(
          "../api/services/follows"
        );
        console.log("[OtherProfilePage] 🔍 Fetching profile for username:", q);
        const prof = await getProfileByIdOrUsername(q);
        console.log("[OtherProfilePage] 📥 Profile fetch result:", {
          found: !!prof,
          username: prof?.username || "null",
          userId: prof?.user_id || "null",
          profileId: prof?.id || "null",
        });

        setSafe(() =>
          setProfile(
            prof
              ? ({
                  ...prof,
                  is_private: prof.is_private ?? undefined,
                  social_media_public: prof.social_media_public ?? undefined,
                } as Profile)
              : null
          )
        );
        if (prof) {
          // [OPTIMIZATION: Phase 1 - Cache] Cache profile data including privacy settings
          // Why: Instant display of privacy status, prevents flicker on subsequent loads
          primeProfileCache({
            ...prof,
            member_no: prof.member_no ?? null,
            is_private: prof.is_private ?? null,
            social_media_public: prof.social_media_public ?? null,
          } as any);
        }
      } catch (e) {
        // [OPTIMIZATION: Phase 7.1.3] Use user-friendly error handling
        // Why: Shows clear error messages, graceful degradation to cached data
        handleError(e, "OtherProfilePage", false); // Don't show toast - graceful degradation

        if (!cancelled) {
          // [OPTIMIZATION: Phase 7.1.5] Graceful degradation - keep cached profile on error
          // Why: User still sees profile even if network request fails
          const cached = getProfileCached(username);
          if (cached) {
            setProfile(cached);
            setLoading(false);
          } else {
            setProfile(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, profileReloadNonce]);

  // Redirect to /profile if viewing own profile via /u/:username
  useEffect(() => {
    if (profile && viewerId && profile.user_id === viewerId) {
      navigate(Paths.profile, { replace: true });
    }
  }, [profile, viewerId, navigate]);

  // Handle profile updates
  useEffect(() => {
    const onProfileUpdated = async (e: any) => {
      const changedId: string | undefined = e.detail?.id;
      if (changedId) invalidateProfile(changedId);

      try {
        if (profile?.id && changedId === profile.id) {
          // [PHASE 2.3 - OPTIMIZATION] Use getCachedProfile() first, then getProfileByIdOrUsername if needed
          // Why: Reuses cache, avoids unnecessary queries
          let p = getProfileCached(profile.id);

          if (!p) {
            // If not in cache, use getProfileByIdOrUsername (handles caching)
            const { getProfileByIdOrUsername } = await import(
              "../api/services/follows"
            );
            p = await getProfileByIdOrUsername(profile.id);
          }

          if (p) {
            setProfile(p as Profile);
            // [OPTIMIZATION: Phase 1 - Cache] Cache profile data including privacy settings
            // Why: Instant display of updated privacy status, prevents flicker
            primeProfileCache({
              ...p,
              member_no: p.member_no ?? null,
              is_private:
                (p as Profile & { is_private?: boolean | null }).is_private ??
                null,
              social_media_public:
                (p as Profile & { social_media_public?: boolean | null })
                  .social_media_public ?? null,
            } as any);
          } else {
            setProfile(null);
          }
        }
      } catch {
        // No-op
      }
    };

    window.addEventListener("profile:updated", onProfileUpdated);
    return () =>
      window.removeEventListener("profile:updated", onProfileUpdated);
  }, [profile?.id]);

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          const delta = current - lastY.current;

          if (Math.abs(delta) > 6) {
            if (delta > 0 && current > 100) {
              if (!profileSearchPinnedRef.current) {
                setHeaderHidden(true);
              }
            } else {
              setHeaderHidden(false);
            }
            lastY.current = current;
          }

          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle logo click
  const handleLogoClick = () => {
    if (isAuthenticated) {
      setShowInfoModal(true);
    } else {
      dispatch(setAuthModal(true));
    }
  };

  // Hero section: Follow counts - Load cached immediately, then fetch fresh
  useEffect(() => {
    if (!profile?.id || shellMode) {
      setCountsLoading(false);
      return;
    }

    // Load cached counts immediately (synchronous, instant)
    const cachedCounts = getCachedFollowCounts(profile.id);
    if (cachedCounts) {
      console.log(
        "[OtherProfilePage] Using cached follow counts (stale-while-revalidate):",
        cachedCounts
      );
      setCounts(cachedCounts);
      setCountsLoading(false);
    } else {
      setCountsLoading(true);
    }

    // Fetch fresh counts in background
    getFollowCounts(profile.id)
      .then((counts) => {
        // Cache the fresh counts
        setCachedFollowCounts(profile.id, counts);
        setCounts(counts);
        setCountsLoading(false);
      })
      .catch(() => {
        // Keep cached counts if available, otherwise show 0
        if (!cachedCounts) {
          setCounts({ following: 0, followers: 0 });
        }
        setCountsLoading(false);
      });
  }, [profile?.id, shellMode]);

  // Hero section: Load cached follow status immediately, then fetch fresh
  useEffect(() => {
    (async () => {
      if (!profile?.id || shellMode) {
        setFollowStatus(null);
        return;
      }

      // Try to get viewer profile ID from localStorage first (fast, synchronous)
      const storedProfileId = localStorage.getItem("my_profile_id");
      let viewerProfileId: string | null = null;
      let cachedStatus: FollowStatus | null = null;

      if (storedProfileId) {
        // Use stored profile ID to check cache immediately
        viewerProfileId = storedProfileId;

        if (viewerProfileId === profile.id) {
          setFollowStatus("none");
          return;
        }

        // Load cached status immediately (synchronous, instant)
        cachedStatus = getCachedFollowStatus(viewerProfileId, profile.id);
        if (cachedStatus) {
          console.log(
            "[OtherProfilePage] Using cached follow status (instant):",
            cachedStatus
          );
          setFollowStatus(cachedStatus);
          setFollowStatusLoading(false);
        } else {
          setFollowStatusLoading(true);
        }
      } else {
        // No stored profile ID, need to fetch it
        setFollowStatusLoading(true);
      }

      // Fetch viewer profile ID if not stored (or verify stored one is correct)
      const fetchedViewerId = await getViewerId();

      // Update stored profile ID if we got a new one
      if (fetchedViewerId && fetchedViewerId !== storedProfileId) {
        localStorage.setItem("my_profile_id", fetchedViewerId);
      }

      const finalViewerId = fetchedViewerId || viewerProfileId;

      if (!finalViewerId || finalViewerId === profile.id) {
        setFollowStatus("none");
        setFollowStatusLoading(false);
        return;
      }

      // If we didn't have cached status with stored ID, check cache again with fetched ID
      if (!cachedStatus && finalViewerId !== viewerProfileId) {
        cachedStatus = getCachedFollowStatus(finalViewerId, profile.id);
        if (cachedStatus) {
          setFollowStatus(cachedStatus);
          setFollowStatusLoading(false);
        }
      }

      // Fetch fresh status in background
      try {
        const freshStatus = await getFollowStatus(finalViewerId, profile.id);
        // Cache the fresh status
        setCachedFollowStatus(finalViewerId, profile.id, freshStatus);
        setFollowStatus(freshStatus);
      } catch (error) {
        console.error("Error fetching follow status:", error);
        // Keep cached status if available, otherwise set to "none"
        if (!cachedStatus) {
          setFollowStatus("none");
        }
      } finally {
        setFollowStatusLoading(false);
      }
    })();
  }, [profile?.id, shellMode]);

  // Check if viewer has access to private account content
  useEffect(() => {
    if (!profile) {
      setHasAccess(null);
      return;
    }
    if (shellMode) {
      setHasAccess(false);
      return;
    }

    // If account is public, everyone has access
    if (!profile.is_private) {
      setHasAccess(true);
      return;
    }

    // If account is private, check if viewer is approved follower
    if (followStatus === "following" || followStatus === "friends") {
      setHasAccess(true);
    } else {
      setHasAccess(false);
    }
  }, [profile?.is_private, followStatus, shellMode]);

  // Cleanup tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  // Hero section: Real-time follow updates
  useEffect(() => {
    if (!profile?.id || shellMode) return;
    const pid = profile.id;

    const channel = supabase
      .channel(`follows@${pid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${pid}`,
        },
        () => setCounts((c) => ({ ...c, followers: c.followers + 1 }))
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${pid}`,
        },
        () =>
          setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }))
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${pid}`,
        },
        () => setCounts((c) => ({ ...c, following: c.following + 1 }))
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${pid}`,
        },
        () =>
          setCounts((c) => ({ ...c, following: Math.max(0, c.following - 1) }))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, shellMode]);

  // Generate profile URL
  const profileUrl = useMemo(() => {
    if (!profile) return "";
    const baseUrl = getPublicShareBaseUrl();
    if (profile.username) {
      return `${baseUrl}/u/${profile.username}`;
    }
    return `${baseUrl}/u/${profile.id}`;
  }, [profile]);

  // Follow/unfollow handler
  const onToggleFollow = async () => {
    if (!profile?.id) return;
    const viewerId = await getViewerId();
    if (!viewerId) return;

    setBusy(true);
    const previousStatus = followStatus;

    try {
      // [FIX] Include "pending" in unfollow condition so "Requested" button can cancel
      if (
        followStatus === "following" ||
        followStatus === "friends" ||
        followStatus === "pending"
      ) {
        // Unfollow or cancel pending request
        const newStatus: FollowStatus = "none";
        setFollowStatus(newStatus);
        // Update cache immediately
        if (viewerId) {
          setCachedFollowStatus(viewerId, profile.id, newStatus);
          clearCachedFollowStatus(profile.id); // Clear related caches
          // Clear notification settings cache when unfollowing
          clearCachedNotificationSettings(profile.id);
        }

        const { error } = await doUnfollow(profile.id);
        if (error) {
          // Rollback on error
          setFollowStatus(previousStatus);
          if (viewerId && previousStatus) {
            setCachedFollowStatus(viewerId, profile.id, previousStatus);
          }
          throw error;
        }

        // Update follow counts cache for both profiles after unfollow
        // Update UI counts immediately (optimistic update)
        const newFollowersCount = Math.max(0, counts.followers - 1);
        setCounts((prev) => ({
          ...prev,
          followers: newFollowersCount,
        }));

        // Update cache with new counts
        setCachedFollowCounts(profile.id, {
          following: counts.following,
          followers: newFollowersCount,
        });

        // Update viewer's following count in cache (fetch fresh to be accurate)
        getFollowCounts(viewerId)
          .then((viewerCounts) => {
            setCachedFollowCounts(viewerId, viewerCounts);
          })
          .catch(() => {
            // Silent fail - cache will refresh on next view
          });
      } else {
        // Follow - [FIX] Use profile.is_private (already loaded) to set correct optimistic status
        // No extra API call needed - this is instant and doesn't slow down public accounts
        const isPrivateAccount = profile.is_private === true;
        // For private accounts, set to "pending". For public, set to "following"
        const optimisticStatus: FollowStatus = isPrivateAccount
          ? "pending"
          : "following";

        setFollowStatus(optimisticStatus);

        // Don't cache pending status
        if (viewerId && optimisticStatus !== "pending") {
          setCachedFollowStatus(viewerId, profile.id, optimisticStatus);
        }

        const result = await doFollow(profile.id);
        if (result.error) {
          // Rollback on error
          setFollowStatus(previousStatus || "none");
          if (viewerId) {
            setCachedFollowStatus(
              viewerId,
              profile.id,
              previousStatus || "none"
            );
          }
          throw result.error;
        }

        // [FIX] Use the actual status returned from API to prevent flickering
        const apiStatus = (result as any).status;
        let actualStatus: FollowStatus;

        if (apiStatus === "pending") {
          actualStatus = "pending";
        } else if (apiStatus === "approved") {
          // Check if it's mutual (friends) - only for approved follows
          if (viewerId) {
            const updatedStatus = await getFollowStatus(viewerId, profile.id);
            actualStatus = updatedStatus;
            if (updatedStatus !== "pending") {
              setCachedFollowStatus(viewerId, profile.id, updatedStatus);
            }
          } else {
            actualStatus = "following";
          }
        } else {
          // Fallback to optimistic status
          actualStatus = optimisticStatus;
        }

        setFollowStatus(actualStatus);

        // Update follow counts cache for both profiles after follow
        // Update UI counts immediately (optimistic update)
        const newFollowersCount = counts.followers + 1;
        setCounts((prev) => ({
          ...prev,
          followers: newFollowersCount,
        }));

        // Update cache with new counts
        setCachedFollowCounts(profile.id, {
          following: counts.following,
          followers: newFollowersCount,
        });

        // Update viewer's following count in cache (fetch fresh to be accurate)
        getFollowCounts(viewerId)
          .then((viewerCounts) => {
            setCachedFollowCounts(viewerId, viewerCounts);
          })
          .catch(() => {
            // Silent fail - cache will refresh on next view
          });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOtherAvatarPreviewShare = useCallback(async () => {
    if (!profileUrl) return;
    const nameBit = profile?.display_name || profile?.username;
    const title = nameBit
      ? `Check out ${nameBit}'s profile`
      : "Check out this profile";
    try {
      const outcome = await shareUrl({ title, url: profileUrl });
      if (outcome === "clipboard") {
        toast.success("Profile link copied to clipboard!");
      }
    } catch {
      toast.error("Could not share");
    }
  }, [profileUrl, profile?.display_name, profile?.username]);

  const avatarPreviewFollowLabel = useMemo(() => {
    if (followStatus === "pending") return "Pending";
    if (followStatus === "following" || followStatus === "friends") {
      return "Following";
    }
    return "Follow";
  }, [followStatus]);

  const avatarPreviewFollowIcon = useMemo(() => {
    if (followStatus === "pending") {
      return <PiClock className="h-5 w-5" aria-hidden />;
    }
    if (followStatus === "following" || followStatus === "friends") {
      return <PiUserCheck className="h-5 w-5" aria-hidden />;
    }
    return <PiUserPlus className="h-5 w-5" aria-hidden />;
  }, [followStatus]);

  return (
    <>
      {isOtherProfileVisible && (pullPx > 2 || ptrRefreshing) ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pullProgress * 100)}
          aria-label={ptrRefreshing ? "Refreshing profile" : "Pull to refresh"}
          className="pointer-events-none fixed left-0 right-0 z-[35] flex justify-center"
          style={{
            top: "calc(80px + env(safe-area-inset-top, 0px))",
            opacity: ptrRefreshing
              ? 1
              : Math.min(1, 0.12 + pullProgress * 0.88),
            transition: ptrRefreshing ? undefined : "opacity 80ms ease-out",
          }}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full border-2 border-[#F7D047]/30 border-t-[#F7D047] ${
              ptrRefreshing ? "animate-spin" : ""
            }`}
            aria-hidden
          />
        </div>
      ) : null}
      <PrimaryPageContainer capacitorNotchScrim>
        <div className="relative">
          <div
            className={[
              "fixed left-0 right-0 top-0 z-40 flex flex-col items-center",
              "transition-transform duration-300",
              headerHidden ? "-translate-y-[110%]" : "translate-y-0",
            ].join(" ")}
            style={{
              paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
            }}
          >
            <ProfileTopBar
              onLogoClick={handleLogoClick}
              onSearch={setUserQuery}
              profile={profile}
              reportUserId={shellMode ? undefined : profile?.id}
              reportUsername={shellMode ? undefined : profile?.username ?? undefined}
              onRequestReport={handleRequestProfileReport}
              onSearchFocusChange={setProfileSearchFocused}
              showBlockControls={
                !!profile?.user_id &&
                !!viewerId &&
                profile.user_id !== viewerId
              }
              isBlocked={isBlocked}
              onRequestBlock={() => setShowBlockConfirm(true)}
              onRequestUnblock={handleUnblockUser}
              blockBusy={blockActionLoading}
              blockedShellTopBar={shellMode}
            />
          </div>

          {userQuery && !shellMode && (
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setUserQuery("")}
            >
              <div className="absolute inset-0 bg-[var(--surface)]/40" />
              <div
                className="absolute left-0 right-0 top-[60px] mx-3"
                onClick={(e) => e.stopPropagation()}
              >
                <ProfileSearchResults
                  query={userQuery}
                  viewerId={profile?.id ?? null}
                  onClose={() => setUserQuery("")}
                />
              </div>
            </div>
          )}

          {!loading && username && !profile && (
            <div className="px-1.5 py-6 text-sm text-[var(--text)]/70 border-b border-white/14">
              Profile unavailable.
            </div>
          )}

          <ProfileProvider
            value={useMemo(
              () => ({ profile: stableProfile, loading }),
              [stableProfile, loading]
            )}
          >
            <div className="relative w-full">
              <ProfileHeroAvatarAtmosphere
                avatarPath={profile?.avatar_url}
                active={!shellMode}
              />
              <div
                className="relative z-[1]"
                style={{
                  paddingTop: "calc(60px + env(safe-area-inset-top, 0px))",
                }}
              >
              {/* INLINE HERO SECTION - Hardcoded for other profile */}
              <section className="w-full px-1.5 pt-4 pb-6 border-b border-[var(--border)]">
                {shellMode ? (
                  <div className="px-4 py-12 text-center max-w-sm mx-auto">
                    <p className="text-sm font-medium text-[var(--text)]/90">
                      You blocked this account.
                    </p>
                    <p className="text-xs text-[var(--text)]/55 mt-3 leading-relaxed">
                      Posts and profile details are hidden. Use Unblock in the
                      bar above to restore access.
                    </p>
                  </div>
                ) : (
                  <>
                {/* Lock icon on left - Private account indicator (only if viewer has access) */}
                {!loading && profile?.is_private && hasAccess === true && (
                  <div className="flex w-full justify-start mb-1">
                    <div className="relative shrink-0">
                      <button
                        onClick={() => {
                          // Clear any existing timer
                          if (tooltipTimerRef.current) {
                            clearTimeout(tooltipTimerRef.current);
                          }
                          setShowPrivateTooltip(true);
                          // Auto-dismiss after 3 seconds
                          tooltipTimerRef.current = setTimeout(() => {
                            setShowPrivateTooltip(false);
                            tooltipTimerRef.current = null;
                          }, 3000);
                        }}
                        className="p-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 transition flex items-center justify-center group"
                        aria-label="Private Account"
                      >
                        <PiLock
                          size={16}
                          className="text-yellow-500 group-hover:text-yellow-400"
                        />
                      </button>

                      {/* Custom tooltip - appears next to lock icon */}
                      {showPrivateTooltip && (
                        <div
                          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50"
                          style={{
                            animation: "fadeInSlide 0.2s ease-out",
                          }}
                        >
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                            <p className="text-sm text-[var(--text)]">
                              This account is private
                            </p>
                            {/* Arrow pointing to lock icon */}
                            <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
                              <div className="w-0 h-0 border-t-4 border-t-transparent border-r-4 border-r-[var(--border)] border-b-4 border-b-transparent"></div>
                              <div className="absolute left-[1px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-r-4 border-r-[var(--surface)] border-b-4 border-b-transparent"></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {loading ? (
                  <>
                    {/* Loading skeleton */}
                    <div className="mx-auto mb-2 w-max px-6 py-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)]/50">
                      <div className="h-3 w-24 bg-[var(--text)]/10 rounded animate-pulse" />
                    </div>
                    <div className="flex flex-col items-center mt-3">
                      <div className="w-24 h-24 rounded-full bg-[var(--text)]/10 animate-pulse" />
                      <div className="text-center mt-3 w-48">
                        <div className="h-4 bg-[var(--text)]/10 rounded animate-pulse" />
                        <div className="h-3 mt-2 bg-[var(--text)]/10 rounded animate-pulse" />
                      </div>
                      <div className="mt-3 w-60">
                        <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse" />
                        <div className="h-3 mt-2 bg-[var(--text)]/10 rounded animate-pulse" />
                      </div>
                      {/* Profile Stats - Always visible, even during loading */}
                      <ProfileStats
                        following={0}
                        followers={0}
                        xp={0}
                        profileId=""
                        onOpenDrawer={setDrawerOpen}
                        loading={{
                          following: true,
                          followers: true,
                          xp: true,
                        }}
                      />
                    </div>
                  </>
                ) : profile ? (
                  <>
                    {/* Member number pill */}
                    {profile.member_no != null && (
                      <MemberNumberPill memberNo={profile.member_no} />
                    )}

                    <div className="flex flex-col items-center mt-3">
                      <div
                        onClick={() => profile.avatar_url && setLightbox(true)}
                        role="button"
                        aria-label="Open avatar"
                        className={
                          profile.avatar_url ? "cursor-pointer" : undefined
                        }
                      >
                        <Avatar
                          url={profile.avatar_url || undefined}
                          name={
                            profile.display_name || profile.username || "User"
                          }
                        />
                      </div>

                      <div className="text-center mt-3">
                        <div className="text-[15px] font-semibold leading-none">
                          {profile.display_name || "Add your display name"}
                        </div>
                        <div className="text-xs text-[var(--text)]/60 mt-1">
                          @{profile.username || "pick-a-username"}
                        </div>
                      </div>

                      {/* Bio */}
                      <div className="mt-3 text-center max-w-[36ch]">
                        {profile.bio ? (
                          <p className="text-[13px] leading-snug text-[var(--text)]/80">
                            {profile.bio}
                          </p>
                        ) : (
                          <p className="text-[13px] leading-snug text-[var(--text)]/50">
                            Add a short bio so people know what you're into.
                          </p>
                        )}
                      </div>

                      {/* Social Media Links - Component handles privacy internally */}
                      <SocialMediaLinks profile={profile} loading={loading} />

                      {/* HARDCODED Follow button - Always visible for other profiles */}
                      <div className="mt-3 w-full flex justify-center">
                        <div className="flex items-center gap-2">
                          <button
                            disabled={busy}
                            onClick={onToggleFollow}
                            className={`h-6 px-2 rounded-md text-xs border transition-opacity inline-flex items-center justify-center ${
                              followStatus === "following" ||
                              followStatus === "friends"
                                ? "bg-white text-black border-white"
                                : followStatus === "pending"
                                ? "bg-[var(--text)]/10 text-[var(--text)]/50 border-[var(--border)]"
                                : "border-[var(--border)] text-[var(--text)]"
                            } ${followStatusLoading ? "opacity-70" : ""} ${
                              busy ? "cursor-wait" : "cursor-pointer"
                            }`}
                          >
                            {followStatusLoading && followStatus === null ? (
                              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : followStatus === "pending" ? (
                              <>
                                <span>Requested</span>
                                <PiLock size={12} className="ml-1" />
                              </>
                            ) : followStatus === "friends" ? (
                              "Friends"
                            ) : followStatus === "following" ? (
                              "Following"
                            ) : (
                              "Follow"
                            )}
                          </button>

                          {/* Notification Bell - show if following or friends */}
                          {(followStatus === "following" ||
                            followStatus === "friends") && (
                            <NotificationBell
                              targetId={profile.id}
                              isFollowing={true}
                            />
                          )}
                        </div>
                      </div>

                      {/* Profile Stats - Always visible, numbers load with animation */}
                      <ProfileStats
                        following={counts.following}
                        followers={counts.followers}
                        xp={profile.xp ?? 0}
                        profileId={profile.id}
                        onOpenDrawer={setDrawerOpen}
                        loading={{
                          following: countsLoading,
                          followers: countsLoading,
                          xp: false, // XP comes from profile, not async
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center mt-3">
                    <div className="w-24 h-24 rounded-full bg-[var(--text)]/10" />
                    <div className="text-center mt-3">
                      <div className="text-[15px] font-semibold leading-none text-[var(--text)]/50">
                        User not found
                      </div>
                      <div className="text-xs text-[var(--text)]/40 mt-1">
                        @unknown
                      </div>
                    </div>
                    <div className="mt-3 text-center max-w-[36ch]">
                      <p className="text-[13px] leading-snug text-[var(--text)]/40">
                        This user doesn't exist or their profile is private.
                      </p>
                    </div>
                  </div>
                )}
                  </>
                )}
              </section>
              </div>
            </div>

            {/* Posts Section - Pass hasAccess + visible (parent tab active) */}
            {profile && !shellMode && (
              <OtherProfilePostsSection
                hasAccess={hasAccess}
                visible={isOtherProfileVisible}
                feedRefreshEpoch={otherProfileFeedRefreshEpoch}
              />
            )}

            {/* Modals and drawers */}
            {profile && !shellMode && (
              <>
                {drawerOpen && (
                  <FollowListDrawer
                    open={!!drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    profileId={profile.id}
                    mode={drawerOpen}
                  />
                )}
                {profile.avatar_url && avatarDisplayUrl(profile.avatar_url) && (
                  <AvatarPreviewLightbox
                    src={avatarDisplayUrl(profile.avatar_url)!}
                    alt={profile.display_name || ""}
                    open={lightbox}
                    onClose={() => setLightbox(false)}
                    actions={
                      <>
                        <AvatarPreviewLightboxAction
                          label={avatarPreviewFollowLabel}
                          icon={avatarPreviewFollowIcon}
                          onClick={() => void onToggleFollow()}
                          disabled={busy}
                          busy={!!(followStatusLoading && followStatus === null)}
                        />
                        <AvatarPreviewLightboxAction
                          label="Share"
                          icon={
                            <PiShareFat className="h-5 w-5" aria-hidden />
                          }
                          onClick={() => void handleOtherAvatarPreviewShare()}
                        />
                      </>
                    }
                  />
                )}
                <ShareProfileModal
                  isOpen={showShareModal}
                  onClose={() => setShowShareModal(false)}
                  profileUrl={profileUrl}
                  profileName={profile.display_name || profile.username}
                />
              </>
            )}
          </ProfileProvider>
        </div>
      </PrimaryPageContainer>

      <WelcomeModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />

      <ReportModal
        open={reportDraft !== null}
        draft={reportDraft}
        onClose={() => setReportDraft(null)}
      />

      <ConfirmDialog
        open={showBlockConfirm}
        onClose={() => !blockActionLoading && setShowBlockConfirm(false)}
        onConfirm={handleConfirmBlockUser}
        title="Block this user?"
        message="You won't see their posts in your feed. After blocking, you can open their profile URL again to see a minimal screen and unblock if you change your mind."
        confirmLabel="Block"
        cancelLabel="Cancel"
        confirmVariant="dangerSoft"
        isLoading={blockActionLoading}
      />
    </>
  );
}
