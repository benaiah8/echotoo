import { useEffect, useMemo } from "react";
import { useCreateFlowNotices } from "./CreateFlowNoticeContext";
import { useCreatePostMedia } from "./CreatePostMediaProvider";

const POST_IMAGE_UPLOAD_NOTICE_ID = "create-flow-post-image-upload";

/**
 * Mirrors in-flight post image upload jobs into {@link CreateFlowNoticeStack}
 * on Activities + Categories (stack visibility is route-gated there).
 */
export default function CreateFlowUploadNoticeBridge() {
  const { jobs } = useCreatePostMedia();
  const { upsertNotice, removeNotice } = useCreateFlowNotices();

  const uploadingCount = useMemo(
    () => jobs.filter((j) => j.status === "uploading").length,
    [jobs]
  );

  useEffect(() => {
    if (uploadingCount === 0) {
      removeNotice(POST_IMAGE_UPLOAD_NOTICE_ID);
      return;
    }
    const message =
      uploadingCount === 1
        ? "1 image uploading"
        : `${uploadingCount} images uploading`;
    upsertNotice({
      id: POST_IMAGE_UPLOAD_NOTICE_ID,
      variant: "progress",
      message,
      indeterminate: true,
    });
  }, [uploadingCount, upsertNotice, removeNotice]);

  useEffect(() => {
    return () => removeNotice(POST_IMAGE_UPLOAD_NOTICE_ID);
  }, [removeNotice]);

  return null;
}
