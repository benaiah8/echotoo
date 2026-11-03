/**
 * Compact People category nav — Discover | Duo | Plans | Groups.
 * No Back control; global BottomTab owns app navigation.
 * Content-sized pill; short Home-token top fade (blur only on the capsule).
 */
import type { IconType } from "react-icons";
import {
  PiCalendarBlankBold,
  PiCompassBold,
  PiLockSimpleBold,
  PiUsersBold,
  PiUsersThreeBold,
} from "react-icons/pi";
import {
  PEOPLE_FLAT_DESTINATION_ORDER,
  type PeopleFlatDestination,
} from "./peopleShellLayout";
import type { PeopleGroupsPillState } from "./PeopleFluidNav";
import { peopleUiCopy } from "./peopleUiCopy";
import {
  PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX,
  PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX,
  peopleFeedTopNavOffset,
} from "../../lib/people/peopleFeedLayout";

export type PeopleFeedTopNavProps = {
  activeDestination: PeopleFlatDestination;
  discoverEnabled: boolean;
  groupsPillState?: PeopleGroupsPillState;
  /**
   * Duo-modern scroll-under marker (overlay still passes this).
   * Full-bleed fade is paint-only for all tabs — no outside-pill blur.
   */
  frostedScrollThrough?: boolean;
  onSelectDuo: () => void;
  onSelectDiscover: () => void;
  onSelectPlans: () => void;
  onSelectGroups: () => void;
};

const LABEL: Record<PeopleFlatDestination, string> = {
  discover: peopleUiCopy.scopeDiscover,
  duo: peopleUiCopy.shellDuo,
  plans: peopleUiCopy.scopeOpenPlans,
  groups: peopleUiCopy.shellGroups,
};

const DEST_ICON: Record<PeopleFlatDestination, IconType> = {
  discover: PiCompassBold,
  duo: PiUsersBold,
  plans: PiCalendarBlankBold,
  groups: PiUsersThreeBold,
};

export default function PeopleFeedTopNav({
  activeDestination,
  discoverEnabled,
  groupsPillState = "inactive",
  frostedScrollThrough = false,
  onSelectDuo,
  onSelectDiscover,
  onSelectPlans,
  onSelectGroups,
}: PeopleFeedTopNavProps) {
  const select = (id: PeopleFlatDestination) => {
    if (id === "duo") onSelectDuo();
    else if (id === "discover") onSelectDiscover();
    else if (id === "plans") onSelectPlans();
    else onSelectGroups();
  };

  /** Notch/nav band only — Home browse fade height class; no first-card overhang. */
  const fadeHeight = `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_FEED_TOP_FADE_BELOW_SAFE_PX}px)`;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[32]"
      data-people-feed-top-chrome="true"
    >
      {/* Paint-only fade — capsule owns glass blur. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: fadeHeight,
          background: "var(--gradient-from-top)",
        }}
        aria-hidden
        data-people-feed-top-fade="true"
        data-people-feed-top-fade-soft="true"
        data-people-feed-top-fade-frost={
          frostedScrollThrough ? "true" : undefined
        }
      />
      <nav
        className="pointer-events-none relative flex justify-center px-[var(--people-feed-gutter,var(--gutter))]"
        style={{
          top: peopleFeedTopNavOffset(),
          height: "var(--people-feed-top-nav-h, 40px)",
        }}
        data-people-feed-top-nav="true"
        aria-label="People categories"
      >
        <div
          className={[
            "pointer-events-auto flex h-9 w-fit max-w-full items-center",
            "gap-0.5 max-[360px]:gap-0",
            "rounded-full border border-transparent p-[2px]",
            "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
            "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
            "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
          ].join(" ")}
          style={{
            maxWidth: `min(${PEOPLE_FEED_TOP_NAV_PILL_MAX_W_PX}px, 100%)`,
          }}
          data-people-feed-top-nav-pill="true"
          data-people-feed-top-nav-compact="true"
        >
          {PEOPLE_FLAT_DESTINATION_ORDER.map((id) => {
            const active = activeDestination === id;
            const locked = id === "discover" && !discoverEnabled;
            const groupsYours =
              id === "groups" && groupsPillState === "yours" && active;
            const Icon = DEST_ICON[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => select(id)}
                aria-current={active ? "page" : undefined}
                aria-label={LABEL[id]}
                data-people-feed-dest={id}
                data-people-feed-dest-active={active ? "true" : "false"}
                data-people-duo-dest={id === "duo" ? "true" : undefined}
                className={[
                  "relative inline-flex h-8 min-h-[32px] shrink-0 items-center justify-center",
                  "gap-1 max-[360px]:gap-0.5",
                  "rounded-full px-2.5 max-[360px]:px-1.5",
                  "text-[13px] max-[360px]:text-[12px] font-semibold leading-none tracking-tight",
                  "touch-manipulation transition active:scale-[0.97]",
                  "whitespace-nowrap",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-[var(--brand)]",
                  active
                    ? groupsYours
                      ? "bg-[rgb(34,197,94)] text-white"
                      : "bg-[var(--brand)] text-[var(--brand-ink)]"
                    : id === "duo"
                      ? "bg-transparent font-bold text-[var(--text)]/80"
                      : "bg-transparent text-[var(--text)]/72",
                ].join(" ")}
              >
                {locked ? (
                  <PiLockSimpleBold
                    className="h-3.5 w-3.5 shrink-0 opacity-70"
                    aria-hidden
                  />
                ) : (
                  <Icon
                    className="h-3.5 w-3.5 shrink-0 opacity-90"
                    aria-hidden
                    data-people-feed-dest-icon={id}
                  />
                )}
                <span className="whitespace-nowrap">{LABEL[id]}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
