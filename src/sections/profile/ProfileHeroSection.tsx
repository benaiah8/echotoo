import { useEffect, useMemo, useState } from "react";
import { useProfile } from "../../contexts/ProfileContext";
import {
  getFollowCounts,
  isFollowing as checkIsFollowing,
  follow as doFollow,
  unfollow as doUnfollow,
  getViewerId,
} from "../../api/services/follows";
import FollowListDrawer from "../../components/profile/FollowListDrawer";
import ImageLightbox from "../../components/ImageLightbox";
import Avatar from "../../components/ui/Avatar";
import FullScreenProfileCreation from "../../components/profile/FullScreenProfileCreation";
import SocialMediaLinks from "../../components/profile/SocialMediaLinks";
import OnboardingFlow from "../../components/onboarding/OnboardingFlow";
import NotificationBell from "../../components/ui/NotificationBell";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function ProfileHeroSection() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<
    false | "followers" | "following"
  >(false);
  const [lightbox, setLightbox] = useState(false);
  const [fullScreenEditOpen, setFullScreenEditOpen] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [showOnboardingForTesting, setShowOnboardingForTesting] =
    useState(false);
  const [userNumber, setUserNumber] = useState<number>(0);
  const loc = useLocation();
  const isOwn = useMemo(() => {
    // Check if we're on /u/me route first for immediate logout button display
    const isMeRoute = loc.pathname === "/u/me";
    console.log("[ProfileHeroSection] isOwn calculation:", {
      pathname: loc.pathname,
      isMeRoute,
      viewerId,
      profileId: profile?.id,
      profileUserId: profile?.user_id,
      isOwnResult:
        isMeRoute || (viewerId && profile?.id && viewerId === profile.id),
    });

    if (isMeRoute) {
      return true;
    }

    // Compare profile IDs (viewerId is profile ID, profile.id is also profile ID)
    if (!viewerId || !profile?.id) {
      return false;
    }

    const isOwnResult = viewerId === profile.id;
    console.log("[ProfileHeroSection] Final isOwn result:", isOwnResult);
    return isOwnResult;
  }, [viewerId, profile?.id, loc.pathname]);

  useEffect(() => {
    getViewerId().then(setViewerId);
  }, []);

  // Use member_number from profile data
  useEffect(() => {
    if (profile?.member_no != null) {
      setUserNumber(profile.member_no);
    }
  }, [profile?.member_no]);

  // Open edit if:
  //  - URL has ?edit=1 (one-shot; removed immediately)
  //  - It's your first time (no display_name + auto username), unless you already closed/saved once
  useEffect(() => {
    if (!profile) return;

    const params = new URLSearchParams(loc.search);
    const fromQuery = params.get("edit") === "1";
    const showOnboarding = params.get("onboarding") === "1";

    const onboardKey = `onboarded_${profile.id}`;
    const suppressed = localStorage.getItem(onboardKey) === "1";

    const looksAutoUsername = (profile.username ?? "")
      .toLowerCase()
      .startsWith("user_");
    const looksFirstTime = !profile.display_name && looksAutoUsername;

    if (fromQuery || (looksFirstTime && !suppressed)) {
      // Only show welcome message for actual first-time users
      setIsFirstTimeUser(looksFirstTime && !suppressed);
      setFullScreenEditOpen(true);
    }

    if (fromQuery) {
      params.delete("edit");
      navigate(
        {
          pathname: loc.pathname,
          search: params.toString() ? `?${params}` : "",
        },
        { replace: true }
      );
    }
  }, [profile, loc.pathname, loc.search, navigate]);

  useEffect(() => {
    if (profile?.id) getFollowCounts(profile.id).then(setCounts);
  }, [profile?.id]);
  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      const id = await getViewerId();
      if (!id || id === profile.id) return setIsFollowing(false);
      setIsFollowing(await checkIsFollowing(id, profile.id));
    })();
  }, [profile?.id]);

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

  const onToggleFollow = async () => {
    if (!profile?.id) return;
    setBusy(true);
    try {
      if (isFollowing) {
        setIsFollowing(false);
        const { error } = await doUnfollow(profile.id);
        if (error) setIsFollowing(true);
      } else {
        setIsFollowing(true);
        const { error } = await doFollow(profile.id);
        if (error) setIsFollowing(false);
      }
    } finally {
      setBusy(false);
    }
  };
  if (loading) {
    return (
      <section className="w-full px-3 pt-4 pb-6 border-b border-[var(--border)]">
        <div className="flex justify-end mb-1">
          {/* show a disabled pill so layout is stable */}
          <div className="opacity-70">
            <div className="h-7 min-w-[92px] rounded-full bg-[var(--text)]/10 animate-pulse" />
          </div>
        </div>

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

          <div className="mt-4 grid grid-cols-3 gap-3 w-full max-w-xs">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3"
              >
                <div className="h-5 bg-[var(--text)]/10 rounded animate-pulse mb-2" />
                <div className="h-[1px] bg-[var(--text)]/10" />
                <div className="h-3 mt-2 bg-[var(--text)]/10 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="w-full px-3 pt-4 pb-6 border-b border-[var(--border)]">
        {/* Placeholder profile structure */}
        <div className="flex justify-center mb-1">
          <div className="px-4 py-1.5 rounded-full text-xs border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]/50">
            User not found
          </div>
        </div>

        <div className="flex flex-col items-center mt-3">
          <div className="w-24 h-24 rounded-full bg-[var(--text)]/10" />

          <div className="text-center mt-3">
            <div className="text-[15px] font-semibold leading-none text-[var(--text)]/50">
              User not found
            </div>
            <div className="text-xs text-[var(--text)]/40 mt-1">@unknown</div>
          </div>

          <div className="mt-3 text-center max-w-[36ch]">
            <p className="text-[13px] leading-snug text-[var(--text)]/40">
              This user doesn't exist or their profile is private.
            </p>
          </div>

          {/* Placeholder stat cards */}
          <div className="mt-4 grid grid-cols-3 gap-3 w-full max-w-xs">
            {[
              { v: 0, l: "Following" },
              { v: 0, l: "Followers" },
              { v: 0, l: "XP" },
            ].map((it) => (
              <div
                key={it.l}
                className="flex-1 rounded-2xl overflow-hidden text-center"
                style={{
                  background:
                    "color-mix(in oklab, var(--text) 7%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--text) 14%, transparent)",
                  borderWidth: 1,
                }}
              >
                <div className="pt-2 pb-1">
                  <div className="text-[18px] font-semibold leading-none text-[var(--text)]/50">
                    {it.v}
                  </div>
                </div>
                <div
                  style={{
                    borderTop: `1px solid color-mix(in oklab, var(--text) 10%, transparent)`,
                  }}
                >
                  <div className="py-1 text-[11px] text-[var(--text)]/50">
                    {it.l}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Soft card tones (work in light & dark via text color mix)
  const softBg = "color-mix(in oklab, var(--text) 7%, transparent)";
  const softBorder = "color-mix(in oklab, var(--text) 14%, transparent)";
  const softDivider = "color-mix(in oklab, var(--text) 10%, transparent)";

  // Handler for profile creation completion
  const handleProfileCreationComplete = () => {
    setFullScreenEditOpen(false);
    if (isFirstTimeUser) {
      // After profile creation, show onboarding flow
      setShowOnboardingForTesting(true);
    }
  };

  return (
    <section className="w-full px-3 pt-4 pb-6 border-b border-[var(--border)]">
      {/* top action: centered Edit for own, right-aligned Follow otherwise */}
      {/* top action: only show Follow when viewing someone else */}
      <div className="flex w-full justify-end mb-1">
        {isOwn && (
          <button
            className="px-4 py-1.5 rounded-full text-xs border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-2)]/90 transition"
            onClick={async () => {
              localStorage.removeItem("guest_until");
              await supabase.auth.signOut();
              navigate("/");
            }}
          >
            Log out
          </button>
        )}
        {/* Fallback: if isOwn is false but we're on /u/me route, still show logout */}
        {!isOwn && loc.pathname === "/u/me" && (
          <button
            className="px-4 py-1.5 rounded-full text-xs border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-2)]/90 transition"
            onClick={async () => {
              localStorage.removeItem("guest_until");
              await supabase.auth.signOut();
              navigate("/");
            }}
          >
            Log out
          </button>
        )}
      </div>
      {/* user number pill (above avatar) */}
      {profile.member_no != null && (
        <div
          className="mx-auto mb-6 w-max px-4 py-2 rounded-full text-base font-medium"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 50%, rgba(255,204,0,0.18), rgba(255,204,0,0.06))",
            boxShadow:
              "0 0 0 1px rgba(255,204,0,0.35) inset, 0 0 28px rgba(255,204,0,0.25)",
            color: "var(--text)",
          }}
        >
          #{Number(profile.member_no).toLocaleString()}
        </div>
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

        {/* bio with a touch more breathing room */}
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
        <SocialMediaLinks profile={profile} isOwn={isOwn} loading={loading} />

        {!isOwn && (
          <div className="mt-3 w-full flex justify-center">
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={onToggleFollow}
                className={`h-6 px-2 rounded-md text-xs border ${
                  isFollowing
                    ? "bg-white text-black border-white"
                    : "border-[var(--border)] text-[var(--text)]"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>

              {/* Notification Bell - only show if following */}
              {isFollowing && (
                <NotificationBell targetId={profile.id} isFollowing={true} />
              )}
            </div>
          </div>
        )}

        {/* stat cards: lighter bg, bigger number, divider over label */}
        <div className="mt-4 grid grid-cols-3 gap-3 w-full max-w-xs">
          {[
            {
              v: counts.following,
              l: "Following",
              click: () => setDrawerOpen("following"),
            },
            {
              v: counts.followers,
              l: "Followers",
              click: () => setDrawerOpen("followers"),
            },
            { v: profile.xp ?? 0, l: "XP", click: undefined },
          ].map((it) => (
            <button
              key={it.l}
              onClick={it.click}
              className="flex-1 rounded-2xl overflow-hidden text-center"
              style={{
                background: softBg,
                borderColor: softBorder,
                borderWidth: 1,
              }}
            >
              <div className="pt-2 pb-1">
                <div className="text-[18px] font-semibold leading-none">
                  {it.v}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${softDivider}` }}>
                <div className="py-1 text-[11px] text-[var(--text)]/70">
                  {it.l}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <FullScreenProfileCreation
        open={fullScreenEditOpen}
        onClose={() => setFullScreenEditOpen(false)}
        profileId={profile.id}
        isFirstTime={isFirstTimeUser}
        onComplete={handleProfileCreationComplete}
      />{" "}
      {/* drawers & lightbox */}
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
      {/* Temporary onboarding flow for testing */}
      {showOnboardingForTesting && profile?.id && (
        <div className="fixed inset-0 z-50 bg-[var(--bg)]">
          <OnboardingFlow
            userId={profile.id}
            userNumber={userNumber}
            onComplete={() => setShowOnboardingForTesting(false)}
          />
        </div>
      )}
    </section>
  );
}
