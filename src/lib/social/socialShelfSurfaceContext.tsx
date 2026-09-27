import { createContext, useContext, type ReactNode } from "react";
import type { SocialShelfSurface } from "./socialShelfSurface";

const SocialShelfSurfaceContext = createContext<SocialShelfSurface>("feed");

export function SocialShelfSurfaceProvider({
  surface,
  children,
}: {
  surface: SocialShelfSurface;
  children: ReactNode;
}) {
  return (
    <SocialShelfSurfaceContext.Provider value={surface}>
      {children}
    </SocialShelfSurfaceContext.Provider>
  );
}

export function useSocialShelfSurface(): SocialShelfSurface {
  return useContext(SocialShelfSurfaceContext);
}
