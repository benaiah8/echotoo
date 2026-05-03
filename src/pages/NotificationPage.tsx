import { useEffect } from "react";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import NotificationList from "../components/notifications/NotificationList";
import { useTabActive } from "../router/PersistentTabContainer.new";
import useScrollDirection from "../hooks/useScrollDirection";
import { dispatchBottomTabPeek } from "../lib/bottomTabPeek";

function NotificationPage() {
  // [FIX] Use parent tab active status - only fetch when Notifications tab is visible
  const isNotificationsVisible = useTabActive("notifications");
  const scrollDir = useScrollDirection();

  useEffect(() => {
    if (!isNotificationsVisible) return;
    dispatchBottomTabPeek("notifications", scrollDir === "down");
  }, [scrollDir, isNotificationsVisible]);

  return (
    <PrimaryPageContainer back capacitorNotchScrim>
      <div className="w-full flex flex-col relative min-h-0">
        <NotificationList isVisible={isNotificationsVisible} />
      </div>
    </PrimaryPageContainer>
  );
}

export default NotificationPage;
