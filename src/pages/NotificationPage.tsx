import PrimaryPageContainer from "../components/container/PrimaryPageContainer";

function NotificationPage() {
  return (
    <PrimaryPageContainer back>
      <div className="w-full px-[1px] flex flex-col gap-2 relative">
        {[...Array(10)].map((_, index) => (
          <div
            className="w-full rounded-lg p-3 gap-3 flex bg-background"
            key={index}
          >
            <div className="rounded-lg bg-image h-14 w-14 shrink-0"></div>
            <p className="text-white opacity-70 text-xs">
              If you could live anywhere in the world, where would you pick? If
              you could live anywhere in the world, where would you pick?
            </p>
          </div>
        ))}
      </div>
    </PrimaryPageContainer>
  );
}

export default NotificationPage;
