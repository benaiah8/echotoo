import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { PiX } from "react-icons/pi";
import { RootState } from "../../app/store";
import { Paths } from "../../router/Paths";
import { isAvatarPresetValue } from "../../lib/avatarPresets";
import { useIsDesktopLayout } from "../../lib/desktopLayoutDetection";

/** Matches default bio set in FullScreenProfileCreation save(). */
const DEFAULT_BIO_SNIPPET = "I'm too lazy to write a bio";

function profileFinishNudgeStorageKey(userId: string): string {
  return `echotoo_profile_finish_nudge_dismissed_${userId}`;
}

function isDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(profileFinishNudgeStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function isSoftIncompleteProfile(p: {
  avatar_url: string | null;
  bio: string | null;
  instagram_url: string | null;
}): boolean {
  const av = (p.avatar_url ?? "").trim();
  const presetOrEmpty = !av || isAvatarPresetValue(av);
  const bio = (p.bio ?? "").trim();
  const bioWeak =
    !bio ||
    bio === DEFAULT_BIO_SNIPPET ||
    bio.startsWith(DEFAULT_BIO_SNIPPET);
  const ig = (p.instagram_url ?? "").trim();
  return presetOrEmpty || bioWeak || !ig;
}

/**
 * Non-blocking prompt to enrich profile (bio, socials, custom avatar).
 * Dismiss stored per auth user in localStorage; hidden on `profile:updated`.
 */
export default function ProfileFinishSoftNudge() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();
  const authUser = useSelector((s: RootState) => s.auth?.user);
  const userId = authUser?.id ?? null;

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const evaluate = useCallback(async () => {
    if (!userId || isDismissed(userId)) {
      setVisible(false);
      return;
    }
    setLoading(true);
    try {
      const { getProfileByUserId } = await import("../../api/services/follows");
      const profile = await getProfileByUserId(userId);
      if (!profile) {
        setVisible(false);
        return;
      }
      setVisible(isSoftIncompleteProfile(profile));
    } catch {
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  useEffect(() => {
    const onProfileUpdated = () => {
      void evaluate();
    };
    window.addEventListener("profile:updated", onProfileUpdated);
    return () =>
      window.removeEventListener("profile:updated", onProfileUpdated);
  }, [evaluate]);

  if (!userId || !visible || loading) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(profileFinishNudgeStorageKey(userId), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const goEdit = () => {
    navigate(Paths.profileMe);
  };

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[34] w-[min(360px,calc(100vw-1.5rem))] -translate-x-1/2"
      style={{
        bottom: isDesktop
          ? "calc(16px + env(safe-area-inset-bottom, 0px))"
          : "calc(88px + env(safe-area-inset-bottom, 0px))",
      }}
      role="region"
      aria-label="Profile setup suggestion"
    >
      <div
        className="pointer-events-auto relative overflow-hidden rounded-2xl border border-[var(--border)] shadow-[0_12px_40px_-10px_rgba(0,0,0,0.38)] dark:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.55)]"
        style={{
          WebkitBackdropFilter: "blur(18px) saturate(1.15)",
          backdropFilter: "blur(18px) saturate(1.15)",
        }}
      >
        <div
          className="absolute inset-0 bg-[var(--surface-2)]/82 dark:bg-[var(--surface-2)]/72"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[var(--glass-bg)]/95 opacity-95 dark:opacity-90"
          aria-hidden
        />
        <div className="relative z-10 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-bold leading-tight tracking-tight text-[var(--text)]">
                Finish setting up your profile
              </h3>
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--text)]/88">
                Add a bio, Instagram, or choose your Echo avatar so people know
                it&apos;s you.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goEdit}
                  className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand-ink)] shadow-sm transition-opacity hover:opacity-90"
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)]/55 px-4 py-2 text-xs font-semibold text-[var(--text)]/85 backdrop-blur-sm transition-colors hover:bg-[var(--surface)]/75 hover:text-[var(--text)]"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-md p-0.5 text-[var(--text)]/45 transition-colors hover:bg-[var(--text)]/[0.08] hover:text-[var(--text)]/75"
              aria-label="Dismiss"
            >
              <PiX size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
