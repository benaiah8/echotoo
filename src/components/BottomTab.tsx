import { BsPersonFill } from "react-icons/bs";
import { FaHome } from "react-icons/fa";
import { IoGameController, IoNotifications } from "react-icons/io5";
import { RiAddBoxFill } from "react-icons/ri";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";
import AuthModal from "./modal/AuthModal";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { useEffect, useState, useRef } from "react";
import Avatar from "./ui/Avatar";
import { supabase } from "../lib/supabaseClient";
import { getUnreadNotificationCount } from "../api/services/notifications";
import { dbg } from "../lib/authDebug";
import { isDraftDirty, discardAllDrafts, hasAnyDraftData } from "../lib/drafts";

function BottomTab() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [myHandle, setMyHandle] = useState<string>(
    localStorage.getItem("my_username") || ""
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const navTargetRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const sync = () => {
      const h = localStorage.getItem("my_username") || "";
      setMyHandle(h);
    };
    // update when profile is saved
    const onUpdated = () => sync();
    window.addEventListener("profile:updated", onUpdated);

    // also refresh when tab becomes active again (coming back to the app)
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sync();
    });
    return () => window.removeEventListener("profile:updated", onUpdated);
  }, []);

  // Whether Redux currently knows about a signed-in user
  const isAuthed = useSelector((s: any) => !!s.auth?.user);

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

  // Load notification count when user is authenticated
  useEffect(() => {
    let isActive = true;

    const loadNotificationCount = async () => {
      if (isAuthedFinal) {
        try {
          const count = await getUnreadNotificationCount();
          if (isActive) {
            setUnreadNotificationCount(count);
          }
        } catch (error) {
          console.error("Failed to load notification count:", error);
        }
      } else {
        if (isActive) {
          setUnreadNotificationCount(0);
        }
      }
    };

    loadNotificationCount();

    // Refresh count when tab becomes visible (user might have read notifications elsewhere)
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthedFinal) {
        loadNotificationCount();
      }
    };

    // Refresh count when notifications are updated (e.g., marked as read)
    const handleNotificationsUpdated = () => {
      if (isAuthedFinal) {
        loadNotificationCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(
      "notifications:updated",
      handleNotificationsUpdated
    );

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        "notifications:updated",
        handleNotificationsUpdated
      );
    };
  }, [isAuthedFinal]);

  const inCreate = location.pathname.startsWith("/create");

  dbg("BottomTab:authState", {
    reduxUserId:
      (useSelector((s: any) => s.auth?.user?.id) as string | undefined) ?? null,
    sessionUserId,
    isAuthedFinal,
    guest_until: localStorage.getItem("guest_until"),
  });

  // Optional: honor “guest until” suppression from localStorage
  const suppressAuth = () => {
    const until = Number(localStorage.getItem("guest_until") || 0);
    return Date.now() < until;
  };

  // If not authed (and not suppressed), show modal and keep user on feed
  const requireAuth = (nav: () => void) => {
    const suppressed = suppressAuth();
    dbg("requireAuth", { isAuthedFinal, suppressed, path: location.pathname });
    if (isAuthedFinal || suppressed) {
      nav();
      return;
    }
    if (location.pathname !== Paths.home) navigate(Paths.home);
    dispatch(setAuthModal(true));
  };

  // Redux auth today = { id: string; email: string|null } | null
  const authUser = useSelector((s: any) => s.auth?.user || null);

  // Bottom tab avatar + initial (display_name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    localStorage.getItem("my_avatar_url") || null
  );
  const [displayName, setDisplayName] = useState<string | null>(
    localStorage.getItem("my_display_name") || null
  );

  const [hidden, setHidden] = useState(false);
  const lastY = useRef<number>(
    typeof window !== "undefined" ? window.scrollY : 0
  );
  const ticking = useRef(false);

  useEffect(() => {
    let on = true;
    (async () => {
      if (!authedId) {
        setAvatarUrl(null);
        setDisplayName(null);
        localStorage.removeItem("my_avatar_url");
        localStorage.removeItem("my_display_name");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, display_name")
        .eq("user_id", authedId)
        .single();

      if (!on) return;

      const url = error ? null : data?.avatar_url ?? null;
      const name = error ? null : data?.display_name ?? null;

      setAvatarUrl(url);
      setDisplayName(name);

      // cache for next mount to avoid flicker
      if (url) {
        localStorage.setItem("my_avatar_url", url);
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
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, display_name")
        .eq("user_id", authedId)
        .single();

      if (error) return;
      const url = data?.avatar_url ?? null;
      const name = data?.display_name ?? null;

      setAvatarUrl(url);
      setDisplayName(name);

      try {
        if (url) localStorage.setItem("my_avatar_url", url);
        else localStorage.removeItem("my_avatar_url");
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
    const onScroll = () => {
      const current = window.scrollY;

      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const delta = current - lastY.current;

          // ignore tiny jitters
          if (Math.abs(delta) > 6) {
            if (delta > 0 && current > 60) {
              // scrolling down
              setHidden(true);
            } else {
              // scrolling up (or near top)
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

  // Safe helpers for optional routes (avoid TS errors + runtime crashes)
  const toGames = (Paths as any).games ?? (Paths as any).game ?? null; // may not exist yet

  const goProfile = () => {
    const handle = (
      localStorage.getItem("my_username") ||
      myHandle ||
      ""
    ).trim();
    navigate(handle ? `/u/${handle}` : "/u/me"); // prefer pretty URL
  };

  const tryNavigateAwayFromCreate = (go: () => void) => {
    const inCreate = location.pathname.startsWith("/create");
    const editMode = localStorage.getItem("editPostData") !== null;
    const dirty = isDraftDirty() && hasAnyDraftData();

    if (inCreate && (dirty || editMode)) {
      setIsEditMode(editMode);
      navTargetRef.current = go;
      setLeaveOpen(true);
      return;
    }
    go();
  };

  const menu = [
    {
      icon: <FaHome />,
      onClick: () => tryNavigateAwayFromCreate(() => navigate(Paths.home)),
    },
    {
      icon: <IoGameController />,
      onClick: () =>
        tryNavigateAwayFromCreate(() =>
          requireAuth(() => {
            if (toGames) navigate(toGames);
          })
        ),
    },
    {
      icon: <RiAddBoxFill />,
      onClick: () =>
        requireAuth(() =>
          tryNavigateAwayFromCreate(() => navigate(Paths.create))
        ),
    },
    {
      icon: (
        <div className="relative">
          <IoNotifications />
          {unreadNotificationCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </div>
          )}
        </div>
      ),
      onClick: () =>
        tryNavigateAwayFromCreate(() =>
          requireAuth(() => {
            // Always navigate to notifications and reset filter to "all"
            navigate(Paths.notification);
            // Dispatch an event to reset the filter
            window.dispatchEvent(
              new CustomEvent("notification:resetFilter", {
                detail: { filter: "all" },
              })
            );
          })
        ),
    },
    {
      icon: avatarUrl ? (
        <Avatar url={avatarUrl} name={displayName || " "} size={28} />
      ) : (
        <BsPersonFill />
      ),
      onClick: () =>
        tryNavigateAwayFromCreate(() => requireAuth(() => goProfile())),
    },
  ];

  return (
    <div
      id="bottom-tab"
      data-bottomtab
      className={[
        "fixed left-0 right-0 bottom-0 z-40 border-t border-[var(--border)]",
        "bg-[var(--surface)]/95 backdrop-blur-md",
        "transition-transform duration-300",
        hidden ? "translate-y-[110%]" : "translate-y-0",
      ].join(" ")}
    >
      <AuthModal />

      <div className="max-w-[640px] mx-auto px-[var(--gutter)]">
        <div className="py-2 flex px-4 items-center justify-between">
          {menu.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="p-2 text-[var(--text)] text-[24px] rounded-md hover:hover:bg-[rgba(255,255,255,0.08)] transition-colors"
              aria-label={`tab-${index}`}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: "env(safe-area-inset-bottom)" }} />
      {leaveOpen && (
        <div className="fixed inset-0 z-[1000]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setLeaveOpen(false)}
          />
          <div
            className="absolute left-0 right-0 bottom-0 mx-auto max-w-[640px]
                    rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)]
                    p-4"
          >
            <div className="text-sm font-semibold mb-1">
              {isEditMode ? "Exit edit mode?" : "Save draft?"}
            </div>
            <p className="text-xs text-[var(--text)]/70 mb-3">
              {isEditMode
                ? "You're leaving the edit flow. All your changes will not be saved."
                : "You're leaving the create flow. Save your progress as a draft, discard it, or stay here."}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs"
                onClick={() => setLeaveOpen(false)}
              >
                Stay
              </button>
              {isEditMode ? (
                <button
                  className="flex-1 px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold"
                  onClick={() => {
                    localStorage.removeItem("editPostData");
                    setLeaveOpen(false);
                    const go = navTargetRef.current;
                    navTargetRef.current = null;
                    go && go();
                  }}
                >
                  Exit
                </button>
              ) : (
                <>
                  <button
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--brand)] text-[var(--brand-ink)] text-xs font-semibold border border-[var(--brand)]"
                    onClick={() => {
                      // "Save" = keep localStorage drafts (you already auto-save)
                      setLeaveOpen(false);
                      const go = navTargetRef.current;
                      navTargetRef.current = null;
                      go && go();
                    }}
                  >
                    Save draft
                  </button>
                  <button
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs"
                    onClick={() => {
                      discardAllDrafts();
                      setLeaveOpen(false);
                      const go = navTargetRef.current;
                      navTargetRef.current = null;
                      go && go();
                    }}
                  >
                    Discard
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AuthModal for global use */}
      <AuthModal />
    </div>
  );
}

export default BottomTab;
