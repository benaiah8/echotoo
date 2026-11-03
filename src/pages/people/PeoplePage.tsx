import { useCallback, useEffect, useState } from "react";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { resetPeoplePhotoPromptSession } from "../../lib/peoplePhotoPromptSession";
import { shouldSuppressUnderlyingBackForPhotoPrompt } from "../../lib/pairUpPhotoPromptStore";
import { shouldSuppressUnderlyingBackForMediaGalleryLightbox } from "../../lib/mediaGalleryLightboxBackGuard";
import {
  resetMineCandidateProfileBackGuard,
  shouldSuppressUnderlyingBackForMineCandidateProfile,
} from "../../lib/people/mineCandidateProfileOverlayBackGuard";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { PAIR_UP_DECK_KIND_DISCOVER } from "../../lib/pairUpCache";
import { useOpenPlanCandidates } from "../../hooks/useOpenPlanCandidates";
import { useGroupUpCandidates } from "../../hooks/useGroupUpCandidates";
import { usePairUpCandidates } from "../../hooks/usePairUpCandidates";
import {
  useClosePeople,
  useTabActive,
} from "../../router/PersistentTabContainer.new";
import MatchDeckOverlay from "./MatchDeckOverlay";
import {
  peopleDebugBumpRender,
} from "../../lib/people/peopleDeckDebug";

/**
 * Persistent People tab — vertical feed + global BottomTab.
 * Discover mounts warm by default; Plans/Groups stay lazy until first open.
 */
function PeoplePage() {
  peopleDebugBumpRender("peoplePage");

  const isPeopleVisible = useTabActive("people");
  const { closePeople } = useClosePeople();
  /** Discover is the default category — keep its hook warm from first paint. */
  const [discoverOpened, setDiscoverOpened] = useState(true);
  const [openPlansOpened, setOpenPlansOpened] = useState(false);
  const [groupUpsOpened, setGroupUpsOpened] = useState(false);
  const myPlans = usePairUpCandidates();
  const discover = usePairUpCandidates({
    kind: PAIR_UP_DECK_KIND_DISCOVER,
    enabled: discoverOpened,
  });
  const openPlans = useOpenPlanCandidates({
    enabled: openPlansOpened,
  });
  const groupUps = useGroupUpCandidates({
    enabled: groupUpsOpened,
  });

  const onRequestDiscoverMount = useCallback(() => {
    setDiscoverOpened(true);
  }, []);

  const onRequestOpenPlansMount = useCallback(() => {
    setOpenPlansOpened(true);
  }, []);

  const onRequestGroupUpsMount = useCallback(() => {
    setGroupUpsOpened(true);
  }, []);

  useEffect(() => {
    if (!isPeopleVisible) {
      resetPeoplePhotoPromptSession();
      resetMineCandidateProfileBackGuard();
      return;
    }
    syncAppSafeAreaBottom();
  }, [isPeopleVisible]);

  useEffect(() => {
    if (!isPeopleVisible) return;
    return subscribeAndroidHardwareBack(() => {
      if (shouldSuppressUnderlyingBackForPhotoPrompt()) return;
      if (shouldSuppressUnderlyingBackForMediaGalleryLightbox()) return;
      if (shouldSuppressUnderlyingBackForMineCandidateProfile()) return;
      /* Leave People tab — BottomTab remains the primary nav affordance. */
      closePeople();
    });
  }, [isPeopleVisible, closePeople]);

  return (
    <div
      className={[
        "people-route-surface flex h-screen max-h-screen w-full flex-col overflow-x-hidden overflow-y-hidden bg-[var(--app-canvas)] text-[var(--text)]",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        isPeopleVisible ? "people-route-surface--active" : "",
      ].join(" ")}
      data-people-route-surface
      data-people-route-active={isPeopleVisible ? "true" : "false"}
      data-people-feed-shell="true"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        /* Below BottomTab (z-40) so global nav stays clickable. */
        zIndex: isPeopleVisible ? 30 : undefined,
        position: "relative",
      }}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden">
        <MatchDeckOverlay
          myPlans={myPlans}
          discover={discoverOpened ? discover : null}
          openPlans={openPlansOpened ? openPlans : null}
          groupUps={groupUpsOpened ? groupUps : null}
          onRequestDiscoverMount={onRequestDiscoverMount}
          onRequestOpenPlansMount={onRequestOpenPlansMount}
          onRequestGroupUpsMount={onRequestGroupUpsMount}
          onClose={closePeople}
        />
      </div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .people-route-surface--active {
            animation: peopleRouteEnter 180ms ease-out;
          }
          @keyframes peopleRouteEnter {
            from { opacity: 0.96; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}

export default PeoplePage;
