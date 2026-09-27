// src/pages/CreatePage.tsx
import React, { useEffect, useRef } from "react";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell from "../components/create/CreateFlowKeyboardShell";
import { useCreateChooser } from "../context/CreateChooserContext";

/**
 * Direct /create visits (bookmark, deep link): same entry as main Create (+) —
 * draft gate then finalize as Place (`experience`). Chooser panel kept elsewhere
 * for legacy `openChooser()` callers; this route no longer shows it.
 */
export default function CreatePage() {
  const { enterCreateAsDefaultPost } = useCreateChooser();
  const enteredRef = useRef(false);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    enterCreateAsDefaultPost();
  }, [enterCreateAsDefaultPost]);

  return (
    <PrimaryPageContainer topSafeArea capacitorNotchScrim>
      <CreateFlowKeyboardShell>
        <div className="flex-1 w-full" aria-busy="true" aria-label="Opening create" />
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
