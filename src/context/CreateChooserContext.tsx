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
import CreateDraftEntryDialog from "../components/create/CreateDraftEntryDialog";
import { useCreateDraftEntryGate } from "../hooks/useCreateDraftEntryGate";
import { subscribeAndroidHardwareBack } from "../lib/androidPostDetailModalBack";

type CreateChooserContextValue = {
  isOpen: boolean;
  openChooser: () => void;
  closeChooser: () => void;
  /**
   * Skip Event/Place chooser and enter finalize as Place (`experience`),
   * preserving owned-draft resume dialog + leave baseline.
   */
  enterCreateAsDefaultPost: () => void;
};

const CreateChooserContext = createContext<CreateChooserContextValue | null>(
  null
);

/** Stable fallback so BottomTab never crashes if context is missing (e.g. duplicate React, test harness). */
const CREATE_CHOOSER_FALLBACK: CreateChooserContextValue = {
  isOpen: false,
  openChooser: () => {},
  closeChooser: () => {},
  enterCreateAsDefaultPost: () => {},
};

let missingProviderWarned = false;

/**
 * Chooser + create-entry state for the floating create tab. Prefer wrapping the app with
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

  const { onPickerContinue, enterCreateAsDefaultPost, draftEntryDialogProps } =
    useCreateDraftEntryGate({
      closeChooserOverlay: closeChooser,
      // Main + skips chooser animation; legacy openChooser path still closes immediately.
      navDelayMs: 0,
    });

  // Dismiss chooser overlay when route changes (e.g. another tab navigated)
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Draft dialog can open without the chooser overlay (direct + / /create entry).
  useEffect(() => {
    if (!draftEntryDialogProps.open) return;
    return subscribeAndroidHardwareBack(() => {
      draftEntryDialogProps.onDismiss();
    });
  }, [draftEntryDialogProps.open, draftEntryDialogProps.onDismiss]);

  const value = useMemo(
    () => ({
      isOpen: open,
      openChooser,
      closeChooser,
      enterCreateAsDefaultPost,
    }),
    [open, openChooser, closeChooser, enterCreateAsDefaultPost]
  );

  return (
    <CreateChooserContext.Provider value={value}>
      {children}
      <CreateChooserOverlay
        open={open}
        onClose={closeChooser}
        onPickerContinue={onPickerContinue}
        draftGateOpen={draftEntryDialogProps.open}
        onDismissDraftGate={draftEntryDialogProps.onDismiss}
      />
      <CreateDraftEntryDialog {...draftEntryDialogProps} />
    </CreateChooserContext.Provider>
  );
}
