import type { PluginListenerHandle } from "@capacitor/core";

export type EchoVideoPrepareOptions = {
  jobId: string;
  /** Relative path under Directory.Data (or absolute/file URI). */
  sourcePath: string;
  destinationPath: string;
  temporaryPath: string;
  /**
   * Policy "720p/1080p" short-edge target (historically named targetLongEdge).
   * Native Android maps this with Presentation.createForShortSide — not the
   * literal longest pixel dimension.
   */
  targetLongEdge: number;
  /** Video bitrate in bits per second. */
  targetVideoBitrate: number;
  targetFps: number;
  /** Audio bitrate in bits per second. */
  audioBitrate: number;
};

export type EchoVideoPrepareCancelOptions = {
  jobId: string;
};

export type EchoVideoPrepareCancelResult = {
  cancelled: boolean;
};

export type EchoVideoPrepareCapabilities = {
  available: boolean;
  implementation: "android-media3" | "ios-avfoundation" | "web-stub";
  /** False on web; true on Android (Media3) and iOS (AVFoundation). */
  encoderImplemented: boolean;
};

export type EchoVideoPrepareAccepted = {
  jobId: string;
  accepted: true;
};

export type PrepareProgressEvent = {
  jobId: string;
  /** 0..1 when known; null = indeterminate. */
  progress: number | null;
};

export type PrepareCompletedEvent = {
  jobId: string;
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationMs: number;
  mimeType: string;
};

export type PrepareFailedEvent = {
  jobId: string;
  code: string;
  message?: string;
};

export type PrepareCancelledEvent = {
  jobId: string;
};

export interface EchoVideoPreparePlugin {
  getCapabilities(): Promise<EchoVideoPrepareCapabilities>;
  prepareVideo(
    options: EchoVideoPrepareOptions,
  ): Promise<EchoVideoPrepareAccepted>;
  cancelPreparation(
    options: EchoVideoPrepareCancelOptions,
  ): Promise<EchoVideoPrepareCancelResult>;
  addListener(
    eventName: "prepareProgress",
    listenerFunc: (event: PrepareProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "prepareCompleted",
    listenerFunc: (event: PrepareCompletedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "prepareFailed",
    listenerFunc: (event: PrepareFailedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "prepareCancelled",
    listenerFunc: (event: PrepareCancelledEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
