import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import NotificationList from "../components/notifications/NotificationList";

function NotificationPage() {
  return (
    <PrimaryPageContainer back>
      <div className="w-full flex flex-col relative">
        <NotificationList />
      </div>
    </PrimaryPageContainer>
  );
}

export default NotificationPage;
