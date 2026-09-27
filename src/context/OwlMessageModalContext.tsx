import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import OwlMessageModal from "../components/ui/OwlMessageModal";

export type OwlMessageModalContextValue = {
  isOpen: boolean;
  /** Opens the owl games overlay. */
  openOwlMessage: () => void;
  closeOwlMessage: () => void;
};

const OwlMessageModalContext =
  createContext<OwlMessageModalContextValue | null>(null);

const FALLBACK: OwlMessageModalContextValue = {
  isOpen: false,
  openOwlMessage: () => {},
  closeOwlMessage: () => {},
};

let missingProviderWarned = false;

export function useOwlMessageModal(): OwlMessageModalContextValue {
  const ctx = useContext(OwlMessageModalContext);
  if (ctx) return ctx;
  if (import.meta.env.DEV && !missingProviderWarned) {
    missingProviderWarned = true;
    console.warn(
      "[useOwlMessageModal] OwlMessageModalProvider missing — owl games overlay is disabled."
    );
  }
  return FALLBACK;
}

/**
 * Global owl games overlay (full-screen frosted). Wire triggers via {@link useOwlMessageModal}.
 * Quote cycling files (`owlMessages.ts` / `owlMessagesStorage.ts`) are left in the repo unused by this overlay.
 */
export function OwlMessageModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const location = useLocation();

  const closeOwlMessage = useCallback(() => {
    setModalOpen(false);
  }, []);

  const openOwlMessage = useCallback(() => {
    setModalOpen(true);
  }, []);

  useEffect(() => {
    setModalOpen(false);
  }, [location.pathname]);

  const value = useMemo(
    () => ({
      isOpen: modalOpen,
      openOwlMessage,
      closeOwlMessage,
    }),
    [modalOpen, openOwlMessage, closeOwlMessage]
  );

  return (
    <OwlMessageModalContext.Provider value={value}>
      {children}
      <OwlMessageModal open={modalOpen} onClose={closeOwlMessage} />
    </OwlMessageModalContext.Provider>
  );
}
