import { ReactNode } from "react";

function GlobalErrorHandler({ children }: { children: ReactNode }) {
  return <div className="w-full flex flex-col">{children}</div>;
}

export default GlobalErrorHandler;
