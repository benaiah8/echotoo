import {
  PiChatCircle,
  PiChatCircleFill,
  PiHouseFill,
  PiPlusBold,
  PiPlusSquareFill,
  PiSignOut,
  PiUserCircleFill,
  PiUsers,
  PiUsersFill,
} from "react-icons/pi";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths, isMessagesConversationPath } from "../router/Paths";
import AuthModal from "./modal/AuthModal";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import Avatar from "./ui/Avatar";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../lib/avatarCache";
import { avatarDisplayUrl } from "../lib/avatarDisplayUrl";
import { supabase } from "../lib/supabaseClient";
import { dbg } from "../lib/authDebug";
import { discardAllDrafts, discardOwnerPublishedEditLocalState } from "../lib/drafts";
import ConfirmDialog from "./ui/ConfirmDialog";
import {
  HOME_TAB_REFRESH_EVENT,
  PROFILE_TAB_REFRESH_EVENT,
  PEOPLE_TAB_REFRESH_EVENT,
  MESSAGES_TAB_REFRESH_EVENT,
} from "../lib/homeRefreshEvents";
import { useCreateChooser } from "../context/CreateChooserContext";
import {
  CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT,
  CREATE_FLOW_REQUEST_LEAVE_EVENT,
  dispatchCreateFlowPublishRequest,
  setCreateFlowIntentionalLeaveBypass,
  setCreateFlowLeaveDialogOpen,
  type CreateFlowRequestLeaveDetail,
} from "../lib/createFlowLeaveRequest";
import { shouldConfirmCreateFlowLeave, cleanupEmptyFreshCreateDraftIfNeeded } from "../lib/createFlowLeaveGuard";
import { EDIT_POST_DATA_KEY } from "../lib/editPostBootstrap";
import { isCreateFlowResumedLocalDraft } from "../lib/draftEntryGate";
import BottomTabPeekOwl from "./BottomTabPeekOwl";
import {
  HOME_SEARCH_TAB_CHROME_EVENT,
  getHomeSearchTabChromeHidden,
  type HomeSearchTabChromeDetail,
} from "../lib/homeSearchTabChrome";
import { blurFocusedDescendant } from "../lib/blurFocusedDescendant";
import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "../lib/storage/utils/capacitorDetection";
import { useHasUnreadMessages } from "../lib/messagesUnreadStore";
import { useHasNewActivities } from "../lib/messagesActivitiesAttentionStore";

/**
 * When true, the bottom tab follows window scroll: hides on scroll-down, shows on scroll-up.
 * When false, the tab stays visible (pinned); scroll listener is not attached.
 * Transition classes below still apply whenever `hidden` is true (e.g. if extended later).
 */
const BOTTOM_TAB_SCROLL_LINKED_VISIBILITY = false;
const GUEST_PROMPT_DELAY_MS = 20_000;

function isGuestPromptEligiblePath(pathname: string): boolean {
  if (pathname === "/" || pathname === Paths.home) return true;
  if (pathname.startsWith("/experience/")) return true;
  if (pathname.startsWith("/hangout/")) return true;
  if (pathname.startsWith("/u/") && pathname !== "/u/me") return true;
  return false;
}

function BottomTab() {
  const dispatch = useDispatch();
  const navigate = useNavigate(); // [TAB ARCHITECTURE] Handles all navigation via URL changes
  const location = useLocation();

  const [myHandle, setMyHandle] = useState<string>(
    localStorage.getItem("my_username") || ""
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const navTargetRef = useRef<null | (() => void)>(null);
  const {
    isOpen: createChooserOpen,
    closeChooser,
    enterCreateAsDefaultPost,
  } = useCreateChooser();
  // [PHASE 1.2] Guard to prevent infinite loop in requireAuth
  const requireAuthCallCountRef = useRef(0);
  const requireAuthLastPathRef = useRef<string | null>(null);
  const guestPromptTimerRef = useRef<number | null>(null);
  const guestPromptDismissedRef = useRef(false);
  const prevAuthModalRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const h = localStorage.getItem("my_username") || "";
      setMyHandle(h);
    };
    // update when profile is saved
    const onUpdated = () => sync();
    const onVisibilityChange = () => {
      if (!document.hidden) sync();
    };
    window.addEventListener("profile:updated", onUpdated);

    // also refresh when tab becomes active again (coming back to the app)
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("profile:updated", onUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Whether Redux currently knows about a signed-in user
  const isAuthed = useSelector((s: any) => !!s.auth?.user);
  const hasUnreadMessages = useHasUnreadMessages();
  const hasNewActivities = useHasNewActivities();
  const showMessagesAttention = hasUnreadMessages || hasNewActivities;

  // Modal state for AuthModal
  const { authModal } = useSelector((s: any) => s.modal);

  // Supabase session fallback (so gating works even before Redux hydrates)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;

    supabase.auth.getSession().then(({ data }) => {
      if (on) setSessionUserId(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (on) setSessionUserId(sess?.user?.id ?? null);
    });

    return () => {
      on = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Single source of truth for auth in this component
  const authedId =
    (useSelector((s: any) => s.auth?.user?.id) as string | undefined) ??
    sessionUserId;
  const isAuthedFinal = !!authedId;

  const inCreate = location.pathname.startsWith("/create");

  dbg("BottomTab:authState", {
    reduxUserId:
      (useSelector((s: any) => s.auth?.user?.id) as string | undefined) ?? null,
    sessionUserId,
    isAuthedFinal,
  });

  // Logged-out variant: protected tabs only open AuthModal, never navigate to protected routes
  const isLoggedOut = !isAuthedFinal;
  const onProtectedTabClickLoggedOut = () => {
    dispatch(setAuthModal(true));
  };

  // If not authed (and not suppressed), show modal and keep user on feed
  const requireAuth = (nav: () => void) => {
    // [PHASE 1.2] Guard against infinite loop - reset counter if path changed
    if (requireAuthLastPathRef.current !== location.pathname) {
      requireAuthCallCountRef.current = 0;
      requireAuthLastPathRef.current = location.pathname;
    }

    requireAuthCallCountRef.current++;

    // [PHASE 1.2] Prevent infinite loop - if called more than 5 times in a row, stop
    if (requireAuthCallCountRef.current > 5) {
      console.error(
        "[CRITICAL] requireAuth called",
        requireAuthCallCountRef.current,
        "times in a row! Preventing infinite loop. Path:",
        location.pathname
      );
      return; // Prevent infinite loop
    }

    // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
    // console.log(
    //   "🟡 [NAV DEBUG] requireAuth called - isAuthedFinal:",
    //   isAuthedFinal,
    //   "suppressed:",
    //   suppressed,
    //   "current path:",
    //   location.pathname
    // );
    if (isAuthedFinal) {
      // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
      // console.log(
      //   "🟡 [NAV DEBUG] requireAuth - PASSED, executing nav callback"
      // );
      requireAuthCallCountRef.current = 0; // Reset counter on success
      nav();
      return;
    }
    // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
    // console.log(
    //   "🟡 [NAV DEBUG] requireAuth - FAILED, showing auth modal"
    // );
    dispatch(setAuthModal(true));
  };

  // Track close events so the timer prompt only appears once per page session.
  useEffect(() => {
    if (prevAuthModalRef.current && !authModal && !isAuthedFinal) {
      guestPromptDismissedRef.current = true;
    }
    prevAuthModalRef.current = authModal;
  }, [authModal, isAuthedFinal]);

  // Guest prompt timer: give logged-out users a short exploration window on public browse routes.
  useEffect(() => {
    if (guestPromptTimerRef.current) {
      window.clearTimeout(guestPromptTimerRef.current);
      guestPromptTimerRef.current = null;
    }

    if (isAuthedFinal) {
      guestPromptDismissedRef.current = false;
      return;
    }

    if (authModal || guestPromptDismissedRef.current) return;
    if (!isGuestPromptEligiblePath(location.pathname)) return;
    if (document.hidden) return;

    guestPromptTimerRef.current = window.setTimeout(() => {
      if (!document.hidden && !guestPromptDismissedRef.current) {
        dispatch(setAuthModal(true));
      }
    }, GUEST_PROMPT_DELAY_MS);

    return () => {
      if (guestPromptTimerRef.current) {
        window.clearTimeout(guestPromptTimerRef.current);
        guestPromptTimerRef.current = null;
      }
    };
  }, [authModal, dispatch, isAuthedFinal, location.pathname]);

  // Redux auth today = { id: string; email: string|null } | null
  const authUser = useSelector((s: any) => s.auth?.user || null);

  // Bottom tab avatar + initial (display_name)
  // Try to get from avatarCache first, then fallback to localStorage
  const getInitialAvatarUrl = () => {
    // Try to get user_id from auth to check cache
    const cachedUserId = authUser?.id;
    if (cachedUserId) {
      const cached = getCachedAvatar(cachedUserId);
      if (cached) return cached;
    }
    // Fallback to localStorage
    return localStorage.getItem("my_avatar_url") || null;
  };
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    getInitialAvatarUrl()
  );
  const [displayName, setDisplayName] = useState<string | null>(
    localStorage.getItem("my_display_name") || null
  );

  // Helper to determine if user should see Avatar (immediate + accurate check)
  // [AVATAR FIX] Check authedId first to ensure avatar hides immediately on logout
  // Why: When user logs out, authedId becomes null, but localStorage might still have my_user_id
  // Checking authedId first ensures avatar disappears immediately on logout
  const shouldShowAvatar =
    !!authedId && (localStorage.getItem("my_user_id") || authedId);

  const [hidden, setHidden] = useState(false);
  const [hideHomeSearchNav, setHideHomeSearchNav] = useState(
    getHomeSearchTabChromeHidden
  );
  /** Root that receives aria-hidden when tab chrome is hidden (People / Home search). */
  const tabChromeHideRootRef = useRef<HTMLDivElement | null>(null);
  const lastY = useRef<number>(
    typeof window !== "undefined" ? window.scrollY : 0
  );
  const ticking = useRef(false);

  useEffect(() => {
    let on = true;
    (async () => {
      // Only clear if truly logged out (not just during initial async load)
      // This prevents flicker when authedId is temporarily null during initial load
      if (!authedId && !localStorage.getItem("my_user_id")) {
        setAvatarUrl(null);
        setDisplayName(null);
        localStorage.removeItem("my_avatar_url");
        localStorage.removeItem("my_display_name");
        return;
      }

      // Guard: Don't query if authedId is null (prevents 400 errors with user_id=eq.null)
      if (!authedId) {
        return; // Use cached values if available, but don't make invalid query
      }

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
      // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
      // getProfileByUserId() already returns avatar_url and display_name
      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(authedId);

      if (!on) return;

      const url = profile?.avatar_url ?? null;
      const name = profile?.display_name ?? null;

      setAvatarUrl(url);
      setDisplayName(name);

      // Cache avatar using avatarCache (for reuse everywhere)
      if (url && authedId) {
        setCachedAvatar(authedId, url);
        preloadAvatar(url);
        localStorage.setItem("my_avatar_url", url); // Keep for backward compatibility
      } else {
        localStorage.removeItem("my_avatar_url");
      }
      if (name) {
        localStorage.setItem("my_display_name", name);
      } else {
        localStorage.removeItem("my_display_name");
      }

      // Cache user_id for FollowButton and other components
      if (authedId) {
        localStorage.setItem("my_user_id", authedId);
      } else {
        localStorage.removeItem("my_user_id");
      }
    })();

    return () => {
      on = false;
    };
  }, [authedId]);

  // React to profile edits (avatar/display_name) without a hard reload
  useEffect(() => {
    const reload = async () => {
      if (!authedId) return;

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
      // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
      const { getProfileByUserId } = await import("../api/services/follows");
      const profile = await getProfileByUserId(authedId);

      if (!profile) return;
      const url = profile.avatar_url ?? null;
      const name = profile.display_name ?? null;

      setAvatarUrl(url);
      setDisplayName(name);

      try {
        // Cache avatar using avatarCache (for reuse everywhere)
        if (url && authedId) {
          setCachedAvatar(authedId, url);
          preloadAvatar(url);
          localStorage.setItem("my_avatar_url", url); // Keep for backward compatibility
        } else {
          localStorage.removeItem("my_avatar_url");
        }
        if (name) localStorage.setItem("my_display_name", name);
        else localStorage.removeItem("my_display_name");

        // Cache user_id for FollowButton and other components
        if (authedId) {
          localStorage.setItem("my_user_id", authedId);
        } else {
          localStorage.removeItem("my_user_id");
        }
      } catch {}
    };

    const onUpdated = () => reload();
    window.addEventListener("profile:updated", onUpdated);
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, [authedId]);

  useEffect(() => {
    const onChrome = (e: Event) => {
      const ce = e as CustomEvent<HomeSearchTabChromeDetail>;
      if (!ce.detail) return;
      setHideHomeSearchNav(ce.detail.hidden);
    };
    window.addEventListener(
      HOME_SEARCH_TAB_CHROME_EVENT,
      onChrome as EventListener
    );
    setHideHomeSearchNav(getHomeSearchTabChromeHidden());
    return () =>
      window.removeEventListener(
        HOME_SEARCH_TAB_CHROME_EVENT,
        onChrome as EventListener
      );
  }, []);

  useEffect(() => {
    if (!BOTTOM_TAB_SCROLL_LINKED_VISIBILITY) {
      setHidden(false);
      return;
    }

    const onScroll = () => {
      const current = window.scrollY;

      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const delta = current - lastY.current;

          // Low threshold (4px) for instant response
          if (Math.abs(delta) > 4) {
            if (delta > 0 && current > 40) {
              // scrolling down → hide (instant)
              setHidden(true);
            } else {
              // scrolling up (or near top) → show
              setHidden(false);
            }
            lastY.current = current;
          }

          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide: instant (75ms) with scale-down. Show: smooth ease-out (300ms)
  const transitionClass = hidden
    ? "duration-75 ease-out"
    : "duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]";
  const transformClass = hidden
    ? "translate-y-full scale-95 origin-bottom"
    : "translate-y-0 scale-100 origin-bottom";

  const goProfile = () => {
    if (import.meta.env.DEV) {
      console.log("🎯 [NAV-DEBUG] goProfile:", {
        currentPath: location.pathname,
        targetPath: Paths.profileMe,
      });
    }
    navigate(Paths.profileMe);
  };

  // [FROSTED GLASS] Determine which icon is active based on current route (Games tab removed)
  const getActiveIconIndex = (): number | null => {
    const path = location.pathname;

    // Home icon (index 0)
    if (path === Paths.home || path === "/") return 0;

    // People icon (index 1)
    if (path === Paths.people || path.startsWith("/people")) return 1;

    // Create icon (index 2)
    if (path.startsWith("/create")) return 2;

    // Messages icon (index 3) — inbox and conversation overlay
    if (path === Paths.messages || isMessagesConversationPath(path)) return 3;

    // Profile icon (index 4)
    if (
      path === Paths.profile ||
      path === Paths.profileMe ||
      path === "/u/me" ||
      path.startsWith("/u/")
    )
      return 4;

    // Notifications stays routed but is not on the bar
    return null;
  };

  /** When the create chooser overlay is open (still on e.g. Home), highlight Create — not Home + Create both “active”. */
  const activeIconIndex = createChooserOpen ? 2 : getActiveIconIndex();

  const tryNavigateAwayFromCreate = useCallback(
    (go: () => void) => {
      const inCreate = location.pathname.startsWith("/create");

      if (inCreate && shouldConfirmCreateFlowLeave()) {
        setIsEditMode(localStorage.getItem(EDIT_POST_DATA_KEY) !== null);
        navTargetRef.current = go;
        setLeaveOpen(true);
        return;
      }
      if (inCreate) {
        cleanupEmptyFreshCreateDraftIfNeeded();
      }
      go();
    },
    [location.pathname]
  );

  const runStashedLeaveNavigation = useCallback(() => {
    setCreateFlowIntentionalLeaveBypass(true);
    const go = navTargetRef.current;
    navTargetRef.current = null;
    go?.();
  }, []);

  useEffect(() => {
    setCreateFlowLeaveDialogOpen(leaveOpen);
  }, [leaveOpen]);

  useEffect(() => {
    const onDismissDialog = () => {
      setLeaveOpen(false);
      navTargetRef.current = null;
    };
    window.addEventListener(
      CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT,
      onDismissDialog
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT,
        onDismissDialog
      );
  }, []);

  useEffect(() => {
    const onRequestLeave = (e: Event) => {
      const ce = e as CustomEvent<CreateFlowRequestLeaveDetail>;
      const go = ce.detail?.go;
      if (typeof go !== "function") return;
      tryNavigateAwayFromCreate(go);
    };
    window.addEventListener(
      CREATE_FLOW_REQUEST_LEAVE_EVENT,
      onRequestLeave as EventListener
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_REQUEST_LEAVE_EVENT,
        onRequestLeave as EventListener
      );
  }, [tryNavigateAwayFromCreate]);

  // Logged-out: show auth modal instead of navigating (don't navigate to protected routes)
  const handleProtectedClick = (nav: () => void) => {
    if (isLoggedOut) {
      onProtectedTabClickLoggedOut();
      return;
    }
    nav();
  };

  const menu = [
    {
      icon: <PiHouseFill />,
      onClick: () => {
        closeChooser();
        tryNavigateAwayFromCreate(() => {
          const p = location.pathname;
          const onHome = p === Paths.home || p === "/" || p === Paths.games;
          if (onHome) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            window.dispatchEvent(
              new CustomEvent(HOME_TAB_REFRESH_EVENT, {
                detail: { source: "home-tab" as const },
              })
            );
            return;
          }
          navigate(Paths.home);
        });
      },
    },
    {
      icon: activeIconIndex === 1 ? <PiUsersFill /> : <PiUsers />,
      onClick: () =>
        handleProtectedClick(() =>
          tryNavigateAwayFromCreate(() =>
            requireAuth(() => {
              closeChooser();
              const p = location.pathname;
              const onPeople = p === Paths.people || p.startsWith("/people");
              if (onPeople) {
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.dispatchEvent(
                  new CustomEvent(PEOPLE_TAB_REFRESH_EVENT)
                );
                return;
              }
              // Blur tab focus before route makes this tree aria-hidden.
              blurFocusedDescendant(tabChromeHideRootRef.current);
              navigate(Paths.people);
            })
          )
        ),
    },
    {
      // Rendered specially in tab map: inactive = square+plus, active = plus on inverted pill
      icon: <PiPlusSquareFill />,
      onClick: () =>
        handleProtectedClick(() =>
          requireAuth(() =>
            tryNavigateAwayFromCreate(() => {
              if (createChooserOpen) {
                closeChooser();
                return;
              }
              enterCreateAsDefaultPost();
            })
          )
        ),
    },
    {
      icon:
        activeIconIndex === 3 ? <PiChatCircleFill /> : <PiChatCircle />,
      onClick: () =>
        handleProtectedClick(() =>
          tryNavigateAwayFromCreate(() =>
            requireAuth(() => {
              closeChooser();
              const p = location.pathname;
              if (p === Paths.messages) {
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.dispatchEvent(
                  new CustomEvent(MESSAGES_TAB_REFRESH_EVENT)
                );
                return;
              }
              navigate(Paths.messages);
            })
          )
        ),
    },
    {
      icon: shouldShowAvatar ? (
        <Avatar
          url={avatarUrl || undefined}
          name={displayName || " "}
          size={34}
          userId={authedId || null}
        />
      ) : (
        <PiUserCircleFill />
      ),
      onClick: () =>
        handleProtectedClick(() =>
          tryNavigateAwayFromCreate(() =>
            requireAuth(() => {
              closeChooser();
              const p = location.pathname;
              const onOwnProfile =
                p === Paths.profileMe ||
                p === Paths.profile ||
                p === "/u/me" ||
                p === Paths.me;
              // Only "already on my profile" matches home-tab behavior (scroll + refresh).
              // Other /u/:username routes must still navigate to /u/me via goProfile().
              if (onOwnProfile) {
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.dispatchEvent(
                  new CustomEvent(PROFILE_TAB_REFRESH_EVENT)
                );
                return;
              }
              goProfile();
            })
          )
        ),
    },
  ];

  const avatarTabDisplayUrl = avatarDisplayUrl(avatarUrl);

  /**
   * Pill `bottom` offset (visual gap above the viewport edge).
   * Native Android: position the pill **above** the full `--safe-area-bottom-layout`
   * (env + extras from `appSafeAreaBottom` for 3-button nav) plus a small gap —
   * additive, not subtractive from the inset, so the tab clears system buttons.
   * iOS: unchanged (layout minus fixed gap). Web / non-shell Android: `8px`.
   * Gradients/scrim below still use `--safe-area-bottom-layout` only.
   */
  const bottomTabBottomOffset =
    isNativeApp() && isAndroid()
      ? "max(14px, calc(var(--safe-area-bottom-layout, 0px) + 6px))"
      : isIOS()
        ? "max(5px, min(22px, calc(var(--safe-area-bottom-layout, 0px) - 14px)))"
        : "8px";

  /** Immersive People: hide chrome + peek; keep BottomTab mounted. */
  const hidePeopleNav =
    location.pathname === Paths.people ||
    location.pathname.startsWith(`${Paths.people}/`);
  /** Create finalize covers the tab via shell z-index — do not hide chrome for Create. */
  const hideTabChrome = hidePeopleNav || hideHomeSearchNav;

  /**
   * Before paint: if tab chrome is (or becomes) aria-hidden, clear focus that
   * still sits inside it (e.g. People tab button after tap → route change).
   * No-op when chrome stays visible or focus is elsewhere.
   */
  useLayoutEffect(() => {
    if (!hideTabChrome) return;
    blurFocusedDescendant(tabChromeHideRootRef.current);
  }, [hideTabChrome]);

  /**
   * People entry glitch: BottomTab uses `transition-all` (show ease ~300ms).
   * Applying only `invisible` lets visibility lag, so the global tab briefly
   * paints over People chrome (same z-40). Instant opacity + no transition
   * when hiding for People; Home search keeps prior hide class.
   */
  const composerNavHideClass = hideTabChrome
    ? hidePeopleNav
      ? "invisible pointer-events-none opacity-0 !transition-none"
      : "invisible pointer-events-none"
    : "";

  return (
    <>
      <AuthModal />
      {hideTabChrome ? null : (
        <BottomTabPeekOwl
          location={location}
          activeIconIndex={activeIconIndex}
          createChooserOpen={createChooserOpen}
        />
      )}
      {/* Gradient: flush with physical screen bottom (1px overlap to eliminate subpixel gap) */}
      <div
        className={[
          "fixed left-0 right-0 z-[35] pointer-events-none",
          `transition-all ${transitionClass}`,
          transformClass,
          composerNavHideClass,
        ].join(" ")}
        style={{
          bottom: "calc(-1px + -1 * var(--safe-area-bottom-layout))",
          height: "calc(66px + var(--safe-area-bottom-layout))",
          width: "100%",
          background: "var(--gradient-from-bottom)",
        }}
      />
      {/* System nav / home-indicator strip: theme fade so content does not read through buttons */}
      <div
        className={[
          "fixed left-0 right-0 z-[37] pointer-events-none",
          `transition-all ${transitionClass}`,
          transformClass,
          composerNavHideClass,
        ].join(" ")}
        style={{
          bottom: 0,
          height: "var(--safe-area-bottom-layout)",
          background: "var(--gradient-bottom-system-scrim)",
        }}
        aria-hidden
      />
      {/* Wrapper: tab pill only. Hide: instant + scale. Show: smooth ease-out. */}
      <div
        ref={tabChromeHideRootRef}
        className={[
          "fixed left-0 right-0 bottom-0 z-40 min-h-[80px] pointer-events-none flex flex-col justify-end",
          `transition-all ${transitionClass}`,
          transformClass,
          composerNavHideClass,
        ].join(" ")}
        aria-hidden={hideTabChrome}
      >
        {/* Tab pill: content-sized, full rounded pill, visible outline */}
        <div
          id="bottom-tab"
          data-bottomtab
          className={[
            "absolute left-1/2 -translate-x-1/2 z-40",
            hideTabChrome ? "pointer-events-none" : "pointer-events-auto",
            "rounded-full",
            "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
            /* Transparent 1px border keeps inner layout identical to before; ring is outside via shadow */
            "border border-transparent",
            "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
          ].join(" ")}
          style={{
            bottom: bottomTabBottomOffset,
          }}
        >
          <div className="py-[5px] px-[5px] flex items-center justify-center gap-2">
            {menu.map((item, index) => {
              const isActive = activeIconIndex === index;
              /** True create flow route: inverted white pill. Overlay-only: same frosted pill as Home/Notifs. */
              const createRouteActive = inCreate && !createChooserOpen;

              return (
                <button
                  key={index}
                  onClick={item.onClick}
                  className={`relative text-[var(--text)] transition-all flex items-center justify-center shrink-0 ${
                    index === 4 ? "bottom-tab-profile-btn" : ""
                  }`}
                  aria-label={`tab-${index}`}
                  data-tour-target={
                    index === 1 ? "people" : index === 2 ? "create" : undefined
                  }
                >
                  {/* Same pill size for active and inactive - no shifting when switching tabs */}
                  <div
                    className={`flex items-center justify-center h-10 min-w-[52px] px-3 rounded-full relative ${
                      index === 2 || index === 3
                        ? "overflow-visible"
                        : "overflow-hidden"
                    } ${
                      index === 2 ? "transition-none" : "transition-colors"
                    }                     ${
                      isActive
                        ? index === 2 && createRouteActive
                          ? "bg-[var(--bottom-tab-create-active-bg)] border border-[var(--bottom-tab-create-active-bg)] shadow-[var(--glass-active-shadow)]"
                          : index === 2 && !createRouteActive
                          ? "bg-[var(--bottom-tab-active-bg)] shadow-[var(--glass-active-shadow)] border border-[var(--glass-active-border)]"
                          : index === 0 || index === 1 || index === 3
                          ? "bg-[var(--bottom-tab-feed-notif-active-bg)] shadow-[var(--bottom-tab-feed-notif-active-shadow)] border border-[var(--bottom-tab-feed-notif-active-border)]"
                          : index === 4 && avatarTabDisplayUrl
                          ? "shadow-[var(--glass-active-shadow)] border border-[var(--glass-active-border)]"
                          : "bg-[var(--bottom-tab-active-bg)] shadow-[var(--glass-active-shadow)] border border-[var(--glass-active-border)]"
                        : "bg-transparent border border-transparent hover:bg-[rgba(255,255,255,0.08)]"
                    }`}
                  >
                    {/* Profile tab active: blurred avatar as faint "mirror" background. Same URL as Avatar img = browser cache reuse, no extra egress */}
                    {isActive && index === 4 && avatarTabDisplayUrl && (
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          backgroundImage: `url(${avatarTabDisplayUrl})`,
                          backgroundSize: "250%",
                          backgroundPosition: "center",
                          filter: "blur(4px)",
                          opacity: 0.88,
                        }}
                        aria-hidden
                      />
                    )}
                    {/* Profile tab active but no avatar: fallback to solid pill */}
                    {isActive && index === 4 && !avatarTabDisplayUrl && (
                      <div
                        className="absolute inset-0 rounded-full bg-[var(--bottom-tab-active-bg)]"
                        aria-hidden
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center w-full h-full">
                      {index === 4 && shouldShowAvatar ? (
                        <div className="bottom-tab-avatar-wrapper bottom-tab-profile-avatar flex items-center justify-center w-full h-full">
                          {item.icon}
                        </div>
                      ) : index === 2 ? (
                        /* Create: route /create = inverted pill + bold plus; overlay open = same frosted pill as Home + bold plus */
                        <div
                          className={`flex items-center justify-center [&_svg]:w-[28px] [&_svg]:h-[28px] [&_svg]:shrink-0 [&_svg]:origin-center transition-transform duration-200 ease-out ${
                            isActive && createRouteActive
                              ? "text-[var(--bottom-tab-create-active-fg)] scale-[1.07]"
                              : isActive
                              ? "text-[var(--text)] scale-[1.05]"
                              : "text-[var(--text)] scale-[0.93]"
                          }`}
                        >
                          {isActive ? <PiPlusBold /> : <PiPlusSquareFill />}
                        </div>
                      ) : (
                        <div
                          className={[
                            "flex items-center justify-center [&_svg]:w-[28px] [&_svg]:h-[28px] [&_svg]:shrink-0",
                            isActive &&
                            (index === 0 || index === 1 || index === 3)
                              ? "text-[var(--bottom-tab-feed-notif-active-fg)]"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {item.icon}
                        </div>
                      )}
                    </div>
                  </div>
                  {index === 3 && isAuthedFinal && showMessagesAttention ? (
                    <span
                      className="pointer-events-none absolute top-[3px] right-[8px] z-20 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_0_1.5px_var(--bg)]"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={leaveOpen}
        onClose={() => {
          setLeaveOpen(false);
          navTargetRef.current = null;
        }}
        title={
          isEditMode
            ? "Discard edits?"
            : isCreateFlowResumedLocalDraft()
            ? "Keep draft?"
            : "Leave create?"
        }
        message={
          isEditMode
            ? "You have unsaved changes to this post. If you leave now, your edits will be lost."
            : isCreateFlowResumedLocalDraft()
            ? "Your draft is saved on this device. You can leave and keep it, discard it, or stay to keep editing."
            : "Your progress is saved on this device. Leave and keep your draft, discard it, or stay to keep editing."
        }
        cancelLabel="Stay"
        pillButtons={isEditMode}
        {...(isEditMode
          ? {
              secondaryLabel: "Republish",
              onSecondary: () => {
                setLeaveOpen(false);
                navTargetRef.current = null;
                dispatchCreateFlowPublishRequest();
              },
              secondaryVariant: "primary" as const,
              confirmLabel: (
                <span
                  className="inline-flex items-center justify-center gap-1"
                  title="Discard and exit"
                >
                  <span>Exit</span>
                  <PiSignOut className="h-4 w-4 shrink-0" aria-hidden />
                </span>
              ),
              confirmVariant: "orange" as const,
              onConfirm: () => {
                discardOwnerPublishedEditLocalState();
                setLeaveOpen(false);
                runStashedLeaveNavigation();
              },
            }
          : {
              secondaryLabel: "Save draft",
              onSecondary: () => {
                setLeaveOpen(false);
                runStashedLeaveNavigation();
              },
              secondaryVariant: "primary" as const,
              confirmLabel: "Discard",
              confirmVariant: "dangerSoft" as const,
              onConfirm: () => {
                discardAllDrafts();
                setLeaveOpen(false);
                runStashedLeaveNavigation();
              },
            })}
      />
    </>
  );
}

export default BottomTab;
