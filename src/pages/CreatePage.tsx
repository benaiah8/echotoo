// src/pages/CreatePage.tsx
import React, { useEffect } from "react";
import { subscribeAndroidHardwareBack } from "../lib/androidPostDetailModalBack";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowLandingColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CreateChooserPanel from "../components/create/CreateChooserPanel";
import CreateDraftEntryDialog from "../components/create/CreateDraftEntryDialog";
import { useCreateDraftEntryGate } from "../hooks/useCreateDraftEntryGate";

/**
 * Direct /create visits (bookmark, deep link): same chooser as + overlay, full-page shell.
 */
export default function CreatePage() {
  const { onPickerContinue, draftEntryDialogProps } = useCreateDraftEntryGate({
    navDelayMs: 0,
  });

  useEffect(() => {
    if (!draftEntryDialogProps.open) return;
    return subscribeAndroidHardwareBack(() => {
      draftEntryDialogProps.onDismiss();
    });
  }, [draftEntryDialogProps.open, draftEntryDialogProps.onDismiss]);

  return (
    <PrimaryPageContainer topSafeArea capacitorNotchScrim>
      <CreateFlowKeyboardShell>
        <div
          className="flex-1 w-full px-4"
          style={createFlowLandingColumnStyle}
        >
          <div className="min-h-[calc(100vh-88px)] flex flex-col items-center justify-center py-6">
            <CreateChooserPanel variant="page" onContinue={onPickerContinue} />
          </div>
        </div>
      </CreateFlowKeyboardShell>
      <CreateDraftEntryDialog {...draftEntryDialogProps} />
    </PrimaryPageContainer>
  );
}
