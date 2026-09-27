import type { PluginListenerHandle } from "@capacitor/core";

export type EchoVideoUploadBunnyHeaders = {
  AuthorizationSignature: string;
  AuthorizationExpire: string;
  VideoId: string;
  LibraryId: string;
};

export type EchoVideoUploadMetadata = {
  filetype: string;
  title: string;
};

export type EchoVideoUploadOptions = {
  jobId: string;
  /** Relative path under Directory.Data (create-drafts/...) or absolute under filesDir. */
  filePath: string;
  tusEndpoint: string;
  headers: EchoVideoUploadBunnyHeaders;
  fileSize: number;
  metadata: EchoVideoUploadMetadata;
  /** Optional existing TUS upload URL for resume (P2 draft persistence). */
  uploadUrl?: string | null;
};

export type EchoVideoUploadCancelOptions = {
  jobId: string;
};

export type EchoVideoUploadCancelResult = {
  cancelled: boolean;
};

export type EchoVideoUploadCapabilities = {
  available: boolean;
  implementation: "android-native-tus" | "ios-urlsession" | "web-stub";
  streaming: boolean;
};

export type EchoVideoUploadAccepted = {
  jobId: string;
  accepted: true;
};

export type UploadProgressEvent = {
  jobId: string;
  bytesUploaded: number;
  bytesTotal: number;
  /** 0..1 */
  progress: number;
};

export type UploadCreatedEvent = {
  jobId: string;
  uploadUrl: string;
};

export type UploadCompletedEvent = {
  jobId: string;
  uploadUrl: string;
  bytesUploaded: number;
  bytesTotal: number;
};

export type UploadFailedEvent = {
  jobId: string;
  code: string;
  message?: string;
};

export type UploadCancelledEvent = {
  jobId: string;
};

export interface EchoVideoUploadPlugin {
  getCapabilities(): Promise<EchoVideoUploadCapabilities>;
  startVideoUpload(
    options: EchoVideoUploadOptions,
  ): Promise<EchoVideoUploadAccepted>;
  cancelVideoUpload(
    options: EchoVideoUploadCancelOptions,
  ): Promise<EchoVideoUploadCancelResult>;
  addListener(
    eventName: "uploadProgress",
    listenerFunc: (event: UploadProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "uploadCreated",
    listenerFunc: (event: UploadCreatedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "uploadCompleted",
    listenerFunc: (event: UploadCompletedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "uploadFailed",
    listenerFunc: (event: UploadFailedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "uploadCancelled",
    listenerFunc: (event: UploadCancelledEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
