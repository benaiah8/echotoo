import { WebPlugin } from "@capacitor/core";
import { ECHO_VIDEO_PREPARE_ERROR } from "./errors";
import { validateEchoVideoPrepareOptions } from "./validateOptions";
import type {
  EchoVideoPrepareAccepted,
  EchoVideoPrepareCancelOptions,
  EchoVideoPrepareCancelResult,
  EchoVideoPrepareCapabilities,
  EchoVideoPrepareOptions,
  EchoVideoPreparePlugin,
} from "./definitions";

/**
 * Web stub — preparation is native-only. Keeps registerPlugin typed on web.
 */
export class EchoVideoPrepareWeb
  extends WebPlugin
  implements EchoVideoPreparePlugin
{
  async getCapabilities(): Promise<EchoVideoPrepareCapabilities> {
    return {
      available: false,
      implementation: "web-stub",
      encoderImplemented: false,
    };
  }

  async prepareVideo(
    options: EchoVideoPrepareOptions,
  ): Promise<EchoVideoPrepareAccepted> {
    const invalid = validateEchoVideoPrepareOptions(options);
    if (invalid) {
      throw this.errorWithCode(
        ECHO_VIDEO_PREPARE_ERROR.invalid_options,
        invalid,
      );
    }
    throw this.errorWithCode(
      ECHO_VIDEO_PREPARE_ERROR.not_implemented,
      "EchoVideoPrepare encoder is not available on web (PASS C1 shell)",
    );
  }

  async cancelPreparation(
    options: EchoVideoPrepareCancelOptions,
  ): Promise<EchoVideoPrepareCancelResult> {
    if (!options?.jobId?.trim()) {
      throw this.errorWithCode(
        ECHO_VIDEO_PREPARE_ERROR.invalid_options,
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
