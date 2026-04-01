import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import NotificationList from "../components/notifications/NotificationList";
import { useTabActive } from "../router/PersistentTabContainer.new";

function NotificationPage() {
  // [FIX] Use parent tab active status - only fetch when Notifications tab is visible
  const isNotificationsVisible = useTabActive("notifications");

  return (
    <PrimaryPageContainer back topSafeArea>
      <div className="w-full flex flex-col relative">
        <NotificationList isVisible={isNotificationsVisible} />
      </div>
    </PrimaryPageContainer>
  );
}

export default NotificationPage;
