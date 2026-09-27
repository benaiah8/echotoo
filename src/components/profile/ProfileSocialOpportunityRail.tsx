import ProfileSocialOpportunityCard from "./ProfileSocialOpportunityCard";
import { PROFILE_SOCIAL_OPPORTUNITY_LIMIT } from "../../api/services/profileSocialOpportunities";
import { useProfileSocialOpportunities } from "../../hooks/useProfileSocialOpportunities";

/**
 * Shared Profile horizontal rail of current Duo + hosted Group opportunities
 * (Own + Other). Hidden when empty. Cap = 8.
 * Other viewers: Discover OFF → server []. Self: Discover OFF still lists own actives.
 *
 * Must `self-stretch w-full` inside Profile's `items-center` column so the
 * scrollport is viewport-bounded (Home ProgressiveHorizontalRail pattern).
 * Top/bottom `border-y` dividers; no edge fade overlays.
 *
 * Scroll: match Home — `overflow-x-auto scroll-hide` only.
 * Avoid touch-action pan-x locks (they block vertical page scroll on mobile).
 */
export default function ProfileSocialOpportunityRail({
  profileUserId,
  enabled,
}: {
  profileUserId: string | null | undefined;
  enabled: boolean;
}) {
  const { opportunities, loading, viewerUserId } = useProfileSocialOpportunities({
    profileUserId,
    enabled,
  });

  const visible = opportunities.slice(0, PROFILE_SOCIAL_OPPORTUNITY_LIMIT);

  if (!enabled || (!loading && visible.length === 0)) {
    return null;
  }

  /** Equal L/R inset so the first card and trailing edge match. */
  const rowPadClass = "px-2.5";

  /** Unified Home-style skeleton (Own + Other share the same geometry). */
  const skeleton = (
    <div className={`flex w-max gap-3 ${rowPadClass}`}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
          data-profile-social-skeleton
          aria-hidden
        >
          <div className="relative mb-3 overflow-hidden rounded-[14px] border border-[var(--border)] ui-card pt-2 px-3 pb-2">
            <div className="relative z-10 flex min-w-0 flex-col">
              <div className="flex h-[26px] w-full min-w-0 items-center justify-center">
                <div className="h-full w-full rounded-full bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
                <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3 w-16 max-w-[40%] shrink-0 rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 min-h-[60px] space-y-2">
                <div className="h-3.5 w-[88%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3.5 w-[72%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3.5 w-[55%] rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 flex min-w-0 shrink-0 items-center gap-2">
                <div className="h-7 w-10 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse" />
                <div className="h-7 w-11 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const row = (
    <div className={`flex w-max gap-3 ${rowPadClass}`}>
      {visible.map((item) => (
        <div key={item.source_post_id} className="shrink-0">
          <ProfileSocialOpportunityCard
            row={item}
            profileUserId={profileUserId!}
            viewerUserId={viewerUserId}
          />
        </div>
      ))}
    </div>
  );

  return (
    <section
      className="mt-5 mb-0 w-full min-w-0 max-w-full self-stretch border-y border-[var(--border)]/55"
      data-profile-social-opportunity-rail
    >
      <div className="w-full min-w-0 max-w-full overflow-x-auto scroll-hide pt-2.5 pb-3.5">
        {loading && visible.length === 0 ? skeleton : row}
      </div>
    </section>
  );
}
