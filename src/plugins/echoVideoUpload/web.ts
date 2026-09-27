import { WebPlugin } from "@capacitor/core";
import { ECHO_VIDEO_UPLOAD_ERROR } from "./errors";
import { validateEchoVideoUploadOptions } from "./validateOptions";
import type {
  EchoVideoUploadAccepted,
  EchoVideoUploadCancelOptions,
  EchoVideoUploadCancelResult,
  EchoVideoUploadCapabilities,
  EchoVideoUploadOptions,
  EchoVideoUploadPlugin,
} from "./definitions";

/**
 * Web stub — native streaming upload is Capacitor Android/iOS only.
 * Browser continues to use tus-js-client (unchanged).
 */
export class EchoVideoUploadWeb
  extends WebPlugin
  implements EchoVideoUploadPlugin
{
  async getCapabilities(): Promise<EchoVideoUploadCapabilities> {
    return {
      available: false,
      implementation: "web-stub",
      streaming: false,
    };
  }

  async startVideoUpload(
    options: EchoVideoUploadOptions,
  ): Promise<EchoVideoUploadAccepted> {
    const invalid = validateEchoVideoUploadOptions(options);
    if (invalid) {
      throw this.errorWithCode(
        ECHO_VIDEO_UPLOAD_ERROR.invalid_options,
        invalid,
      );
    }
    throw this.errorWithCode(
      ECHO_VIDEO_UPLOAD_ERROR.not_implemented,
      "EchoVideoUpload streaming is not available on web (PASS P1)",
    );
  }

  async cancelVideoUpload(
    options: EchoVideoUploadCancelOptions,
  ): Promise<EchoVideoUploadCancelResult> {
    if (!options?.jobId?.trim()) {
      throw this.errorWithCode(
        ECHO_VIDEO_UPLOAD_ERROR.invalid_options,
        "jobId is required",
      );
    }
    return { cancelled: false };
  }

  private errorWithCode(code: string, message: string): Error {
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    return err;
  }
}
