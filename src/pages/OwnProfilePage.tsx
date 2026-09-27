import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import OwnProfilePostsSection from "../sections/profile/OwnProfilePostsSection";
import { supabase } from "../lib/supabaseClient";
import { ProfileProvider, type Profile } from "../contexts/ProfileContext";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";
import WelcomeModal from "../components/ui/WelcomeModal";
import type { WelcomeModalCloseSource } from "../components/ui/WelcomeModal";
import ProfileTopBar from "../components/profile/ProfileTopBar";
import ProfileSearchResults from "../components/profile/ProfileSearchResults";
import {
  getCachedProfile,
  setCachedProfile,
  invalidateProfile,
} from "../lib/profileCache";
import { dataCache } from "../lib/dataCache";
import { clearPersistedProfilePosts } from "../lib/profilePostListCache";
import { useHomePullToRefresh } from "../hooks/useHomePullToRefresh";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../lib/avatarCache";
import {
  getFollowCounts,
  getViewerId,
  getProfileByUserId,
  getViewerAuthUserId,
} from "../api/services/follows";
import { deleteMyPushDevices } from "../api/services/pushDevices";
import {
  getCachedFollowCounts,
  setCachedFollowCounts,
} from "../lib/followCountsCache";
import FollowListDrawer from "../components/profile/FollowListDrawer";
import BlockListDrawer from "../components/profile/BlockListDrawer";
import {
  AvatarPreviewLightboxAction,
} from "../components/profile/AvatarPreviewLightbox";
import FullScreenProfileCreation from "../components/profile/FullScreenProfileCreation";
import ProfilePhotoHero from "../components/profile/ProfilePhotoHero";
import ProfileIdentityRow from "../components/profile/ProfileIdentityRow";
import ProfileCompletionCue from "../components/profile/ProfileCompletionCue";
import ProfileCompletionChecklist from "../components/profile/ProfileCompletionChecklist";
import AvatarCropModal from "../components/profile/AvatarCropModal";
import SocialMediaLinks from "../components/profile/SocialMediaLinks";
import MediaAcquisitionSheet from "../components/create/MediaAcquisitionSheet";
import { useProfilePhotoAddPipeline } from "../hooks/useProfilePhotoAddPipeline";
import { normalizeProfilePhotos } from "../lib/profilePhotos";
import { deriveProfileCompletion } from "../lib/profileCompletion";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import toast from "react-hot-toast";
import OnboardingFlow from "../components/onboarding/OnboardingFlow";
import ShareProfileModal from "../components/profile/ShareProfileModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ProfileHeroAvatarAtmosphere from "../components/profile/ProfileHeroAvatarAtmosphere";
import ProfileStats from "../components/profile/ProfileStats";
import ProfileSocialOpportunityRail from "../components/profile/ProfileSocialOpportunityRail";
import {
  PROFILE_OVERVIEW_BIO_TEXT_CLASS,
  PROFILE_OVERVIEW_BIO_WRAP_CLASS,
  hasProfileOverviewBio,
} from "../lib/profileOverviewPresentation";
import { PiLock, PiPencilSimple } from "react-icons/pi";
import { handleError } from "../lib/errorHandling";
import { getPublicShareBaseUrl } from "../lib/publicSiteUrl";
import { useTabActive } from "../router/PersistentTabContainer.new";
import { PROFILE_TAB_REFRESH_EVENT } from "../lib/homeRefreshEvents";
import { SKIP_WELCOME_ONBOARDING } from "../lib/featureFlags";
import { Paths } from "../router/Paths";
import { dispatchBottomTabPeek } from "../lib/bottomTabPeek";
import { getCurrentUserIsReportReviewer } from "../api/services/reportReview";
import {
  isOwnProfilePublishNavigationState,
  scrollOwnProfileToTopAfterPublish,
} from "../lib/profilePublishNavigation";
import { nextProfileHeaderHiddenFromScroll } from "../lib/profileHeaderScrollChrome";

/** Verbose profile-tab load instrumentation (PROFILEDBG). Off by default. */
const DEBUG_PROFILE_LOAD = false;

/**
 * OwnProfilePage - Page for /u/me route
 * - Hardcoded share/logout buttons (always visible)
 * - No conditional logic for ownership
 * - Uses OwnProfilePostsSection
 */
export default function OwnProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  // [FIX] Use parent tab active status from PersistentTabContainer - stops background fetches when Profile tab is display:none
  const isProfileTabVisible = useTabActive("profile");

  /** Tap profile tab again / pull-to-refresh → remount feeds (feed dataCache retained until fresh load replaces) */
  const [profileFeedRefreshEpoch, setProfileFeedRefreshEpoch] = useState(0);
  /** Bumps when returning from publish — forces Created tab focus in posts section */
  const [publishReturnFocusEpoch, setPublishReturnFocusEpoch] = useState(0);
  const publishReturnHandledKeyRef = useRef<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  /** False until the visible-tab profile load effect finishes (avoids false error before first fetch). */
  const [profileHeroLoadSettled, setProfileHeroLoadSettled] = useState(false);

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
      current.echo_preset !== profile.echo_preset ||
      current.profile_photos.join("\0") !==
        (profile.profile_photos ?? []).join("\0") ||
      current.is_private !== profile.is_private ||
      current.bio !== profile.bio ||
      current.member_no !== profile.member_no;

    if (!dataChanged) {
      // Data is same, keep old reference to prevent re-renders
      return current;
    }

    // Data changed - update ref and return new profile
    stableProfileRef.current = {
      ...profile,
      profile_photos: profile.profile_photos ?? [],
      echo_preset: profile.echo_preset ?? null,
    };
    return stableProfileRef.current;
  }, [
    profile?.id,
    profile?.user_id,
    profile?.username,
    profile?.display_name,
    profile?.avatar_url,
    profile?.echo_preset,
    profile?.profile_photos,
    profile?.is_private,
    profile?.bio,
    profile?.member_no,
  ]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
  const [profileSearchFocused, setProfileSearchFocused] = useState(false);
  /** Scroll handler reads ref so IME/keyboard scrolls never hide chrome while search is active. */
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
    if (!isProfileTabVisible) return;
    dispatchBottomTabPeek("profile", headerHidden);
  }, [headerHidden, isProfileTabVisible]);

  // Hero section state
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [countsLoading, setCountsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState<
    false | "followers" | "following"
  >(false);
  /** Atmosphere follows active Profile hero photo (presentation-only). */
  const [heroAtmospherePath, setHeroAtmospherePath] = useState<string | null>(
    null,
  );
  const [fullScreenEditOpen, setFullScreenEditOpen] = useState(false);
  const [completionChecklistOpen, setCompletionChecklistOpen] = useState(false);
  const [editorFocusSection, setEditorFocusSection] = useState<
    "bio" | "social" | null
  >(null);

  const ownHeroPhotos = useMemo(
    () => normalizeProfilePhotos(profile?.profile_photos),
    [profile?.profile_photos],
  );
  const heroPhotoAddPipeline = useProfilePhotoAddPipeline({
    profileId: profile?.id ?? "",
    userId: profile?.user_id ?? null,
    photos: ownHeroPhotos,
    onError: (message) => {
      if (message) toast.error(message);
    },
  });
  const heroAddCameraInputRef = useRef<HTMLInputElement>(null);
  const heroAddGalleryInputRef = useRef<HTMLInputElement>(null);

  const openOwnHeroAddPhotos = useCallback(() => {
    if (!profile?.id || !heroPhotoAddPipeline.canAdd) return;
    heroPhotoAddPipeline.openAddPhotos({ preferChooser: true });
  }, [heroPhotoAddPipeline, profile?.id]);

  const openOwnHeroWebGallery = useCallback(() => {
    heroPhotoAddPipeline.setMediaChooserOpen(false);
    heroAddGalleryInputRef.current?.click();
  }, [heroPhotoAddPipeline]);

  const openOwnHeroWebCamera = useCallback(() => {
    heroPhotoAddPipeline.setMediaChooserOpen(false);
    heroAddCameraInputRef.current?.click();
  }, [heroPhotoAddPipeline]);

  const [focusDeleteAccountOnEditorOpen, setFocusDeleteAccountOnEditorOpen] =
    useState(false);

  const profileCompletion = useMemo(
    () => deriveProfileCompletion(profile),
    [profile],
  );

  const openCompletionChecklist = useCallback(() => {
    setCompletionChecklistOpen(true);
  }, []);

  const closeCompletionChecklist = useCallback(() => {
    setCompletionChecklistOpen(false);
  }, []);

  const openEditorFromCompletion = useCallback(
    (section: "bio" | "social" | null) => {
      setCompletionChecklistOpen(false);
      setEditorFocusSection(section);
      setFocusDeleteAccountOnEditorOpen(false);
      setFullScreenEditOpen(true);
    },
    [],
  );

  const handleInitialFocusSectionHandled = useCallback(() => {
    setEditorFocusSection(null);
  }, []);

  /** Editor stacks above checklist — drop checklist so it does not reopen under the editor. */
  useEffect(() => {
    if (fullScreenEditOpen) setCompletionChecklistOpen(false);
  }, [fullScreenEditOpen]);

  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [showOnboardingForTesting, setShowOnboardingForTesting] =
    useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [blockListOpen, setBlockListOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showPrivateTooltip, setShowPrivateTooltip] = useState(false);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  // auth state and modal state for logo functionality
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  /** Until false, Redux has not finished initial session hydrate (same as onboarding). */
  const authLoading = authState?.loading ?? true;
  /**
   * Signed-in for hero empty-state only: Redux user or resolved session uid.
   * Avoids showing "Sign in…" when profile row is late/missing but OAuth session exists.
   */
  const hasSignedInIdentity = !!(authState?.user?.id || viewerId);
  const showProfileHeroLoading =
    loading ||
    authLoading ||
    (hasSignedInIdentity && !profile && !profileHeroLoadSettled);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const pendingAuthAfterWelcomeCloseRef = useRef(false);
  const [isReportReviewer, setIsReportReviewer] = useState(false);

  // Get viewer ID
  useEffect(() => {
    if (!isProfileTabVisible) return;
    getViewerAuthUserId().then((userId) => setViewerId(userId));
  }, [isProfileTabVisible]);

  useEffect(() => {
    if (!authState?.user?.id) {
      setIsReportReviewer(false);
      return;
    }
    if (!isProfileTabVisible) return;
    let cancelled = false;
    (async () => {
      try {
        const ok = await getCurrentUserIsReportReviewer();
        if (!cancelled) setIsReportReviewer(ok);
      } catch {
        if (!cancelled) setIsReportReviewer(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isProfileTabVisible, authState?.user?.id]);

  useEffect(() => {
    const onTabRefresh = () => {
      if (!isProfileTabVisible) return;

      if (profile?.id) invalidateProfile(profile.id);

      const createdOwnerId = profile?.user_id;
      if (createdOwnerId) {
        dataCache.delete(`profile_created_${createdOwnerId}`);
        clearPersistedProfilePosts("created", createdOwnerId);
      }

      // Explicit pull/tab refresh bypasses freshness and reloads the Profile row
      void (async () => {
        try {
          const uid = await getViewerAuthUserId();
          if (!uid) return;
          const me = await getProfileByUserId(uid, { force: true });
          if (me) {
            setProfile(me as Profile);
            if (me.avatar_url) {
              setCachedAvatar(me.user_id, me.avatar_url);
              preloadAvatar(me.avatar_url);
            }
            if (me.username) localStorage.setItem("my_username", me.username);
            if (me.id) localStorage.setItem("my_profile_id", me.id);
          }
        } catch {
          /* keep current Profile on refresh failure */
        }
      })();

      setProfileFeedRefreshEpoch((n) => n + 1);
    };
    window.addEventListener(PROFILE_TAB_REFRESH_EVENT, onTabRefresh);
    return () =>
      window.removeEventListener(PROFILE_TAB_REFRESH_EVENT, onTabRefresh);
  }, [isProfileTabVisible, profile?.id, profile?.user_id]);

  /** Publish success → profile: scroll top, remount Created feed, then clear one-shot nav state */
  useEffect(() => {
    if (!isOwnProfilePublishNavigationState(location.state)) return;

    const handledKey = `${location.key}:${location.state.postId ?? ""}`;
    if (publishReturnHandledKeyRef.current === handledKey) return;
    publishReturnHandledKeyRef.current = handledKey;

    scrollOwnProfileToTopAfterPublish();

    if (profile?.id) invalidateProfile(profile.id);
    setProfileFeedRefreshEpoch((n) => n + 1);
    setPublishReturnFocusEpoch((n) => n + 1);

    navigate(location.pathname, { replace: true, state: {} });
  }, [
    location.key,
    location.state,
    location.pathname,
    navigate,
    profile?.id,
  ]);

  const {
    pullPx,
    pullProgress,
    isRefreshing: ptrRefreshing,
  } = useHomePullToRefresh({
    enabled: isProfileTabVisible,
    onCommit: () => {
      window.dispatchEvent(new CustomEvent(PROFILE_TAB_REFRESH_EVENT));
    },
    refreshEpoch: profileFeedRefreshEpoch,
  });

  // Load profile for /u/me - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!isProfileTabVisible) return;
    setProfileHeroLoadSettled(false);
    if (DEBUG_PROFILE_LOAD) {
      console.log("[PROFILEDBG] profile load effect start", {
        t: Date.now(),
        isProfileTabVisible,
      });
    }
    // console.log('[OwnProfilePage] 🔄 Component MOUNTED - loading profile data');
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
            profile_photos: cached.profile_photos ?? [],
            echo_preset: cached.echo_preset ?? null,
            is_private: cached.is_private ?? undefined,
            social_media_public: cached.social_media_public ?? undefined,
            p2p_discover_enabled: cached.p2p_discover_enabled ?? undefined,
          } as Profile;
        }
      }

      // If no cached profile by ID, try getting user ID from localStorage and searching
      if (!cachedProfile) {
        // Try to get user ID from session storage or check auth
        const uid = await getViewerAuthUserId();
        if (DEBUG_PROFILE_LOAD) {
          console.log("[PROFILEDBG] getViewerAuthUserId (cache-search path)", {
            t: Date.now(),
            uid,
          });
        }

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
                      profile_photos: cached.profile_photos ?? [],
                      echo_preset: cached.echo_preset ?? null,
                      is_private: cached.is_private ?? undefined,
                      social_media_public:
                        cached.social_media_public ?? undefined,
                      p2p_discover_enabled:
                        cached.p2p_discover_enabled ?? undefined,
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
        // console.log(
        //   "[OwnProfilePage] Using cached profile (stale-while-revalidate):",
        //   cachedProfile.id
        // );
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

        const uid = await getViewerAuthUserId();
        if (DEBUG_PROFILE_LOAD) {
          console.log("[PROFILEDBG] getViewerAuthUserId (fetch path)", {
            t: Date.now(),
            uid,
          });
        }

        if (!uid) {
          if (DEBUG_PROFILE_LOAD) {
            console.log(
              "[PROFILEDBG] setProfile null — no uid from getViewerAuthUserId",
              { t: Date.now() }
            );
          }
          setSafe(() => {
            setProfile(null);
            setLoading(false);
          });
          return;
        }

        // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
        // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
        // getProfileByUserId() handles caching, RequestManager deduplication, and error handling
        const me = await getProfileByUserId(uid);
        if (DEBUG_PROFILE_LOAD) {
          console.log("[PROFILEDBG] getProfileByUserId result", {
            t: Date.now(),
            uid,
            hasProfile: !!me,
            profileId: me?.id ?? null,
            profileUserId: me?.user_id ?? null,
          });
        }

        if (me) {
          // Cache avatar URL separately (getProfileByUserId already caches profile data)
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
          if (DEBUG_PROFILE_LOAD) {
            console.log(
              "[PROFILEDBG] setProfile null — me missing and no cachedProfile",
              { t: Date.now() }
            );
          }
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
        if (!cancelled) {
          if (DEBUG_PROFILE_LOAD) {
            console.log("[PROFILEDBG] profile load effect loading=false (finally)", {
              t: Date.now(),
            });
          }
          setLoading(false);
          setProfileHeroLoadSettled(true);
        }
      }
    })();
    return () => {
      // console.log('[OwnProfilePage] 🔄 Component UNMOUNTING - cleanup');
      cancelled = true;
    };
    // Re-run when tab becomes visible so profile loads on navigate-to-profile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileTabVisible]);

  // Handle profile updates
  useEffect(() => {
    // [DEBUG] Toggle to enable/disable debug logs
    const DEBUG_PROFILE = false;

    const onProfileUpdated = async (e: any) => {
      const changedId: string | undefined = e.detail?.id;
      const detailProfile = e.detail?.profile;

      if (DEBUG_PROFILE)
        console.log("[OwnProfilePage] profile:updated event received:", {
          changedId,
          hasDetailProfile: !!detailProfile,
        });

      try {
        // Prefer payload from the editor (stable, no race with cache invalidation)
        if (
          detailProfile &&
          typeof detailProfile === "object" &&
          detailProfile.id &&
          detailProfile.user_id
        ) {
          setCachedProfile({
            ...detailProfile,
            profile_photos: detailProfile.profile_photos ?? [],
            echo_preset: detailProfile.echo_preset ?? null,
            member_no: detailProfile.member_no ?? null,
            is_private: detailProfile.is_private ?? null,
            social_media_public: detailProfile.social_media_public ?? null,
            p2p_discover_enabled:
              detailProfile.p2p_discover_enabled ?? null,
          } as any);

          setProfile({
            ...detailProfile,
            profile_photos: detailProfile.profile_photos ?? [],
            echo_preset: detailProfile.echo_preset ?? null,
          } as Profile);

          if (detailProfile.avatar_url) {
            setCachedAvatar(detailProfile.user_id, detailProfile.avatar_url);
            preloadAvatar(detailProfile.avatar_url);
          }
          if (detailProfile.username) {
            localStorage.setItem("my_username", detailProfile.username);
          }
          if (detailProfile.id) {
            localStorage.setItem("my_profile_id", detailProfile.id);
          }
          return;
        }

        const uid = await getViewerAuthUserId();
        if (!uid) return;

        const { getCachedProfile } = await import("../lib/profileCache");
        const cachedProfile = getCachedProfile(changedId || "");

        if (cachedProfile) {
          if (DEBUG_PROFILE)
            console.log("[OwnProfilePage] Using cached profile with XP:", {
              profileId: cachedProfile.id,
              xp: cachedProfile.xp,
            });
          setProfile(cachedProfile as Profile);
          return;
        }

        // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() instead of fallback query
        // getProfileByUserId() already handles caching, RequestManager deduplication, and error handling
        const me = await getProfileByUserId(uid);

        if (me) {
          if (DEBUG_PROFILE)
            console.log("[OwnProfilePage] Fetched profile from DB with XP:", {
              profileId: me.id,
              xp: me.xp,
            });
          // [OPTIMIZATION: Phase 1 - Cache] Update cache immediately with fresh data including privacy settings
          // Why: Instant display of updated privacy status, prevents flicker
          setCachedProfile({
            ...me,
            member_no: me.member_no ?? null,
            is_private: me.is_private ?? undefined,
            social_media_public: me.social_media_public ?? undefined,
            p2p_discover_enabled: me.p2p_discover_enabled ?? undefined,
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
          const next = nextProfileHeaderHiddenFromScroll({
            scrollY: current,
            lastScrollY: lastY.current,
            searchPinned: profileSearchPinnedRef.current,
          });
          if (next !== null) {
            setHeaderHidden(next);
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
    pendingAuthAfterWelcomeCloseRef.current = !isAuthenticated;
    setShowInfoModal(true);
  };

  const handleWelcomeClose = useCallback(
    (source: WelcomeModalCloseSource) => {
      const pendingAuth = pendingAuthAfterWelcomeCloseRef.current;
      pendingAuthAfterWelcomeCloseRef.current = false;
      setShowInfoModal(false);

      if (source !== "x" || !pendingAuth || authState?.user) {
        return;
      }

      requestAnimationFrame(() => {
        dispatch(setAuthModal(true));
      });
    },
    [authState?.user, dispatch]
  );

  // [OPTIMIZATION: Phase 3.2] Hero section: Follow counts - STALE-WHILE-REVALIDATE with silent background refresh
  // Why: Instant display of cached counts, silent update when counts change (no skeleton, just update number)
  useEffect(() => {
    if (profile?.id) {
      // Show cached counts immediately if available
      const cachedCounts = getCachedFollowCounts(profile.id);
      if (cachedCounts) {
        // console.log(
        //   "[OwnProfilePage] Using cached follow counts (stale-while-revalidate):",
        //   cachedCounts
        // );
        setCounts(cachedCounts);
        setCountsLoading(false); // No loading state if we have cached data
      } else {
        setCountsLoading(true); // Only show loading if no cache
      }

      // [OPTIMIZATION: Phase 3.2] Background refresh: fetch fresh counts and update silently if changed
      // Why: Silent updates - no skeleton, just update the number when it changes
      getFollowCounts(profile.id)
        .then((freshCounts) => {
          // [OPTIMIZATION: Phase 3.2] Only update if counts actually changed (silent update)
          // Use cachedCounts for comparison (from closure), or current state if cache was empty
          setCounts((currentCounts) => {
            const countsChanged =
              !cachedCounts ||
              cachedCounts.followers !== freshCounts.followers ||
              cachedCounts.following !== freshCounts.following;

            if (countsChanged) {
              // console.log(
              //   "[OwnProfilePage] Counts changed, updating silently:",
              //   { old: cachedCounts || currentCounts, new: freshCounts }
              // );
            }

            // Always return fresh counts (update silently)
            return freshCounts;
          });

          // Always cache the fresh counts (even if not changed, refresh TTL)
          setCachedFollowCounts(profile.id, freshCounts);
          setCountsLoading(false);
        })
        .catch(() => {
          // On error, keep cached counts if available
          if (!cachedCounts) {
            setCountsLoading(false);
          }
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
    const baseUrl = getPublicShareBaseUrl();
    if (profile?.username) {
      return `${baseUrl}/u/${profile.username}`;
    }
    // Fallback to profile ID if no username
    if (profile?.id) {
      return `${baseUrl}/u/${profile.id}`;
    }
    return `${baseUrl}/profile`;
  }, [profile]);

  /** Stable snapshot for edit modal hydration (avoids unnecessary reference churn). */
  const editModalInitialData = useMemo(
    () =>
      profile
        ? {
            display_name: profile.display_name ?? null,
            username: profile.username ?? null,
            bio: profile.bio ?? null,
            avatar_url: profile.avatar_url ?? null,
            profile_photos: profile.profile_photos ?? [],
            echo_preset: profile.echo_preset ?? null,
            instagram_url: profile.instagram_url ?? null,
            tiktok_url: profile.tiktok_url ?? null,
            telegram_url: profile.telegram_url ?? null,
            member_no: profile.member_no ?? null,
            is_private: profile.is_private ?? null,
            social_media_public: profile.social_media_public ?? null,
            p2p_discover_enabled: profile.p2p_discover_enabled ?? null,
          }
        : undefined,
    [
      profile?.id,
      profile?.display_name,
      profile?.username,
      profile?.bio,
      profile?.avatar_url,
      profile?.profile_photos,
      profile?.echo_preset,
      profile?.instagram_url,
      profile?.tiktok_url,
      profile?.telegram_url,
      profile?.member_no,
      profile?.is_private,
      profile?.social_media_public,
      profile?.p2p_discover_enabled,
    ]
  );

  const handleRequestDeleteAccount = useCallback(() => {
    setFocusDeleteAccountOnEditorOpen(true);
    setFullScreenEditOpen(true);
  }, []);

  const handleFocusDeleteAccountHandled = useCallback(() => {
    setFocusDeleteAccountOnEditorOpen(false);
  }, []);

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
    setFocusDeleteAccountOnEditorOpen(false);
    setEditorFocusSection(null);
    setFullScreenEditOpen(false);
    if (isFirstTimeUser && !SKIP_WELCOME_ONBOARDING) {
      setShowOnboardingForTesting(true);
    }
  };

  // Soft card tones
  const softBg = "color-mix(in oklab, var(--text) 7%, transparent)";
  const softBorder = "color-mix(in oklab, var(--text) 14%, transparent)";
  const softDivider = "color-mix(in oklab, var(--text) 10%, transparent)";

  return (
    <>
      {isProfileTabVisible && (pullPx > 2 || ptrRefreshing) ? (
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
        {/* Atmosphere host: no overflow-x clip so -gutter can reach app-container edges */}
        <div className="relative w-full max-w-full min-w-0">
          <ProfileHeroAvatarAtmosphere
            avatarPath={heroAtmospherePath ?? profile?.avatar_url}
          />
          {/*
            No overflow-x clip here — Duo/Group shelf ::after must reach
            `.app-container` (overflow-x: clip). Atmosphere sits outside this
            layer and still uses -gutter insets.
          */}
          <div className="relative z-[1] w-full max-w-full min-w-0">
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
              onSearchFocusChange={setProfileSearchFocused}
              showHangoutReminderSetupInMenu
              onRequestEditProfile={() => setFullScreenEditOpen(true)}
              onRequestLogout={() => setShowLogoutConfirm(true)}
              onRequestDeleteAccount={handleRequestDeleteAccount}
              onRequestBlockList={() => setBlockListOpen(true)}
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

          <ProfileProvider
            value={useMemo(
              () => ({ profile: stableProfile, loading }),
              [stableProfile, loading]
            )}
          >
            <div
              className="group/own-overview relative w-full max-w-full min-w-0"
              style={{
                paddingTop: "calc(60px + env(safe-area-inset-top, 0px))",
              }}
            >
              {/* pb-5 when rail is absent (stats → Created). pb-0 when rail is
                  present so its bottom divider sits flush above Created/Saved. */}
              <section className="w-full max-w-full min-w-0 px-1.5 pt-1.5 pb-5 group-has-[[data-profile-social-opportunity-rail]]/own-overview:pb-0">
                {!loading && profile?.is_private && (
                  <div className="flex w-full max-w-full min-w-0 items-start gap-2 mb-1">
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

                      {/* Below lock — stays inside narrow Profile column (no left-full / nowrap escape) */}
                      {showPrivateTooltip && (
                        <div
                          className="absolute left-0 top-full z-50 mt-1.5 w-max max-w-[14rem]"
                          style={{
                            animation: "fadeInSlide 0.2s ease-out",
                          }}
                        >
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-lg">
                            <p className="text-sm leading-snug text-[var(--text)]">
                              This account is private
                            </p>
                            {/* Arrow pointing up toward lock icon */}
                            <div className="absolute left-3 top-0 -translate-y-full">
                              <div className="h-0 w-0 border-b-4 border-l-4 border-r-4 border-b-[var(--border)] border-l-transparent border-r-transparent" />
                              <div className="absolute left-0 top-[1px] h-0 w-0 border-b-4 border-l-4 border-r-4 border-b-[var(--surface)] border-l-transparent border-r-transparent" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showProfileHeroLoading ? (
                  <>
                    {/* Loading skeleton (profile fetch and/or Redux session hydrate) */}
                    <div className="flex flex-col items-center">
                      <div
                        className="rounded-[1.65rem] bg-[var(--text)]/10 animate-pulse"
                        style={{
                          width: "clamp(13.5rem, min(80vw, 40dvh), 19rem)",
                          aspectRatio: "1 / 1.04",
                        }}
                      />
                      <div className="mt-4 flex w-full min-w-0 max-w-[22rem] justify-center px-3">
                        <div className="h-4 w-28 rounded bg-[var(--text)]/10 animate-pulse" />
                        <div className="ml-2 h-3 w-16 self-center rounded bg-[var(--text)]/10 animate-pulse" />
                      </div>
                      <div className="mt-2 w-60">
                        <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse" />
                      </div>
                      {/* Profile Stats - Always visible, even during loading */}
                      <ProfileStats
                        following={0}
                        followers={0}
                        profileId=""
                        onOpenDrawer={setDrawerOpen}
                        loading={{
                          following: true,
                          followers: true,
                        }}
                      />
                    </div>
                  </>
                ) : profile ? (
                  <>
                    <div className="flex flex-col items-center">
                      <ProfilePhotoHero
                        key={profile.id}
                        profilePhotos={profile.profile_photos}
                        avatarUrl={profile.avatar_url}
                        echoPreset={profile.echo_preset}
                        userId={profile.user_id}
                        profileId={profile.id}
                        displayName={profile.display_name || profile.username}
                        memberNo={profile.member_no ?? null}
                        showEmptySlots
                        onAddPhoto={openOwnHeroAddPhotos}
                        addPhotoBusy={heroPhotoAddPipeline.busy}
                        onEditProfile={() => setFullScreenEditOpen(true)}
                        onEchoClick={() => setFullScreenEditOpen(true)}
                        onActiveDisplayPathChange={setHeroAtmospherePath}
                        lightboxActions={({ close }) => (
                          <AvatarPreviewLightboxAction
                            label="Edit"
                            icon={
                              <PiPencilSimple
                                className="h-5 w-5"
                                aria-hidden
                              />
                            }
                            onClick={() => {
                              close();
                              window.setTimeout(
                                () => setFullScreenEditOpen(true),
                                0,
                              );
                            }}
                          />
                        )}
                      />

                      <input
                        ref={heroAddCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        aria-hidden
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          (e.target as HTMLInputElement).value = "";
                          if (files.length === 0) return;
                          heroPhotoAddPipeline.acceptWebFiles(files);
                        }}
                      />
                      <input
                        ref={heroAddGalleryInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        aria-hidden
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          (e.target as HTMLInputElement).value = "";
                          if (files.length === 0) return;
                          heroPhotoAddPipeline.acceptWebFiles(files);
                        }}
                      />
                      <MediaAcquisitionSheet
                        variant="profilePhoto"
                        open={heroPhotoAddPipeline.mediaChooserOpen}
                        onClose={heroPhotoAddPipeline.closeMediaChooser}
                        onTakePhoto={() => {
                          if (isNativeApp()) {
                            void heroPhotoAddPipeline.captureCamera();
                            return;
                          }
                          openOwnHeroWebCamera();
                        }}
                        onPhotoLibrary={() => {
                          if (isNativeApp()) {
                            void heroPhotoAddPipeline.chooseLibrary();
                            return;
                          }
                          openOwnHeroWebGallery();
                        }}
                        busy={heroPhotoAddPipeline.mediaNativeBusy}
                      />
                      <AvatarCropModal
                        open={heroPhotoAddPipeline.cropOpen}
                        imageSrc={heroPhotoAddPipeline.cropImageSrc}
                        mode="profilePhoto"
                        onCancel={heroPhotoAddPipeline.cancelCrop}
                        onConfirm={heroPhotoAddPipeline.confirmCrop}
                      />

                      <ProfileIdentityRow
                        displayName={
                          profile.display_name || "Add your display name"
                        }
                        username={profile.username || "pick-a-username"}
                      />

                      {!profileCompletion.complete ? (
                        <ProfileCompletionCue
                          completion={profileCompletion}
                          onOpen={openCompletionChecklist}
                        />
                      ) : null}

                      {hasProfileOverviewBio(profile.bio) ? (
                        <div className={PROFILE_OVERVIEW_BIO_WRAP_CLASS}>
                          <p className={PROFILE_OVERVIEW_BIO_TEXT_CLASS}>
                            {profile.bio}
                          </p>
                        </div>
                      ) : null}

                      {/* Social Media Links */}
                      <SocialMediaLinks
                        profile={profile}
                        loading={loading}
                        showDividers={false}
                      />

                      {/* Profile Stats - Always visible, numbers load with animation */}
                      <ProfileStats
                        following={counts.following}
                        followers={counts.followers}
                        profileId={profile.id}
                        onOpenDrawer={setDrawerOpen}
                        className="mb-0"
                        loading={{
                          following: countsLoading,
                          followers: countsLoading,
                        }}
                      />

                      {isReportReviewer ? (
                        <div className="mt-4 flex justify-center">
                          <button
                            type="button"
                            onClick={() => navigate(Paths.internal)}
                            className="text-[11px] font-medium text-[var(--text)]/55 underline decoration-[var(--text)]/30 underline-offset-2 hover:text-[var(--text)]/80 active:opacity-80 touch-manipulation"
                          >
                            Internal tools
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : !hasSignedInIdentity ? (
                  <div className="flex flex-col items-center mt-3">
                    <div className="w-24 h-24 rounded-full bg-[var(--text)]/10" />
                    <div className="text-center mt-3">
                      <div className="text-[15px] font-semibold leading-none text-[var(--text)]/50">
                        Sign in to view your profile
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center mt-3 px-4">
                    <div className="w-24 h-24 rounded-full bg-[var(--text)]/10" />
                    <div className="text-center mt-3 max-w-[30ch]">
                      <div className="text-[15px] font-semibold leading-none text-[var(--text)]/60">
                        We couldn&apos;t load your profile yet
                      </div>
                      <div className="text-[13px] leading-snug text-[var(--text)]/45 mt-2">
                        Pull down to refresh, or open this tab again in a moment.
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Outside overview pb so rail bottom divider sits flush with tab band */}
              {profile?.user_id ? (
                <ProfileSocialOpportunityRail
                  profileUserId={profile.user_id}
                  enabled={!!profile.user_id}
                />
              ) : null}
            </div>

            {/* Posts Section - Always visible, even during loading */}
            <OwnProfilePostsSection
              visible={isProfileTabVisible}
              feedRefreshEpoch={profileFeedRefreshEpoch}
              focusCreatedTabEpoch={publishReturnFocusEpoch}
            />

            {/* Modals and drawers */}
            {profile && (
              <>
                <FullScreenProfileCreation
                  open={fullScreenEditOpen}
                  onClose={() => {
                    setFocusDeleteAccountOnEditorOpen(false);
                    setEditorFocusSection(null);
                    setFullScreenEditOpen(false);
                  }}
                  profileId={profile.id}
                  isFirstTime={isFirstTimeUser}
                  onComplete={handleProfileCreationComplete}
                  initialProfileData={editModalInitialData}
                  focusDeleteAccountOnMount={focusDeleteAccountOnEditorOpen}
                  onFocusDeleteAccountHandled={handleFocusDeleteAccountHandled}
                  initialFocusSection={editorFocusSection}
                  onInitialFocusSectionHandled={handleInitialFocusSectionHandled}
                />
                <ProfileCompletionChecklist
                  open={completionChecklistOpen}
                  onClose={closeCompletionChecklist}
                  completion={profileCompletion}
                  onAddPhoto={() => {
                    openOwnHeroAddPhotos();
                  }}
                  onAddBio={() => openEditorFromCompletion("bio")}
                  onAddSocial={() => openEditorFromCompletion("social")}
                  onEditProfile={() => openEditorFromCompletion(null)}
                  dismissEnabled={
                    !heroPhotoAddPipeline.mediaChooserOpen &&
                    !heroPhotoAddPipeline.cropOpen
                  }
                />
                {drawerOpen && (
                  <FollowListDrawer
                    open={!!drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    profileId={profile.id}
                    mode={drawerOpen}
                  />
                )}
                <BlockListDrawer
                  open={blockListOpen}
                  onClose={() => setBlockListOpen(false)}
                />
                {showOnboardingForTesting && (
                  <div className="fixed inset-0 z-50 bg-[var(--bg)]">
                    <OnboardingFlow
                      userId={profile.id}
                      memberNo={profile.member_no || 0}
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

            {/* Logout Confirmation - Outside profile check so it always works */}
            <ConfirmDialog
              open={showLogoutConfirm}
              onClose={() => !isLoggingOut && setShowLogoutConfirm(false)}
              onConfirm={async () => {
                if (isLoggingOut) return;
                setIsLoggingOut(true);
                try {
                  localStorage.removeItem("guest_until");
                  navigate("/");
                  await deleteMyPushDevices();
                  await supabase.auth.signOut();
                } finally {
                  setShowLogoutConfirm(false);
                  setIsLoggingOut(false);
                }
              }}
              title="Log out?"
              message="Are you sure you want to log out?"
              cancelLabel="Stay"
              confirmLabel="Log out"
              confirmVariant="danger"
              isLoading={isLoggingOut}
            />
          </ProfileProvider>
          </div>
        </div>
      </PrimaryPageContainer>

      <WelcomeModal
        isOpen={showInfoModal}
        onClose={handleWelcomeClose}
      />
    </>
  );
}
