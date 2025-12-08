import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import ProfileHeroSection from "../sections/profile/ProfileHeroSection";

import OwnProfilePostsSection from "../sections/profile/OwnProfilePostsSection";
import OtherProfilePostsSection from "../sections/profile/OtherProfilePostsSection";
import { supabase } from "../lib/supabaseClient";
import { ProfileProvider, type Profile } from "../contexts/ProfileContext";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { RootState } from "../app/store";
import Modal from "../components/modal/Modal";
import { FiPhone } from "react-icons/fi";
import { FaInstagram, FaApple, FaGooglePlay } from "react-icons/fa";

import ProfileTopBar from "../components/profile/ProfileTopBar";
import ProfileSearchResults from "../components/profile/ProfileSearchResults";
import {
  getProfileCached,
  primeProfileCache,
  invalidateProfile,
} from "../lib/profileCache";

function ProfilePage() {
  const { username } = useParams<{ username?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const location = useLocation();

  // Determine if we're on /u/me route
  const isMeRoute = location.pathname === "/u/me";
  const effectiveUsername = isMeRoute ? "me" : username;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastY = useRef<number>(
    typeof window !== "undefined" ? window.scrollY : 0
  );
  const ticking = useRef(false);

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

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
    };
  }, [showInfoModal]);

  // grab viewer once
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log(
        "[ProfilePage] useEffect triggered with username:",
        username,
        "effectiveUsername:",
        effectiveUsername,
        "isMeRoute:",
        isMeRoute
      );
      if (!effectiveUsername) return;

      // show cached instantly; only show skeleton if we don't have cache
      const cached = getProfileCached(effectiveUsername);
      if (cached) {
        setProfile(cached);
        setLoading(false); // ✅ no skeleton if we have cache
      } else {
        setLoading(true); // only skeleton on very first visit
      }

      try {
        // helper: safe setter
        const setSafe = (fn: () => void) => {
          if (!cancelled) fn();
        };

        // 1) /u/me — show my profile by id, optionally redirect to /u/<username>
        if (effectiveUsername === "me") {
          console.log("[ProfilePage] Loading /u/me profile...");
          const { data: userData, error: userErr } =
            await supabase.auth.getUser();
          const uid = userData?.user?.id ?? null;
          console.log("[ProfilePage] User ID:", uid);
          if (userErr) console.error("[ProfilePage] getUser error:", userErr);

          if (!uid) {
            console.log("[ProfilePage] No user ID, showing sign-in prompt");
            // signed out: just show the sign-in prompt area (profile stays null)
            setSafe(() => {
              setProfile(null);
            });
            return;
          }

          // Load my full profile by id
          console.log("[ProfilePage] Fetching profile for ID:", uid);
          const { data: me, error: meErr } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
            )
            .eq("user_id", uid)
            .maybeSingle();

          console.log("[ProfilePage] Profile data:", me);
          console.log("[ProfilePage] Profile error:", meErr);

          if (meErr) {
            console.error("[ProfilePage] profiles by id error:", meErr);
            setSafe(() => setProfile(null));
            return;
          }

          setSafe(() => setProfile(me as Profile));
          if (me)
            primeProfileCache({
              ...me,
              member_no: me.member_no ?? null,
            } as any);
          if (me?.username) localStorage.setItem("my_username", me.username);
          if (me?.id) localStorage.setItem("my_profile_id", me.id); // Cache profile ID for instant FollowButton checks

          // If I actually have a username, redirect to the pretty URL
          const handle = (me?.username ?? "").trim();
          console.log("[ProfilePage] Username handle:", handle);
          if (handle && handle !== "me") {
            const targetUrl = `/u/${handle}`;
            console.log(
              "[ProfilePage] Current URL:",
              location.pathname,
              "Target URL:",
              targetUrl
            );
            // Only redirect if we're not already on the target URL
            if (location.pathname !== targetUrl) {
              console.log("[ProfilePage] Redirecting to /u/" + handle);
              // Important: clear loading before replace so no blank flash
              setSafe(() => setLoading(false));
              navigate(targetUrl, { replace: true });
            } else {
              console.log(
                "[ProfilePage] Already on correct URL, no redirect needed"
              );
            }
          }
          return;
        }

        // 2) /u/:usernameOrId — accept @handle, handle, or uuid
        const raw = effectiveUsername;
        const q = raw.startsWith("@") ? raw.slice(1) : raw;

        // "uuidish" = 36 chars with dashes (relaxed; not only v4)
        const uuidish = /^[0-9a-f-]{36}$/i.test(q);

        let prof: Profile | null = null;

        if (uuidish) {
          // Try id first
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
            )

            .eq("id", q)
            .maybeSingle();
          if (!error && data) {
            prof = data as Profile;
          } else {
            // Try user_id next (auth.users.id)
            if (!error && !data) {
              const { data: byUserId, error: byUserIdErr } = await supabase
                .from("profiles")
                .select(
                  "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
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
                "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
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
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
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
                "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
              )
              .eq("id", q)
              .maybeSingle();
            if (!byIdErr && byId) prof = byId as Profile;
          }
        }

        setSafe(() => setProfile(prof));
        if (prof)
          primeProfileCache({
            ...prof,
            member_no: prof.member_no ?? null,
          } as any);
      } catch (e) {
        console.error("[ProfilePage] unexpected error:", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUsername, navigate]);

  const showSignInPrompt = useMemo(() => {
    // No user logged in AND we're on /u/me OR /profile redirected to /me
    return !viewerId && effectiveUsername === "me";
  }, [viewerId, effectiveUsername]);

  useEffect(() => {
    const onProfileUpdated = async (e: any) => {
      const changedId: string | undefined = e.detail?.id;
      if (changedId) invalidateProfile(changedId);

      const isMeRouteNow =
        location.pathname === "/u/me" || effectiveUsername === "me";

      try {
        // When editing your own profile on /u/me, refetch by auth user id
        if (isMeRouteNow) {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id ?? null;
          if (!uid) return;
          const { data: me } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
            )
            .eq("user_id", uid)
            .maybeSingle();
          setProfile((me as any) ?? null);
          if (me) primeProfileCache(me as any);
          return;
        }

        // If you are viewing a concrete profile (/u/xxx) and that same profile was updated, refetch it
        if (profile?.id && changedId === profile.id) {
          const { data: p } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
            )
            .eq("id", profile.id)
            .maybeSingle();
          setProfile((p as any) ?? null);
          if (p) primeProfileCache(p as any);
        }
      } catch {
        // No-op
      }
    };

    window.addEventListener("profile:updated", onProfileUpdated);
    return () =>
      window.removeEventListener("profile:updated", onProfileUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUsername, profile?.id, location.pathname]);

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          const delta = current - lastY.current;

          // ignore tiny jitters
          if (Math.abs(delta) > 6) {
            if (delta > 0 && current > 100) {
              // scrolling down
              setHeaderHidden(true);
            } else {
              // scrolling up (or near top)
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

  // Handle logo click - show login modal if not authenticated, info popup if authenticated
  const handleLogoClick = () => {
    if (isAuthenticated) {
      setShowInfoModal(true);
    } else {
      dispatch(setAuthModal(true));
    }
  };

  return (
    <>
      <PrimaryPageContainer>
        <div className="relative">
          <div
            className={[
              "fixed left-0 right-0 top-0 z-40 border-b border-[var(--border)]",
              "bg-[var(--surface)]/95 backdrop-blur-md",
              "transition-transform duration-300",
              headerHidden ? "-translate-y-[110%]" : "translate-y-0",
            ].join(" ")}
          >
            <ProfileTopBar
              onLogoClick={handleLogoClick}
              onSearch={setUserQuery}
            />
          </div>

          {userQuery && (
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setUserQuery("")} // clicking the dimmed area closes
            >
              <div className="absolute inset-0 bg-[var(--surface)]/40" />

              {/* results panel, stops the close click */}
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

          {/* Fixed overlay: covers the page; click outside closes */}
          {userQuery && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-[49]"
                onClick={() => setUserQuery("")}
              />

              {/* Panel */}
              <div className="fixed left-3 right-3 top-[60px] z-[50]">
                <ProfileSearchResults
                  query={userQuery}
                  viewerId={profile?.id ?? null}
                  onClose={() => setUserQuery("")}
                />
              </div>
            </>
          )}

          {/* Overlay search panel — floats over the content */}

          {showSignInPrompt && !loading && (
            <div className="px-3 py-10 border-b border-[var(--border)] text-center">
              <p className="text-sm text-[var(--text)]/80 max-w-[30ch] mx-auto">
                Sign in to claim your profile, save posts, and RSVP to hangouts.
              </p>
              <button
                className="mt-4 px-4 py-2 rounded-xl text-sm border border-[var(--border)] bg-[var(--surface-2)]"
                onClick={() => dispatch(setAuthModal(true))}
              >
                Sign in / Create account
              </button>
            </div>
          )}

          <ProfileProvider value={{ profile, loading }}>
            {/* If we are on /u/:username and nothing found, show a clear message */}
            {!loading &&
              effectiveUsername &&
              effectiveUsername !== "me" &&
              !profile && (
                <div className="px-3 py-6 text-sm text-[var(--text)]/70 border-b border-white/14">
                  User not found.
                </div>
              )}

            {/* Sections (they read from useProfile); fine to render when profile is null on /me signed-out */}
            <div className="pt-[60px]">
              <ProfileHeroSection />
            </div>

            {profile && (
              <>
                {isMeRoute ||
                (viewerId && profile?.user_id && viewerId === profile.user_id) ? (
                  <OwnProfilePostsSection />
                ) : (
                  <OtherProfilePostsSection />
                )}
              </>
            )}
          </ProfileProvider>
        </div>
      </PrimaryPageContainer>

      {/* Info Modal for authenticated users - Full Screen */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col">
          {/* Header with close button */}
          <div className="flex justify-end p-4">
            <button
              onClick={() => setShowInfoModal(false)}
              className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
            >
              ×
            </button>
          </div>

          {/* Main Content */}
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

              {/* Contact Section */}
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  If you want to reach out to work with us, talk to us, or
                  invest in Echotoo, you can contact us:
                </p>

                <div className="flex flex-col gap-3">
                  {/* Phone */}
                  <a
                    href="tel:0902327218"
                    className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
                  >
                    <FiPhone className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">0902327218</span>
                  </a>

                  {/* Instagram */}
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

              {/* App Store & Play Store Section */}
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  Download our mobile app:
                </p>

                <div className="flex flex-col gap-3">
                  {/* App Store */}
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                    <FaApple className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">App Store</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>

                  {/* Play Store */}
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
export default ProfilePage;
