// src/pages/CreatePage.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import CreateFlowKeyboardShell, {
  createFlowLandingColumnStyle,
} from "../components/create/CreateFlowKeyboardShell";
import CreateChooserPanel from "../components/create/CreateChooserPanel";
import { Paths } from "../router/Paths";

/**
 * Direct /create visits (bookmark, deep link): same chooser as + overlay, full-page shell.
 */
export default function CreatePage() {
  const navigate = useNavigate();

  const handleContinue = (type: "hangout" | "experience") => {
    navigate(`${Paths.createActivities}?type=${type}`);
  };

  return (
    <PrimaryPageContainer topSafeArea capacitorNotchScrim>
      <CreateFlowKeyboardShell>
        <div
          className="flex-1 w-full px-4"
          style={createFlowLandingColumnStyle}
        >
          <div className="min-h-[calc(100vh-88px)] flex flex-col items-center justify-center py-6">
            <CreateChooserPanel variant="page" onContinue={handleContinue} />
          </div>
        </div>
      </CreateFlowKeyboardShell>
    </PrimaryPageContainer>
  );
}
