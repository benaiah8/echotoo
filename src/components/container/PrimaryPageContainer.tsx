import { ReactNode, useEffect } from "react";
import BottomTab from "../BottomTab";

function PrimaryPageContainer({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="w-full flex flex-col bg-black min-h-screen text-black items-center justify-center">
      <div className="h-screen overflow-scroll scroll-hide w-full max-w-sm bg-black flex flex-col relative text-white">
        <div className="flex flex-1 p-3 flex-col relative">{children}</div>
        <BottomTab />
      </div>
    </div>
  );
}

export default PrimaryPageContainer;
