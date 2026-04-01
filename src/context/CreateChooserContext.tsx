import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import CreateChooserOverlay from "../components/create/CreateChooserOverlay";

type CreateChooserContextValue = {
  isOpen: boolean;
  openChooser: () => void;
  closeChooser: () => void;
};

const CreateChooserContext = createContext<CreateChooserContextValue | null>(
  null
);

/** Stable fallback so BottomTab never crashes if context is missing (e.g. duplicate React, test harness). */
const CREATE_CHOOSER_FALLBACK: CreateChooserContextValue = {
  isOpen: false,
  openChooser: () => {},
  closeChooser: () => {},
};

let missingProviderWarned = false;

/**
 * Chooser state for the floating create tab. Prefer wrapping the app with
 * {@link CreateChooserProvider}; if context is unavailable, returns a no-op
 * implementation instead of throwing (avoids blank screen from an uncaught error).
 */
export function useCreateChooser(): CreateChooserContextValue {
  const ctx = useContext(CreateChooserContext);
  if (ctx) return ctx;
  if (import.meta.env.DEV && !missingProviderWarned) {
    missingProviderWarned = true;
    console.warn(
      "[useCreateChooser] CreateChooserProvider missing — create chooser is disabled. " +
        "Ensure the app root wraps routes with CreateChooserProvider and only one React copy is bundled."
    );
  }
  return CREATE_CHOOSER_FALLBACK;
}

export function CreateChooserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const openChooser = useCallback(() => setOpen(true), []);
  const closeChooser = useCallback(() => setOpen(false), []);

  // Dismiss when route changes (e.g. another tab navigated)
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const value = useMemo(
    () => ({
      isOpen: open,
      openChooser,
      closeChooser,
    }),
    [open, openChooser, closeChooser]
  );

  return (
    <CreateChooserContext.Provider value={value}>
      {children}
      <CreateChooserOverlay open={open} onClose={closeChooser} />
    </CreateChooserContext.Provider>
  );
}
