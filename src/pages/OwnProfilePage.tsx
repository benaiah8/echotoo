import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import OwnProfilePostsSection from "../sections/profile/OwnProfilePostsSection";
import { supabase } from "../lib/supabaseClient";
import { ProfileProvider, type Profile } from "../contexts/ProfileContext";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { RootState } from "../app/store";
import { FiPhone, FiLock } from "react-icons/fi";
import { FaInstagram, FaApple, FaGooglePlay } from "react-icons/fa";
import ProfileTopBar from "../components/profile/ProfileTopBar";
import ProfileSearchResults from "../components/profile/ProfileSearchResults";
import {
  getProfileCached,
  getCachedProfile,
  setCachedProfile,
  primeProfileCache,
  invalidateProfile,
} from "../lib/profileCache";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../lib/avatarCache";
import { getFollowCounts, getViewerId } from "../api/services/follows";
import {
  getCachedFollowCounts,
  setCachedFollowCounts,
} from "../lib/followCountsCache";
import FollowListDrawer from "../components/profile/FollowListDrawer";
import ImageLightbox from "../components/ImageLightbox";
import Avatar from "../components/ui/Avatar";
import FullScreenProfileCreation from "../components/profile/FullScreenProfileCreation";
import SocialMediaLinks from "../components/profile/SocialMediaLinks";
import OnboardingFlow from "../components/onboarding/OnboardingFlow";
import ShareProfileModal from "../components/profile/ShareProfileModal";
import ProfileStats from "../components/profile/ProfileStats";
import MemberNumberPill from "../components/profile/MemberNumberPill";
import { MdShare } from "react-icons/md";
import { FiEdit3 } from "react-icons/fi";
import { handleError } from "../lib/errorHandling";

/**
 * OwnProfilePage - Page for /u/me route
 * - Hardcoded share/logout buttons (always visible)
 * - No conditional logic for ownership
 * - Uses OwnProfilePostsSection
 */
export default function OwnProfilePage() {
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
  const [drawerOpen, setDrawerOpen] = useState<
    false | "followers" | "following"
  >(false);
  const [lightbox, setLightbox] = useState(false);
  const [fullScreenEditOpen, setFullScreenEditOpen] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [showOnboardingForTesting, setShowOnboardingForTesting] =
    useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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

  // Load profile for /u/me - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try to get cached profile immediately using stored profile ID
      const storedProfileId = localStorage.getItem("my_profile_id");
      let cachedProfile: Profile | null = null;

      if (storedProfileId) {
        const cached = getCachedProfile(storedProfileId);
        // Convert null to undefined for Profile type compatibility
        if (cached) {
          cachedProfile = {
            ...cached,
            is_private: cached.is_private ?? undefined,
            social_media_public: cached.social_media_public ?? undefined,
          } as Profile;
        }
      }

      // If no cached profile by ID, try getting user ID from localStorage and searching
      if (!cachedProfile) {
        // Try to get user ID from session storage or check auth
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;

        if (uid) {
          // Try to find cached profile by user_id (search through cache)
          const cacheStr = localStorage.getItem("profile_cache");
          if (cacheStr) {
            try {
              const cache = JSON.parse(cacheStr);
                for (const [profileId, entry] of Object.entries(cache)) {
                  if ((entry as any).user_id === uid) {
                    const cached = getCachedProfile(profileId);
                    if (cached) {
                      cachedProfile = {
                        ...cached,
                        is_private: cached.is_private ?? undefined,
                        social_media_public: cached.social_media_public ?? undefined,
                      } as Profile;
                      break;
                    }
                  }
                }
            } catch (e) {
              // Ignore cache parse errors
            }
          }
        }
      }

      // Show cached profile immediately if available
      if (cachedProfile) {
        console.log(
          "[OwnProfilePage] Using cached profile (stale-while-revalidate):",
          cachedProfile.id
        );
        setProfile(cachedProfile);
        setLoading(false);

        // [OPTIMIZATION: Phase 6 - Connection] Prioritize critical content: profile picture
        // Why: Profile picture is critical, always load immediately
        if (cachedProfile.avatar_url) {
          const cachedAvatarUrl = getCachedAvatar(cachedProfile.user_id);
          if (cachedAvatarUrl) {
            preloadAvatar(cachedAvatarUrl);
          } else if (cachedProfile.avatar_url) {
            // Cache and preload avatar (critical content)
            setCachedAvatar(cachedProfile.user_id, cachedProfile.avatar_url);
            preloadAvatar(cachedProfile.avatar_url);
          }
        }
      } else {
        setLoading(true);
      }

      try {
        const setSafe = (fn: () => void) => {
          if (!cancelled) fn();
        };

        const { data: userData, error: userErr } =
          await supabase.auth.getUser();
        const uid = userData?.user?.id ?? null;

        if (userErr) console.error("[OwnProfilePage] getUser error:", userErr);

        if (!uid) {
          setSafe(() => {
            setProfile(null);
            setLoading(false);
          });
          return;
        }

        // Fetch fresh profile data in background (stale-while-revalidate)
        const { data: me, error: meErr } = await supabase
          .from("profiles")
          .select(
            "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
          )
          .eq("user_id", uid)
          .maybeSingle();

        if (meErr) {
          console.error("[OwnProfilePage] profiles by id error:", meErr);
          if (!cachedProfile) {
            setSafe(() => setProfile(null));
          }
          return;
        }

        if (me) {
          // [OPTIMIZATION: Phase 1 - Cache] Cache profile data including privacy settings
          // Why: Instant display of privacy status, prevents flicker on subsequent loads
          setCachedProfile({
            ...me,
            member_no: me.member_no ?? null,
            is_private: me.is_private ?? undefined,
            social_media_public: me.social_media_public ?? undefined,
          } as any);

          // Cache avatar URL separately
          if (me.avatar_url) {
            setCachedAvatar(me.user_id, me.avatar_url);
            preloadAvatar(me.avatar_url);
          }

          // Update state with fresh data
          setSafe(() => setProfile(me as Profile));

          // Store profile ID for faster cache lookup next time
          if (me.username) localStorage.setItem("my_username", me.username);
          if (me.id) localStorage.setItem("my_profile_id", me.id);
        } else if (!cachedProfile) {
          setSafe(() => setProfile(null));
        }
      } catch (e) {
        // [OPTIMIZATION: Phase 7.1.3] Use user-friendly error handling
        // Why: Shows clear error messages to users, graceful degradation to cached data
        handleError(e, "OwnProfilePage", false); // Don't show toast - already have cached data
        if (!cancelled && !cachedProfile) {
          setProfile(null);
        } else if (cachedProfile) {
          // [OPTIMIZATION: Phase 7.1.5] Graceful degradation - use cached profile on error
          // Why: User still sees their profile even if network request fails
          setProfile(cachedProfile as Profile);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only run once on mount - cache handles subsequent loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle profile updates
  useEffect(() => {
    const onProfileUpdated = async (e: any) => {
      const changedId: string | undefined = e.detail?.id;
      
      // Don't invalidate - update cache immediately to prevent "Sign in" message
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id ?? null;
        if (!uid) return;
        
        const { data: me } = await supabase
          .from("profiles")
          .select(
            "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
          )
          .eq("user_id", uid)
          .maybeSingle();
          
        if (me) {
          // [OPTIMIZATION: Phase 1 - Cache] Update cache immediately with fresh data including privacy settings
          // Why: Instant display of updated privacy status, prevents flicker
          setCachedProfile({
            ...me,
            member_no: me.member_no ?? null,
            is_private: me.is_private ?? undefined,
            social_media_public: me.social_media_public ?? undefined,
          } as any);

          // Update avatar cache
          if (me.avatar_url) {
            setCachedAvatar(me.user_id, me.avatar_url);
            preloadAvatar(me.avatar_url);
          }
          
          // Update state immediately
          setProfile(me as Profile);
          
          // Store profile ID for faster cache lookup
          if (me.username) localStorage.setItem("my_username", me.username);
          if (me.id) localStorage.setItem("my_profile_id", me.id);
        }
      } catch (error) {
        console.error("Error updating profile after save:", error);
        // Don't clear profile on error - keep existing data
      }
    };

    window.addEventListener("profile:updated", onProfileUpdated);
    return () =>
      window.removeEventListener("profile:updated", onProfileUpdated);
  }, []);

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

  // [OPTIMIZATION: Phase 4 - Prefetch] Hero section: Follow counts - STALE-WHILE-REVALIDATE pattern + prefetch on profile load
  // Why: Instant display of cached counts, prefetch when profile loads for faster drawer opening
  useEffect(() => {
    if (profile?.id) {
      // Show cached counts immediately if available
      const cachedCounts = getCachedFollowCounts(profile.id);
      if (cachedCounts) {
        console.log(
          "[OwnProfilePage] Using cached follow counts (stale-while-revalidate):",
          cachedCounts
        );
        setCounts(cachedCounts);
        setCountsLoading(false);
      } else {
        setCountsLoading(true);
      }

      // [OPTIMIZATION: Phase 4 - Prefetch] Prefetch counts when profile loads
      // Why: Faster drawer opening, better perceived performance
      getFollowCounts(profile.id)
        .then((counts) => {
          // Cache the fresh counts
          setCachedFollowCounts(profile.id, counts);
          setCounts(counts);
          setCountsLoading(false);
        })
        .catch(() => {
          setCountsLoading(false);
        });
    } else {
      setCountsLoading(false);
    }
  }, [profile?.id]);

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

  // Generate profile URL - shareable link using username
  const profileUrl = useMemo(() => {
    const baseUrl = window.location.origin;
    if (profile?.username) {
      return `${baseUrl}/u/${profile.username}`;
    }
    // Fallback to profile ID if no username
    if (profile?.id) {
      return `${baseUrl}/u/${profile.id}`;
    }
    return `${baseUrl}/profile`;
  }, [profile]);

  // Open edit if URL has ?edit=1 or first time user
  useEffect(() => {
    if (!profile) return;

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("edit") === "1";

    const onboardKey = `onboarded_${profile.id}`;
    const suppressed = localStorage.getItem(onboardKey) === "1";

    const looksAutoUsername = (profile.username ?? "")
      .toLowerCase()
      .startsWith("user_");
    const looksFirstTime = !profile.display_name && looksAutoUsername;

    if (fromQuery || (looksFirstTime && !suppressed)) {
      setIsFirstTimeUser(looksFirstTime && !suppressed);
      setFullScreenEditOpen(true);
    }

    if (fromQuery) {
      params.delete("edit");
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params}` : "",
        },
        { replace: true }
      );
    }
  }, [profile, location.pathname, location.search, navigate]);

  const handleProfileCreationComplete = () => {
    setFullScreenEditOpen(false);
    if (isFirstTimeUser) {
      setShowOnboardingForTesting(true);
    }
  };

  // Soft card tones
  const softBg = "color-mix(in oklab, var(--text) 7%, transparent)";
  const softBorder = "color-mix(in oklab, var(--text) 14%, transparent)";
  const softDivider = "color-mix(in oklab, var(--text) 10%, transparent)";

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

          <ProfileProvider value={{ profile, loading }}>
            <div className="pt-[60px]">
              {/* INLINE HERO SECTION - Hardcoded for own profile */}
              <section className="w-full px-3 pt-4 pb-6 border-b border-[var(--border)]">
                {/* Lock icon on left, Edit and Logout buttons on right */}
                <div className="flex w-full items-start gap-2 mb-1">
                  {/* Left side: Lock icon for private accounts */}
                  {!loading && profile?.is_private && (
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
                  )}
                  
                  {/* Right side: Edit and Logout buttons - always aligned to the right */}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setFullScreenEditOpen(true)}
                      className="shrink-0 w-9 h-7 rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-2)]/90 transition flex items-center justify-center"
                      aria-label="Edit profile"
                    >
                      <FiEdit3 size={14} />
                    </button>
                    <button
                      className="px-4 py-1.5 rounded-full text-xs border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-2)]/90 transition"
                      onClick={() => setShowLogoutConfirm(true)}
                    >
                      Log out
                    </button>
                  </div>
                </div>

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

                      {/* Social Media Links */}
                      <SocialMediaLinks profile={profile} loading={loading} />

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
                        Sign in to view your profile
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Posts Section - Always visible, even during loading */}
            <OwnProfilePostsSection />

            {/* Modals and drawers */}
            {profile && (
              <>
                <FullScreenProfileCreation
                  open={fullScreenEditOpen}
                  onClose={() => setFullScreenEditOpen(false)}
                  profileId={profile.id}
                  isFirstTime={isFirstTimeUser}
                  onComplete={handleProfileCreationComplete}
                  initialProfileData={{
                    display_name: profile.display_name ?? null,
                    username: profile.username ?? null,
                    bio: profile.bio ?? null,
                    avatar_url: profile.avatar_url ?? null,
                    instagram_url: profile.instagram_url ?? null,
                    tiktok_url: profile.tiktok_url ?? null,
                    telegram_url: profile.telegram_url ?? null,
                    member_no: profile.member_no ?? null,
                    is_private: profile.is_private ?? null,
                    social_media_public: profile.social_media_public ?? null,
                  }}
                />
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
                {showOnboardingForTesting && (
                  <div className="fixed inset-0 z-50 bg-[var(--bg)]">
                    <OnboardingFlow
                      userId={profile.id}
                      userNumber={profile.member_no || 0}
                      onComplete={() => setShowOnboardingForTesting(false)}
                    />
                  </div>
                )}
                <ShareProfileModal
                  isOpen={showShareModal}
                  onClose={() => setShowShareModal(false)}
                  profileUrl={profileUrl}
                  profileName={profile.display_name || profile.username}
                />
              </>
            )}
            
            {/* Logout Confirmation Modal - Outside profile check so it always works */}
            {showLogoutConfirm && (
              <div className="fixed inset-0 z-[1000]">
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setShowLogoutConfirm(false)}
                />
                <div
                  className="absolute left-0 right-0 bottom-0 mx-auto max-w-[640px]
                          rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)]
                          p-4"
                >
                  <div className="text-sm font-semibold mb-1 text-[var(--text)]">
                    Log out?
                  </div>
                  <p className="text-xs text-[var(--text)]/70 mb-3">
                    Are you sure you want to log out?
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-xs hover:bg-[var(--surface-3)] transition"
                      onClick={() => setShowLogoutConfirm(false)}
                    >
                      Stay
                    </button>
                    <button
                      className="flex-1 px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition"
                      onClick={async () => {
                        localStorage.removeItem("guest_until");
                        await supabase.auth.signOut();
                        navigate("/");
                      }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>
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
