import { ReactNode, useEffect } from "react";

function GlobalErrorHandler({ children }: { children: ReactNode }) {
  // Capture "Maximum update depth exceeded" errors
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      const errorMessage = args[0]?.toString() || "";
      if (errorMessage.includes("Maximum update depth exceeded")) {
        // Track error count for debugging
        if (typeof window !== "undefined") {
          (window as any).__maxUpdateDepthErrors = ((window as any).__maxUpdateDepthErrors || 0) + 1;
        }
      }
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);

  return <div className="w-full flex flex-col">{children}</div>;
}

export default GlobalErrorHandler;
