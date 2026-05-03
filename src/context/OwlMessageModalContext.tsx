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
import { OWL_MESSAGES } from "../lib/owlMessages";
import {
  advanceOwlMessageAfterClose,
  getCurrentOwlMessageEntry,
  loadOwlMessagesState,
  type OwlMessagesPersisted,
} from "../lib/owlMessagesStorage";

export type OwlMessageModalContextValue = {
  isOpen: boolean;
  /** Opens the modal showing the current shuffled line (does not advance). */
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
      "[useOwlMessageModal] OwlMessageModalProvider missing — owl message modal is disabled."
    );
  }
  return FALLBACK;
}

/**
 * Global owl message card (frosted). Wire triggers via {@link useOwlMessageModal}.
 * Shuffled order + cursor live in localStorage (see {@link loadOwlMessagesState}).
 * Cursor advances when the modal closes so the next open shows the next line (wraps).
 */
export function OwlMessageModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [owlPersisted, setOwlPersisted] = useState<OwlMessagesPersisted>(() =>
    loadOwlMessagesState()
  );
  const location = useLocation();

  const closeOwlMessage = useCallback(() => {
    setModalOpen(false);
    setOwlPersisted((prev) => advanceOwlMessageAfterClose(prev));
  }, []);

  const openOwlMessage = useCallback(() => {
    setModalOpen(true);
  }, []);

  useEffect(() => {
    setModalOpen(false);
  }, [location.pathname]);

  const { message, messageCategory } = useMemo(() => {
    const entry = getCurrentOwlMessageEntry(owlPersisted, OWL_MESSAGES);
    return {
      message: entry?.text ?? "",
      messageCategory: entry?.category,
    };
  }, [owlPersisted]);

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
      <OwlMessageModal
        open={modalOpen}
        onClose={closeOwlMessage}
        message={message}
        messageCategory={messageCategory}
      />
    </OwlMessageModalContext.Provider>
  );
}
