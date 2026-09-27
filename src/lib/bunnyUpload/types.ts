export type PostMediaVideoStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

type BunnyUploadInitBase = {
  mediaId: string;
  videoId: string;
  libraryId: string;
  videoStatus: PostMediaVideoStatus;
  reused?: boolean;
};

export type BunnyUploadInitUploadRequired = BunnyUploadInitBase & {
  uploadRequired: true;
  tusEndpoint: string;
  authorizationExpire: number;
  authorizationSignature: string;
};

export type BunnyUploadInitNoUpload = BunnyUploadInitBase & {
  uploadRequired: false;
};

export type BunnyUploadInitResponse =
  | BunnyUploadInitUploadRequired
  | BunnyUploadInitNoUpload;

export function isUploadRequiredInit(
  init: BunnyUploadInitResponse,
): init is BunnyUploadInitUploadRequired {
  return init.uploadRequired === true;
}
