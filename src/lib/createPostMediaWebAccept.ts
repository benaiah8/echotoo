import { CREATE_VIDEO_FILE_ACCEPT } from "./createDraftVideo/createVideoConstraints";

/** Unified web library input: images + public Create video MIME types (MP4/MOV). */
export const CREATE_POST_MEDIA_WEB_LIBRARY_ACCEPT = [
  "image/*",
  CREATE_VIDEO_FILE_ACCEPT,
].join(",");
