import { Outlet } from "react-router-dom";
import { CreateFlowNoticeProvider } from "./CreateFlowNoticeContext";
import CreateFlowNoticeStack from "./CreateFlowNoticeStack";
import { CreatePostMediaProvider } from "./CreatePostMediaProvider";
import CreateFlowUploadNoticeBridge from "./CreateFlowUploadNoticeBridge";

/**
 * Shared layout for the entire `/create/*` wizard.
 * Keeps {@link CreatePostMediaProvider} mounted across step navigation (Phase 1: provider is inert).
 */
export default function CreateFlowLayout() {
  return (
    <CreatePostMediaProvider>
      <CreateFlowNoticeProvider>
        <CreateFlowUploadNoticeBridge />
        <Outlet />
        <CreateFlowNoticeStack />
      </CreateFlowNoticeProvider>
    </CreatePostMediaProvider>
  );
}
