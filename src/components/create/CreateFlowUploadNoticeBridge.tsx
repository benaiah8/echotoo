import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useCreateFlowNotices } from "./CreateFlowNoticeContext";
import { useCreatePostMedia } from "./CreatePostMediaProvider";
import { resolveCreateFlowUploadNoticeMessage } from "../../lib/createFlowUploadNotice";
import { isVideoUploadInProgress } from "../../lib/createPostVideoUpload";

const POST_MEDIA_UPLOAD_NOTICE_ID = "create-flow-post-media-upload";

/**
 * Mirrors in-flight post media upload jobs into {@link CreateFlowNoticeStack}.
 */
export default function CreateFlowUploadNoticeBridge() {
  const { pathname } = useLocation();
  const { jobs, videoJob, localVideoIngestPending, videoPreparing } =
    useCreatePostMedia();
  const { upsertNotice, removeNotice } = useCreateFlowNotices();

  const imageUploadingCount = useMemo(
    () => jobs.filter((j) => j.status === "uploading").length,
    [jobs],
  );

  const videoUploadingCount = useMemo(
    () => (isVideoUploadInProgress(videoJob) ? 1 : 0),
    [videoJob],
  );

  const videoAddingCount = useMemo(
    () => (localVideoIngestPending ? 1 : 0),
    [localVideoIngestPending],
  );

  const videoPreparingCount = videoPreparing ? 1 : 0;

  const message = useMemo(
    () =>
      resolveCreateFlowUploadNoticeMessage({
        pathname,
        imageUploadingCount,
        videoUploadingCount,
        videoAddingCount,
        videoPreparingCount,
      }),
    [
      imageUploadingCount,
      pathname,
      videoAddingCount,
      videoPreparingCount,
      videoUploadingCount,
    ],
  );

  useEffect(() => {
    if (!message) {
      removeNotice(POST_MEDIA_UPLOAD_NOTICE_ID);
      removeNotice("create-flow-post-image-upload");
      return;
    }
    upsertNotice({
      id: POST_MEDIA_UPLOAD_NOTICE_ID,
      variant: "progress",
      message,
      indeterminate: true,
    });
  }, [message, upsertNotice, removeNotice]);

  useEffect(() => {
    return () => {
      removeNotice(POST_MEDIA_UPLOAD_NOTICE_ID);
      removeNotice("create-flow-post-image-upload");
    };
  }, [removeNotice]);

  return null;
}
