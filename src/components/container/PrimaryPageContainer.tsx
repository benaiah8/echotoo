import { ReactNode, useEffect } from "react";
import BottomTab from "../BottomTab";
import HeaderBack from "../HeaderBack";

function PrimaryPageContainer({
  children,
  back = false,
}: {
  children: ReactNode;
  back?: boolean;
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="w-full flex flex-col bg-black min-h-screen text-black items-center justify-center">
      <div className="h-screen overflow-scroll scroll-hide w-full max-w-sm bg-black flex flex-col relative text-white">
        {back ? <HeaderBack /> : <></>}
        <div className="flex flex-1 p-3 flex-col relative">{children}</div>
        <BottomTab />
      </div>
    </div>
  );
}

export default PrimaryPageContainer;
