import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import OtherProfilePostsSection from "../sections/profile/OtherProfilePostsSection";
import { supabase } from "../lib/supabaseClient";
import { ProfileProvider, type Profile } from "../contexts/ProfileContext";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { RootState } from "../app/store";
import { Paths } from "../router/Paths";
import { FiPhone, FiLock } from "react-icons/fi";
import { FaInstagram, FaApple, FaGooglePlay } from "react-icons/fa";
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
import FollowListDrawer from "../components/profile/FollowListDrawer";
import ImageLightbox from "../components/ImageLightbox";
import Avatar from "../components/ui/Avatar";
import SocialMediaLinks from "../components/profile/SocialMediaLinks";
import ShareProfileModal from "../components/profile/ShareProfileModal";
import ProfileStats from "../components/profile/ProfileStats";
import MemberNumberPill from "../components/profile/MemberNumberPill";
import NotificationBell from "../components/ui/NotificationBell";
import { handleError, getErrorMessage } from "../lib/errorHandling";

/**
 * OtherProfilePage - Page for /u/:username route
 * - Hardcoded share button in top bar (always visible)
 * - Follow button in hero (not share/logout)
 * - No conditional logic for ownership
 * - Uses OtherProfilePostsSection
 */
export default function OtherProfilePage() {
  const { username } = useParams<{ username?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastY = useRef<number>(
    typeof window !== "undefined" ? window.scrollY : 0
  );
  const ticking = useRef(false);

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
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (showInfoModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showInfoModal]);

  // Get viewer ID
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

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
        const q = raw.startsWith("@") ? raw.slice(1) : raw;

        // "uuidish" = 36 chars with dashes
        const uuidish = /^[0-9a-f-]{36}$/i.test(q);

        let prof: Profile | null = null;

        if (uuidish) {
          // Try id first
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
            )
            .eq("id", q)
            .maybeSingle();
          if (!error && data) {
            prof = data as Profile;
          } else {
            // Try user_id next
            if (!error && !data) {
              const { data: byUserId, error: byUserIdErr } = await supabase
                .from("profiles")
                .select(
                  "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
                )
                .eq("user_id", q)
                .maybeSingle();
              if (!byUserIdErr && byUserId) {
                prof = byUserId as Profile;
              }
            }

            // Fallback: try username
            const { data: byUser, error: byUserErr } = await supabase
              .from("profiles")
              .select(
                "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
              )
              .ilike("username", q)
              .maybeSingle();
            if (!byUserErr && byUser) prof = byUser as Profile;
          }
        } else {
          // Try username first
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
            )
            .ilike("username", q)
            .maybeSingle();
          if (!error && data) {
            prof = data as Profile;
          } else {
            // Fallback: if q happens to be an id, try id
            const { data: byId, error: byIdErr } = await supabase
              .from("profiles")
              .select(
                "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
              )
              .eq("id", q)
              .maybeSingle();
            if (!byIdErr && byId) prof = byId as Profile;
          }
        }

        setSafe(() => setProfile(prof));
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
  }, [username]);

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
          const { data: p } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
            )
            .eq("id", profile.id)
            .maybeSingle();
          setProfile((p as any) ?? null);
          if (p) {
            // [OPTIMIZATION: Phase 1 - Cache] Cache profile data including privacy settings
            // Why: Instant display of updated privacy status, prevents flicker
            primeProfileCache({
              ...p,
              member_no: p.member_no ?? null,
              is_private: p.is_private ?? null,
              social_media_public: p.social_media_public ?? null,
            } as any);
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
              setHeaderHidden(true);
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
    if (!profile?.id) {
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
  }, [profile?.id]);

  // Hero section: Load cached follow status immediately, then fetch fresh
  useEffect(() => {
    (async () => {
      if (!profile?.id) {
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
  }, [profile?.id]);

  // Check if viewer has access to private account content
  useEffect(() => {
    if (!profile) {
      setHasAccess(null);
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
  }, [profile?.is_private, followStatus]);

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
    if (!profile?.id) return;
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
  }, [profile?.id]);

  // Generate profile URL
  const profileUrl = useMemo(() => {
    if (!profile) return "";
    const baseUrl = window.location.origin;
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
      if (followStatus === "following" || followStatus === "friends") {
        // Unfollow
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
        // Follow
        const newStatus: FollowStatus = "following"; // Will update to "friends" if mutual
        setFollowStatus(newStatus);
        // Update cache immediately
        if (viewerId) {
          setCachedFollowStatus(viewerId, profile.id, newStatus);
        }

        const { error } = await doFollow(profile.id);
        if (error) {
          // Rollback on error
          setFollowStatus(previousStatus || "none");
          if (viewerId) {
            setCachedFollowStatus(viewerId, profile.id, previousStatus || "none");
          }
          throw error;
        }

        // Check if it's mutual (friends) after follow
        if (viewerId) {
          const updatedStatus = await getFollowStatus(viewerId, profile.id);
          setFollowStatus(updatedStatus);
          setCachedFollowStatus(viewerId, profile.id, updatedStatus);
        }

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

  return (
    <>
      <PrimaryPageContainer>
        <div className="relative">
          <div
            className={[
              "fixed left-0 right-0 top-0 z-40 border-b border-[var(--border)]",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "transition-transform duration-300",
              headerHidden ? "-translate-y-[110%]" : "translate-y-0",
            ].join(" ")}
          >
            <ProfileTopBar
              onLogoClick={handleLogoClick}
              onSearch={setUserQuery}
              profile={profile}
            />
          </div>

          {userQuery && (
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
            <div className="px-3 py-6 text-sm text-[var(--text)]/70 border-b border-white/14">
              User not found.
            </div>
          )}

          <ProfileProvider value={{ profile, loading }}>
            <div className="pt-[60px]">
              {/* INLINE HERO SECTION - Hardcoded for other profile */}
              <section className="w-full px-3 pt-4 pb-6 border-b border-[var(--border)]">
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
                        <FiLock size={16} className="text-yellow-500 group-hover:text-yellow-400" />
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
                            <p className="text-sm text-[var(--text)]">This account is private</p>
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
                        className={profile.avatar_url ? "cursor-pointer" : undefined}
                      >
                        <Avatar
                          url={profile.avatar_url || undefined}
                          name={profile.display_name || profile.username || "User"}
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
                            disabled={busy || followStatus === "pending"}
                            onClick={onToggleFollow}
                            className={`h-6 px-2 rounded-md text-xs border transition-opacity ${
                              followStatus === "following" || followStatus === "friends"
                                ? "bg-white text-black border-white"
                                : followStatus === "pending"
                                ? "bg-[var(--text)]/10 text-[var(--text)]/50 border-[var(--border)] cursor-not-allowed"
                                : "border-[var(--border)] text-[var(--text)]"
                            } ${followStatusLoading ? "opacity-70" : ""}`}
                          >
                            {followStatusLoading && followStatus === null ? (
                              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : followStatus === "pending" ? (
                              "Requested"
                            ) : followStatus === "friends" ? (
                              "Friends"
                            ) : followStatus === "following" ? (
                              "Following"
                            ) : (
                              "Follow"
                            )}
                          </button>

                          {/* Notification Bell - show if following or friends */}
                          {(followStatus === "following" || followStatus === "friends") && (
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
              </section>
            </div>

            {/* Posts Section - Pass hasAccess prop */}
            {profile && <OtherProfilePostsSection hasAccess={hasAccess} />}

            {/* Modals and drawers */}
            {profile && (
              <>
                {drawerOpen && (
                  <FollowListDrawer
                    open={!!drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    profileId={profile.id}
                    mode={drawerOpen}
                  />
                )}
                {profile.avatar_url && (
                  <ImageLightbox
                    src={profile.avatar_url}
                    alt={profile.display_name || ""}
                    open={lightbox}
                    onClose={() => setLightbox(false)}
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

      {/* Info Modal for authenticated users */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col">
          <div className="flex justify-end p-4">
            <button
              onClick={() => setShowInfoModal(false)}
              className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
            >
              ×
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center items-center px-6">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
                Welcome to Echotoo
              </h2>
              <p className="text-base text-[var(--text)]/80 mb-8 leading-relaxed">
                The only place you need when you go out. Discover local hangouts
                and experiences, connect with friends, and make the most of your
                social life.
              </p>
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  If you want to reach out to work with us, talk to us, or
                  invest in Echotoo, you can contact us:
                </p>
                <div className="flex flex-col gap-3">
                  <a
                    href="tel:0902327218"
                    className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
                  >
                    <FiPhone className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">0902327218</span>
                  </a>
                  <a
                    href="https://www.instagram.com/benaiah.a.t/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
                  >
                    <FaInstagram className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">@benaiah.a.t</span>
                  </a>
                </div>
              </div>
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  Download our mobile app:
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                    <FaApple className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">App Store</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                    <FaGooglePlay className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">Google Play</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full bg-[var(--brand)] text-[var(--brand-ink)] py-3 rounded-lg text-sm font-medium hover:brightness-110 transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

